// 应用层：把数据层（localStorage）与判定层（rules）组合成界面可调用的操作
// 所有变更都原子写回，刷新后工卡 / 工具 / 缺件 / 版本链保持一致

import { useCallback, useMemo, useState } from "react";
import { loadDatabase, saveDatabase, seedDatabase } from "../data/store";
import type {
  ActionResult,
  CardSnapshot,
  Conflict,
  Database,
  MissingTag,
  NewCardInput,
  ToolLoan,
  WorkCard,
} from "../data/types";
import { closeBlockers, signBlockers, snapshotOf, validateCard } from "../domain/rules";

function now(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function useDatabase() {
  const [db, setDb] = useState<Database>(() => loadDatabase());

  const commit = useCallback((next: Database) => {
    saveDatabase(next);
    setDb(next);
  }, []);

  const mutateCard = useCallback(
    (cardId: string, fn: (card: WorkCard) => WorkCard): Database | null => {
      let result: Database | null = null;
      setDb((current) => {
        const next: Database = {
          ...current,
          cards: current.cards.map((c) =>
            c.id === cardId ? { ...fn(c), updatedAt: now() } : c,
          ),
        };
        saveDatabase(next);
        result = next;
        return next;
      });
      return result;
    },
    [],
  );

  const getCard = useCallback((cardId: string) => db.cards.find((c) => c.id === cardId), [db]);

  const setOperator = useCallback(
    (operator: string) => commit({ ...db, operator }),
    [db, commit],
  );

  // ---------- 建工卡 ----------
  const createCard = useCallback(
    (input: NewCardInput): string => {
      const id = `WO-${String(db.seq + 1).padStart(3, "0")}`;
      const loans: ToolLoan[] = input.toolIds.map((toolId) => ({
        toolId,
        start: input.start,
        end: input.end,
        returnedAt: null,
        returnCalibrationOk: null,
        returnNote: "",
      }));
      const card: WorkCard = {
        id,
        airframe: input.airframe.trim(),
        ata: input.ata.trim(),
        stand: input.stand.trim(),
        start: input.start,
        end: input.end,
        loans,
        tags: [],
        status: "draft",
        signer: null,
        signedAt: null,
        versions: [],
        createdAt: now(),
        updatedAt: now(),
      };
      commit({ ...db, seq: db.seq + 1, cards: [card, ...db.cards] });
      return id;
    },
    [db, commit],
  );

  // ---------- 草稿 / 已提交工卡：字段编辑 ----------
  const patchCard = useCallback(
    (cardId: string, patch: Partial<CardSnapshot>): ActionResult => {
      const card = db.cards.find((c) => c.id === cardId);
      if (!card) return notFound(cardId);
      if (card.status === "signed" || card.status === "closed") {
        return {
          ok: false,
          conflicts: [frozenConflict(card.id, "直接修改字段", card.status)],
        };
      }
      mutateCard(cardId, (c) => ({ ...c, ...patch }));
      return { ok: true };
    },
    [db, mutateCard],
  );

  // ---------- 提交（整卡校验，任何一条冲突都拒绝） ----------
  const submitCard = useCallback(
    (cardId: string): ActionResult => {
      const card = db.cards.find((c) => c.id === cardId);
      if (!card) return notFound(cardId);
      if (card.status === "signed" || card.status === "closed") {
        return { ok: false, conflicts: [frozenConflict(card.id, "提交", card.status)] };
      }
      const conflicts = validateCard(db, cardId, snapshotOf(card));
      if (conflicts.length > 0) return { ok: false, conflicts };
      mutateCard(cardId, (c) => ({ ...c, status: "active" }));
      return { ok: true };
    },
    [db, mutateCard],
  );

  // ---------- 签署：缺件必须清零，通过后冻结并固化基线版本 ----------
  const signCard = useCallback(
    (cardId: string): ActionResult => {
      const card = db.cards.find((c) => c.id === cardId);
      if (!card) return notFound(cardId);
      if (card.status === "signed" || card.status === "closed") {
        return { ok: false, conflicts: [frozenConflict(card.id, "签署", card.status)] };
      }
      const conflicts = signBlockers(db, card);
      if (conflicts.length > 0) return { ok: false, conflicts };

      const ts = now();
      mutateCard(cardId, (c) => ({
        ...c,
        status: "signed",
        signer: db.operator.trim() || "未署名",
        signedAt: ts,
        versions: [
          ...c.versions,
          { version: c.versions.length + 1, reason: "签署基线", createdBy: db.operator.trim() || "未署名", createdAt: ts, snapshot: snapshotOf(c) },
        ],
      }));
      return { ok: true };
    },
    [db, mutateCard],
  );

  // ---------- 签署后补录：带原因另存版本，原卡冻结内容按新版本快照推进 ----------
  const addendumCard = useCallback(
    (cardId: string, reason: string, candidate: CardSnapshot): ActionResult => {
      const card = db.cards.find((c) => c.id === cardId);
      if (!card) return notFound(cardId);
      if (card.status !== "signed") {
        return {
          ok: false,
          conflicts: [
            {
              kind: "state",
              title: `工卡 ${cardId} 不可补录`,
              message: "只有已签署冻结的工卡才能补录；未签署工卡请直接编辑",
              facts: [{ label: "当前状态原值", value: card.status }],
            },
          ],
        };
      }
      if (!reason.trim()) {
        return {
          ok: false,
          conflicts: [
            {
              kind: "field",
              title: "补录原因必填",
              message: "签署后的补录只能带原因另存版本",
              facts: [{ label: "补录原因原值", value: "空" }],
            },
          ],
        };
      }
      // 补录版本同样要过全部判定（缺件清零、无冲突）
      const conflicts = validateCard(db, cardId, candidate, { requireTagsClear: true });
      if (conflicts.length > 0) return { ok: false, conflicts };

      const ts = now();
      mutateCard(cardId, (c) => ({
        ...c,
        ...candidate,
        versions: [
          ...c.versions,
          {
            version: c.versions.length + 1,
            reason: reason.trim(),
            createdBy: db.operator.trim() || "未署名",
            createdAt: ts,
            snapshot: candidate,
          },
        ],
      }));
      return { ok: true };
    },
    [db, mutateCard],
  );

  // ---------- 缺件挂签：新增 / 解除 ----------
  const addTag = useCallback(
    (cardId: string, tag: Omit<MissingTag, "id" | "createdAt" | "resolvedAt" | "resolution">): ActionResult => {
      const card = db.cards.find((c) => c.id === cardId);
      if (!card) return notFound(cardId);
      if (card.status === "signed" || card.status === "closed") {
        return { ok: false, conflicts: [frozenConflict(card.id, "新增缺件挂签", card.status)] };
      }
      const id = `TAG-${String(Date.now()).slice(-6)}`;
      mutateCard(cardId, (c) => ({
        ...c,
        tags: [...c.tags, { ...tag, id, createdAt: now(), resolvedAt: null, resolution: "" }],
      }));
      return { ok: true };
    },
    [db, mutateCard],
  );

  const resolveTag = useCallback(
    (cardId: string, tagId: string, resolution: string): ActionResult => {
      const card = db.cards.find((c) => c.id === cardId);
      if (!card) return notFound(cardId);
      if (card.status === "signed" || card.status === "closed") {
        return {
          ok: false,
          conflicts: [
            {
              ...frozenConflict(card.id, "解除缺件挂签", card.status),
              message: "已冻结工卡解除缺件须通过“补录另存版本”进行",
            },
          ],
        };
      }
      if (!resolution.trim()) {
        return {
          ok: false,
          conflicts: [
            {
              kind: "field",
              title: "解除说明必填",
              message: "请填写件号到货 / 安装 / 复检说明后再解除挂签",
              facts: [{ label: "解除说明原值", value: "空" }],
            },
          ],
        };
      }
      mutateCard(cardId, (c) => ({
        ...c,
        tags: c.tags.map((t) =>
          t.id === tagId ? { ...t, resolvedAt: now(), resolution: resolution.trim() } : t,
        ),
      }));
      return { ok: true };
    },
    [db, mutateCard],
  );

  // ---------- 工具借用：挂 / 摘 / 改时段（仅未冻结） ----------
  const setLoan = useCallback(
    (cardId: string, loan: ToolLoan): ActionResult => {
      const card = db.cards.find((c) => c.id === cardId);
      if (!card) return notFound(cardId);
      if (card.status === "signed" || card.status === "closed") {
        return { ok: false, conflicts: [frozenConflict(card.id, "修改借用记录", card.status)] };
      }
      mutateCard(cardId, (c) => {
        const exists = c.loans.some((l) => l.toolId === loan.toolId);
        return {
          ...c,
          loans: exists
            ? c.loans.map((l) => (l.toolId === loan.toolId ? loan : l))
            : [...c.loans, loan],
        };
      });
      return { ok: true };
    },
    [db, mutateCard],
  );

  const removeLoan = useCallback(
    (cardId: string, toolId: string): ActionResult => {
      const card = db.cards.find((c) => c.id === cardId);
      if (!card) return notFound(cardId);
      if (card.status === "signed" || card.status === "closed") {
        return { ok: false, conflicts: [frozenConflict(card.id, "移除借用记录", card.status)] };
      }
      mutateCard(cardId, (c) => ({ ...c, loans: c.loans.filter((l) => l.toolId !== toolId) }));
      return { ok: true };
    },
    [db, mutateCard],
  );

  // ---------- 工具归还：记录校准状态与借用时段；异常则停用工具 ----------
  const returnTool = useCallback(
    (cardId: string, toolId: string, returnedAt: string, calibrationOk: boolean, note: string): ActionResult => {
      const card = db.cards.find((c) => c.id === cardId);
      if (!card) return notFound(cardId);
      const loan = card.loans.find((l) => l.toolId === toolId);
      if (!loan) return notFound(`工具 ${toolId}`);
      if (loan.returnedAt) {
        return {
          ok: false,
          conflicts: [
            {
              kind: "state",
              title: `工具 ${toolId} 已归还`,
              message: "归还记录已固化，更正请走补录版本",
              facts: [{ label: "实际归还原值", value: loan.returnedAt.replace("T", " ") }],
            },
          ],
        };
      }
      if (!returnedAt) {
        return {
          ok: false,
          conflicts: [
            {
              kind: "field",
              title: "归还时间必填",
              message: "归还记录必须登记实际归还时间与校准封记状态",
              facts: [{ label: "实际归还原值", value: "空" }],
            },
          ],
        };
      }

      const next: Database = {
        ...db,
        tools: calibrationOk
          ? db.tools
          : db.tools.map((t) => (t.id === toolId ? { ...t, quarantine: true } : t)),
        cards: db.cards.map((c) =>
          c.id === cardId
            ? {
                ...c,
                updatedAt: now(),
                loans: c.loans.map((l) =>
                  l.toolId === toolId
                    ? { ...l, returnedAt, returnCalibrationOk: calibrationOk, returnNote: note.trim() }
                    : l,
                ),
              }
            : c,
        ),
      };
      commit(next);
      return { ok: true };
    },
    [db, commit],
  );

  // ---------- 结卡：已签署 + 缺件清零 + 工具全部归还 ----------
  const closeCard = useCallback(
    (cardId: string): ActionResult => {
      const card = db.cards.find((c) => c.id === cardId);
      if (!card) return notFound(cardId);
      if (card.status !== "signed") {
        return {
          ok: false,
          conflicts: [
            {
              kind: "state",
              title: `工卡 ${cardId} 尚未签署`,
              message: "只有已签署冻结的工卡可以结卡",
              facts: [{ label: "当前状态原值", value: card.status }],
            },
          ],
        };
      }
      const conflicts = closeBlockers(card);
      if (conflicts.length > 0) return { ok: false, conflicts };
      mutateCard(cardId, (c) => ({ ...c, status: "closed" }));
      return { ok: true };
    },
    [db, mutateCard],
  );

  const deleteDraft = useCallback(
    (cardId: string): ActionResult => {
      const card = db.cards.find((c) => c.id === cardId);
      if (!card) return notFound(cardId);
      if (card.status !== "draft") {
        return { ok: false, conflicts: [frozenConflict(card.id, "删除", card.status)] };
      }
      commit({ ...db, cards: db.cards.filter((c) => c.id !== cardId) });
      return { ok: true };
    },
    [db, commit],
  );

  const resetAll = useCallback(() => {
    commit(seedDatabase());
  }, [commit]);

  const metrics = useMemo(() => computeMetrics(db), [db]);

  return {
    db,
    metrics,
    getCard,
    setOperator,
    createCard,
    patchCard,
    submitCard,
    signCard,
    addendumCard,
    addTag,
    resolveTag,
    setLoan,
    removeLoan,
    returnTool,
    closeCard,
    deleteDraft,
    resetAll,
  };
}

export type DeskApi = ReturnType<typeof useDatabase>;

function notFound(what: string): ActionResult {
  return {
    ok: false,
    conflicts: [
      {
        kind: "state",
        title: `未找到 ${what}`,
        message: "数据可能已被其他操作刷新",
        facts: [],
      },
    ],
  };
}

function frozenConflict(cardId: string, action: string, status: WorkCard["status"]): Conflict {
  return {
    kind: "state",
    title: `工卡 ${cardId} 已冻结`,
    message: `签署 / 结卡后不得${action}；补录必须填写原因并另存版本`,
    facts: [{ label: "当前状态原值", value: status }],
  };
}

function computeMetrics(db: Database) {
  const cards = db.cards;
  const openTags = cards.reduce((n, c) => n + c.tags.filter((t) => !t.resolvedAt).length, 0);
  const unreturned = cards.reduce(
    (n, c) => n + c.loans.filter((l) => !l.returnedAt).length,
    0,
  );
  const expiredTools = db.tools.filter((t) => {
    const d = new Date();
    const p = (x: number) => String(x).padStart(2, "0");
    const today = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    return t.quarantine || today > t.calibrateDue;
  }).length;
  return {
    total: cards.length,
    openTags,
    unreturned,
    expiredTools,
    signed: cards.filter((c) => c.status === "signed").length,
    closed: cards.filter((c) => c.status === "closed").length,
  };
}
