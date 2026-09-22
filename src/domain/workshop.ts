import type {
  CardStatus,
  MissingTag,
  ToolLoan,
  WorkCard,
  WorkshopState,
} from "../data/types";
import {
  closeConflicts,
  signConflicts,
  validateCard,
  type CardInput,
  type Conflict,
} from "./rules";

// 判定层：状态迁移。每个动作返回 { ok, conflicts }，成功时给出新状态；
// 任何冲突都不修改原状态（整卡拒绝）。

export type TransitionResult =
  | { ok: true; state: WorkshopState; card?: WorkCard; tag?: MissingTag; loan?: ToolLoan }
  | { ok: false; conflicts: Conflict[] };

export function nowStamp(): string {
  return new Date().toISOString();
}

function pad(value: number, size = 2): string {
  return String(value).padStart(size, "0");
}

/** 本地时区的 YYYY-MM-DDTHH:mm（datetime-local 值） */
export function localDateTime(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function fmtDateTime(value: string | null): string {
  if (!value) return "—";
  if (/T\d\d:\d\d$/.test(value)) return value.replace("T", " ");
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.replace("T", " ");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function dayStamp(value = new Date()): string {
  return `${value.getFullYear()}${pad(value.getMonth() + 1)}${pad(value.getDate())}`;
}

function cardId(n: number): string {
  return `C-${n + 100}`;
}

/** 登记一张新工卡（新系列 v1）；冲突则整卡拒绝、不落库 */
export function admitCard(prev: WorkshopState, input: CardInput): TransitionResult {
  const conflicts = validateCard({
    input,
    cards: prev.cards,
    tools: prev.tools,
    tags: prev.tags,
  });
  if (conflicts.length > 0) return { ok: false, conflicts };

  const counters = { ...prev.counters, card: prev.counters.card + 1, series: prev.counters.series + 1 };
  const id = cardId(prev.counters.card + 100);
  const card: WorkCard = {
    id,
    seriesId: `S-${counters.series}`,
    version: 1,
    cardNo: `WO-${dayStamp()}-${pad(prev.counters.card + 1)}`,
    supersedesId: null,
    supplementReason: null,
    aircraft: input.aircraft.trim(),
    ata: input.ata.trim(),
    stand: input.stand.trim(),
    start: input.start,
    end: input.end,
    toolIds: [...input.toolIds],
    mechanic: input.mechanic.trim(),
    status: "registered",
    createdAt: nowStamp(),
    signedAt: null,
    signer: null,
    closedAt: null,
  };
  const loans = createLoans(prev, card, counters);
  return {
    ok: true,
    state: {
      ...prev,
      counters,
      cards: [card, ...prev.cards],
      loans: [...loans, ...prev.loans],
    },
    card,
  };
}

/** 补录草稿另存为新版本（同一工卡号 / 版本链）；冲突则整卡拒绝、草稿保留 */
export function promoteDraft(
  prev: WorkshopState,
  draft: WorkCard,
  input: CardInput,
  reason: string,
): TransitionResult {
  const source = prev.cards.find((c) => c.id === draft.supersedesId);
  const seriesId = source?.seriesId ?? draft.seriesId;
  const conflicts = validateCard({
    input,
    cards: prev.cards,
    tools: prev.tools,
    tags: prev.tags,
    sameSeriesId: seriesId,
  });
  if (reason.trim() === "") {
    conflicts.push({
      code: "FIELD_REQUIRED",
      field: "补录原因",
      message: "签署后补录必须填写原因，否则只能另存草稿。",
      enteredValue: "（空）",
      existingValue: "—",
    });
  }
  if (conflicts.length > 0) return { ok: false, conflicts };

  const chain = prev.cards
    .filter((c) => c.seriesId === seriesId)
    .sort((a, b) => b.version - a.version);
  const previous = chain[0];
  if (!previous) {
    return { ok: false, conflicts: [missingCard(seriesId, "版本链")] };
  }
  const counters = { ...prev.counters, card: prev.counters.card + 1 };
  const card: WorkCard = {
    id: cardId(prev.counters.card + 100),
    seriesId,
    version: previous.version + 1,
    cardNo: previous.cardNo,
    supersedesId: previous.id,
    supplementReason: reason.trim(),
    aircraft: input.aircraft.trim(),
    ata: input.ata.trim(),
    stand: input.stand.trim(),
    start: input.start,
    end: input.end,
    toolIds: [...input.toolIds],
    mechanic: input.mechanic.trim(),
    status: "registered",
    createdAt: nowStamp(),
    signedAt: null,
    signer: null,
    closedAt: null,
  };
  // 草稿随登记成功并入正式链并从卡表移除；旧版本保持原状（已签署则继续冻结留痕），
  // 是否被取代由版本号派生，不改动历史记录。
  const cards = prev.cards
    .filter((c) => c.id !== draft.id);
  const loans = createLoans(prev, card, counters);
  return {
    ok: true,
    state: { ...prev, counters, cards: [card, ...cards], loans: [...loans, ...prev.loans] },
    card,
  };
}

/** 登记通过后为每件工具建立借用记录，借用起始取工卡时段开始，并快照校准状态（纯函数，不修改入参） */
function createLoans(
  prev: WorkshopState,
  card: WorkCard,
  counters: { loan: number },
): ToolLoan[] {
  const toolMap = new Map(prev.tools.map((t) => [t.id, t]));
  return card.toolIds.map((toolId) => {
    counters.loan += 1;
    return {
      id: `L-${counters.loan}`,
      cardId: card.id,
      toolId,
      borrowAt: card.start,
      returnedAt: null,
      calibrationAtBorrow: toolMap.get(toolId)?.calibratedUntil ?? "",
      calibrationAtReturn: null,
    };
  });
}

/**
 * 把补录保存为草稿。
 * 草稿独立挂在源卡编号下（seriesId 用临时链），不占机位 / 工具资源、不做规则判定；
 * 登记通过时并入源版本链成为新版本。
 */
export function saveDraft(prev: WorkshopState, input: CardInput, source?: WorkCard): TransitionResult {
  const counters = { ...prev.counters, card: prev.counters.card + 1 };
  const card: WorkCard = {
    id: cardId(prev.counters.card + 100),
    seriesId: `S-D-${counters.card}`,
    version: 1,
    cardNo: source?.cardNo ?? `草稿-${pad(counters.card)}`,
    supersedesId: source?.id ?? null,
    supplementReason: null,
    aircraft: input.aircraft.trim(),
    ata: input.ata.trim(),
    stand: input.stand.trim(),
    start: input.start,
    end: input.end,
    toolIds: [...input.toolIds],
    mechanic: input.mechanic.trim(),
    status: "draft",
    createdAt: nowStamp(),
    signedAt: null,
    signer: null,
    closedAt: null,
  };
  return {
    ok: true,
    state: { ...prev, counters, cards: [card, ...prev.cards] },
    card,
  };
}

/** 更新草稿内容（仅草稿；不做规则判定） */
export function updateDraft(prev: WorkshopState, draftId: string, input: CardInput): TransitionResult {
  const target = prev.cards.find((c) => c.id === draftId);
  if (!target || target.status !== "draft") {
    return {
      ok: false,
      conflicts: [
        {
          code: "FIELD_REQUIRED",
          field: "草稿",
          message: "只能更新补录草稿。",
          enteredValue: draftId,
          existingValue: target?.status ?? "missing",
        },
      ],
    };
  }
  const updated: WorkCard = {
    ...target,
    aircraft: input.aircraft.trim(),
    ata: input.ata.trim(),
    stand: input.stand.trim(),
    start: input.start,
    end: input.end,
    toolIds: [...input.toolIds],
    mechanic: input.mechanic.trim(),
  };
  return {
    ok: true,
    state: { ...prev, cards: prev.cards.map((c) => (c.id === draftId ? updated : c)) },
    card: updated,
  };
}

/** 删除草稿（仅草稿可删） */
export function discardDraft(prev: WorkshopState, draftId: string): TransitionResult {
  const target = prev.cards.find((c) => c.id === draftId);
  if (!target || target.status !== "draft") {
    return {
      ok: false,
      conflicts: [
        {
          code: "FIELD_REQUIRED",
          field: "工卡",
          message: "只有补录草稿可以删除，已登记 / 已签署卡受版本链保护。",
          enteredValue: target?.cardNo ?? draftId,
          existingValue: target?.status ?? "missing",
        },
      ],
    };
  }
  return {
    ok: true,
    state: { ...prev, cards: prev.cards.filter((c) => c.id !== draftId) },
  };
}

/** 现场新增缺件挂签（仅非冻结卡） */
export function raiseTag(
  prev: WorkshopState,
  cardId: string,
  data: { part: string; description: string },
): TransitionResult {
  const card = prev.cards.find((c) => c.id === cardId);
  if (!card) return { ok: false, conflicts: [missingCard(cardId)] };
  if (card.status === "signed" || card.status === "closed") {
    return {
      ok: false,
      conflicts: [frozenConflict(card)],
    };
  }
  if (data.part.trim() === "" || data.description.trim() === "") {
    return {
      ok: false,
      conflicts: [
        {
          code: "FIELD_REQUIRED",
          field: "缺件挂签",
          message: "件号与缺件描述均为必填。",
          enteredValue: `${data.part} / ${data.description}`,
          existingValue: "—",
        },
      ],
    };
  }
  const counters = { ...prev.counters, tag: prev.counters.tag + 1 };
  const tag: MissingTag = {
    id: `Q-${counters.tag}`,
    cardId,
    tagNo: `QT-${dayStamp()}-${pad(counters.tag)}`,
    ata: card.ata,
    part: data.part.trim(),
    description: data.description.trim(),
    raisedAt: nowStamp(),
    status: "open",
    clearedAt: null,
    clearRemark: null,
  };
  return { ok: true, state: { ...prev, counters, tags: [tag, ...prev.tags] }, tag };
}

/** 解除缺件挂签（缺件清零） */
export function clearTag(prev: WorkshopState, tagId: string, remark: string): TransitionResult {
  const tag = prev.tags.find((t) => t.id === tagId);
  if (!tag) {
    return {
      ok: false,
      conflicts: [
        { code: "FIELD_REQUIRED", field: "缺件挂签", message: "挂签不存在。", enteredValue: tagId, existingValue: "—" },
      ],
    };
  }
  if (remark.trim() === "") {
    return {
      ok: false,
      conflicts: [
        {
          code: "FIELD_REQUIRED",
          field: "解除说明",
          message: "解除挂签必须填写处理说明（如：件号 P562-3 已装机复测合格）。",
          enteredValue: "（空）",
          existingValue: "—",
        },
      ],
    };
  }
  const tags = prev.tags.map((t) =>
    t.id === tagId
      ? { ...t, status: "cleared" as const, clearedAt: nowStamp(), clearRemark: remark.trim() }
      : t,
  );
  return { ok: true, state: { ...prev, tags }, tag: tags.find((t) => t.id === tagId) };
}

/** 工具归还：记录归还时间与归还时校准状态原值 */
export function returnTool(prev: WorkshopState, loanId: string): TransitionResult {
  const loan = prev.loans.find((l) => l.id === loanId);
  if (!loan) return { ok: false, conflicts: [missingCard(loanId, "借用记录")] };
  if (loan.returnedAt) {
    return {
      ok: false,
      conflicts: [
        {
          code: "FIELD_REQUIRED",
          field: "借用记录",
          message: "该工具已归还，不能重复登记。",
          enteredValue: loan.returnedAt,
          existingValue: fmtDateTime(loan.returnedAt),
        },
      ],
    };
  }
  const tool = prev.tools.find((t) => t.id === loan.toolId);
  const stamp = localDateTime();
  const loans = prev.loans.map((l) =>
    l.id === loanId
      ? {
          ...l,
          returnedAt: stamp,
          calibrationAtReturn: tool?.calibratedUntil ?? l.calibrationAtBorrow,
        }
      : l,
  );
  return { ok: true, state: { ...prev, loans }, loan: loans.find((l) => l.id === loanId) };
}

/** 签署：缺件清零才可签署，签署后冻结 */
export function signCard(prev: WorkshopState, cardId: string, signer: string): TransitionResult {
  const card = prev.cards.find((c) => c.id === cardId);
  if (!card) return { ok: false, conflicts: [missingCard(cardId)] };
  if (card.status !== "registered") {
    return {
      ok: false,
      conflicts: [
        {
          code: "FIELD_REQUIRED",
          field: "工卡状态",
          message: "仅已登记工卡可以签署。",
          enteredValue: card.status,
          existingValue: "registered",
        },
      ],
    };
  }
  const conflicts = signConflicts(card, prev.tags, signer);
  if (conflicts.length > 0) return { ok: false, conflicts };

  const cards = prev.cards.map((c) =>
    c.id === cardId
      ? { ...c, status: "signed" as CardStatus, signedAt: nowStamp(), signer: signer.trim() }
      : c,
  );
  return { ok: true, state: { ...prev, cards }, card: cards.find((c) => c.id === cardId) };
}

/** 结卡：工具全部归还才可结卡 */
export function closeCard(prev: WorkshopState, cardId: string): TransitionResult {
  const card = prev.cards.find((c) => c.id === cardId);
  if (!card) return { ok: false, conflicts: [missingCard(cardId)] };
  if (card.status !== "signed") {
    return {
      ok: false,
      conflicts: [
        {
          code: "FIELD_REQUIRED",
          field: "工卡状态",
          message: "仅已签署工卡可以结卡。",
          enteredValue: card.status,
          existingValue: "signed",
        },
      ],
    };
  }
  const conflicts = closeConflicts(card, prev.loans);
  if (conflicts.length > 0) return { ok: false, conflicts };

  const cards = prev.cards.map((c) =>
    c.id === cardId ? { ...c, status: "closed" as CardStatus, closedAt: nowStamp() } : c,
  );
  return { ok: true, state: { ...prev, cards }, card: cards.find((c) => c.id === cardId) };
}

function missingCard(id: string, field = "工卡"): Conflict {
  return { code: "FIELD_REQUIRED", field, message: "记录不存在。", enteredValue: id, existingValue: "—" };
}

function frozenConflict(card: WorkCard): Conflict {
  return {
    code: "FIELD_REQUIRED",
    field: "冻结工卡",
    message: `工卡 ${card.cardNo} v${card.version} 已签署冻结，补录只能带原因另存版本。`,
    enteredValue: card.status,
    existingValue: "signed (frozen)",
  };
}
