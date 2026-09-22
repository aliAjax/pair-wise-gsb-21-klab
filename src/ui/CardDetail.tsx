// 界面层：工卡详情
// 草稿/已提交：直接编辑、提交、签署、登记归还、解除缺件、结卡
// 已签署冻结：内容只读，补录必须填原因并另存版本
import { useMemo, useState } from "react";
import type {
  ActionResult,
  CardSnapshot,
  Conflict,
  MissingTag,
  ToolLoan,
  WorkCard,
} from "../data/types";
import { fmt, isCalibrationValid, snapshotOf } from "../domain/rules";
import type { DeskApi } from "../app/useDatabase";
import { Badge, ConflictPanel, Notice } from "./widgets";

const ATA_OPTIONS = [
  "ATA 21 空调与增压",
  "ATA 24 电源系统",
  "ATA 27 飞控",
  "ATA 28 燃油系统",
  "ATA 32 起落架",
  "ATA 36 引气系统",
  "ATA 72 发动机",
];

type Props = {
  card: WorkCard;
  api: DeskApi;
};

export function CardDetail({ card, api }: Props) {
  const { db } = api;
  const frozen = card.status === "signed" || card.status === "closed";
  const [addendum, setAddendum] = useState(false);
  const [candidate, setCandidate] = useState<CardSnapshot>(() => snapshotOf(card));
  const [reason, setReason] = useState("");
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [notice, setNotice] = useState("");

  const toolsById = useMemo(() => new Map(db.tools.map((t) => [t.id, t])), [db.tools]);

  // 普通模式直接读持久化工卡；补录模式用本地候选稿，保存前不改动冻结卡
  const view: CardSnapshot = addendum ? candidate : snapshotOf(card);

  function run(result: ActionResult, okText: string) {
    if (result.ok) {
      setConflicts([]);
      setNotice(okText);
      setAddendum(false);
      setReason("");
    } else {
      setNotice("");
      setConflicts(result.conflicts);
    }
  }

  // 草稿/已提交：字段即时持久化
  function patchField<K extends keyof CardSnapshot>(key: K, value: CardSnapshot[K]) {
    const r = api.patchCard(card.id, { [key]: value } as Partial<CardSnapshot>);
    if (!r.ok) setConflicts(r.conflicts);
    else setConflicts([]);
  }

  // ---------- 补录候选缓冲（签署后只进版本，不直接改卡） ----------
  function patchCandidate<K extends keyof CardSnapshot>(key: K, value: CardSnapshot[K]) {
    setCandidate((f) => ({ ...f, [key]: value }));
  }
  function patchCandidateLoan(toolId: string, patch: Partial<ToolLoan>) {
    setCandidate((f) => ({
      ...f,
      loans: f.loans.map((l) => (l.toolId === toolId ? { ...l, ...patch } : l)),
    }));
  }
  function candidateAddLoan(toolId: string) {
    setCandidate((f) => ({
      ...f,
      loans: [
        ...f.loans,
        { toolId, start: f.start, end: f.end, returnedAt: null, returnCalibrationOk: null, returnNote: "" },
      ],
    }));
  }
  function candidateRemoveLoan(toolId: string) {
    setCandidate((f) => ({ ...f, loans: f.loans.filter((l) => l.toolId !== toolId) }));
  }
  function candidateAddTag(tag: Omit<MissingTag, "id" | "createdAt" | "resolvedAt" | "resolution">) {
    setCandidate((f) => ({
      ...f,
      tags: [
        ...f.tags,
        { ...tag, id: `TAG-NEW-${f.tags.length + 1}`, createdAt: "（补录新增）", resolvedAt: null, resolution: "" },
      ],
    }));
  }
  function candidateResolveTag(tagId: string, resolution: string) {
    setCandidate((f) => ({
      ...f,
      tags: f.tags.map((t) => (t.id === tagId ? { ...t, resolvedAt: "（补录解除）", resolution } : t)),
    }));
  }

  function startAddendum() {
    setCandidate(snapshotOf(card));
    setReason("");
    setConflicts([]);
    setAddendum(true);
  }

  return (
    <section className="panel detail-panel">
      <header className="detail-head">
        <div>
          <p className="eyebrow">{card.id}</p>
          <h2>{card.airframe || "未登记机身"} 的维修放行工卡</h2>
          <p className="detail-meta">
            <Badge status={card.status} />
            {card.signer && <span className="meta-item">签署人：{card.signer}</span>}
            {card.signedAt && <span className="meta-item">签署时间：{fmt(card.signedAt)}</span>}
            {frozen && <span className="meta-item frozen-note">已冻结 · 修改须补录另存版本</span>}
          </p>
        </div>
        <div className="detail-actions">
          {!frozen && (
            <>
              <button onClick={() => run(api.submitCard(card.id), `工卡 ${card.id} 校验通过，已提交`)}>
                校验并提交
              </button>
              <button className="primary-action" onClick={() => run(api.signCard(card.id), `工卡 ${card.id} 已签署并冻结，基线版本已固化`)}>
                签署放行（缺件清零）
              </button>
            </>
          )}
          {card.status === "signed" && (
            <>
              {!addendum && <button onClick={startAddendum}>签署后补录…</button>}
              <button className="primary-action" onClick={() => run(api.closeCard(card.id), `工卡 ${card.id} 已结卡`)}>
                结卡
              </button>
            </>
          )}
          {card.status === "draft" && (
            <button className="danger-action" onClick={() => api.deleteDraft(card.id)}>
              删除草稿
            </button>
          )}
        </div>
      </header>

      {notice && <Notice kind="ok">{notice}</Notice>}
      <ConflictPanel conflicts={conflicts} />

      {/* 基本信息 */}
      <div className="detail-section">
        <h3>工卡登记</h3>
        <div className="field-grid">
          <Field label="机身（机号）">
            <input
              value={view.airframe}
              disabled={frozen && !addendum}
              onChange={(e) =>
                addendum
                  ? patchCandidate("airframe", e.target.value)
                  : patchField("airframe", e.target.value)
              }
              placeholder="如 B-9921"
            />
          </Field>
          <Field label="ATA章节">
            <input
              list="ata-options"
              value={view.ata}
              disabled={frozen && !addendum}
              onChange={(e) =>
                addendum ? patchCandidate("ata", e.target.value) : patchField("ata", e.target.value)
              }
              placeholder="如 ATA 32 起落架"
            />
            <datalist id="ata-options">
              {ATA_OPTIONS.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </Field>
          <Field label="机位">
            <input
              value={view.stand}
              disabled={frozen && !addendum}
              onChange={(e) =>
                addendum ? patchCandidate("stand", e.target.value) : patchField("stand", e.target.value)
              }
              placeholder="如 A12"
            />
          </Field>
          <Field label="作业时段">
            <div className="range-inputs">
              <input
                type="datetime-local"
                value={view.start}
                disabled={frozen && !addendum}
                onChange={(e) =>
                  addendum ? patchCandidate("start", e.target.value) : patchField("start", e.target.value)
                }
              />
              <span>至</span>
              <input
                type="datetime-local"
                value={view.end}
                disabled={frozen && !addendum}
                onChange={(e) =>
                  addendum ? patchCandidate("end", e.target.value) : patchField("end", e.target.value)
                }
              />
            </div>
          </Field>
        </div>
      </div>

      {/* 扭矩工具与借用 / 归还 */}
      <LoansSection
        card={card}
        api={api}
        toolsById={toolsById}
        view={view}
        addendum={addendum}
        onLoanChange={(toolId, patch) => {
          if (addendum) {
            patchCandidateLoan(toolId, patch);
          } else {
            const current = card.loans.find((l) => l.toolId === toolId);
            if (current) {
              const r = api.setLoan(card.id, { ...current, ...patch });
              if (!r.ok) setConflicts(r.conflicts);
              else setConflicts([]);
            }
          }
        }}
        onAddLoan={(toolId) => {
          if (addendum) {
            candidateAddLoan(toolId);
          } else {
            const r = api.setLoan(card.id, {
              toolId,
              start: card.start,
              end: card.end,
              returnedAt: null,
              returnCalibrationOk: null,
              returnNote: "",
            });
            run(r, "");
          }
        }}
        onRemoveLoan={(toolId) => {
          if (addendum) candidateRemoveLoan(toolId);
          else run(api.removeLoan(card.id, toolId), "");
        }}
        onReturn={(toolId, returnedAt, ok, note) => {
          if (addendum) {
            patchCandidateLoan(toolId, {
              returnedAt,
              returnCalibrationOk: ok,
              returnNote: note.trim(),
            });
            setConflicts([]);
          } else {
            run(
              api.returnTool(card.id, toolId, returnedAt, ok, note),
              `工具 ${toolId} 归还已登记${ok ? "" : "，校准封记异常，工具已停用"}`,
            );
          }
        }}
      />

      {/* 缺件挂签 */}
      <TagsSection
        card={card}
        view={view}
        addendum={addendum}
        onAdd={(tag) => {
          if (addendum) candidateAddTag(tag);
          else run(api.addTag(card.id, tag), "缺件挂签已登记，解除前工卡无法提交 / 签署");
        }}
        onResolve={(tagId, resolution) => {
          if (addendum) candidateResolveTag(tagId, resolution);
          else run(api.resolveTag(card.id, tagId, resolution), `挂签 ${tagId} 已解除`);
        }}
      />

      {/* 补录原因与另存版本 */}
      {addendum && (
        <div className="detail-section addendum-box">
          <h3>签署后补录 · 另存版本</h3>
          <p className="hint">
            上方内容已切换为候选稿，可改登记项、借用时段、解除缺件；保存时重新过全部判定，原版本链保留不动。
          </p>
          <Field label="补录原因（必填）">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="如：按工具房签收单补登归还时间"
            />
          </Field>
          <div className="inline-actions">
            <button className="primary-action" onClick={() => run(api.addendumCard(card.id, reason, candidate), `补录已保存为 v${card.versions.length + 1}，原版本链保留`)}>
              校验并另存新版本
            </button>
            <button onClick={() => setAddendum(false)}>取消</button>
          </div>
        </div>
      )}

      <VersionChain card={card} />
    </section>
  );
}

// ---------- 字段壳 ----------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

// ---------- 工具借用 / 归还 ----------

function LoansSection({
  card,
  api,
  toolsById,
  view,
  addendum,
  onLoanChange,
  onAddLoan,
  onRemoveLoan,
  onReturn,
}: {
  card: WorkCard;
  api: DeskApi;
  toolsById: Map<string, (typeof api.db.tools)[number]>;
  view: CardSnapshot;
  addendum: boolean;
  onLoanChange: (toolId: string, patch: Partial<ToolLoan>) => void;
  onAddLoan: (toolId: string) => void;
  onRemoveLoan: (toolId: string) => void;
  onReturn: (toolId: string, returnedAt: string, ok: boolean, note: string) => void;
}) {
  const [newTool, setNewTool] = useState("");
  const [returnToolId, setReturnToolId] = useState<string | null>(null);
  const [returnedAt, setReturnedAt] = useState("");
  const [calOk, setCalOk] = useState(true);
  const [note, setNote] = useState("");

  const available = api.db.tools.filter((t) => !view.loans.some((l) => l.toolId === t.id));

  function openReturn(loan: ToolLoan) {
    setReturnToolId(loan.toolId);
    setReturnedAt(loan.end);
    setCalOk(true);
    setNote("");
  }

  return (
    <div className="detail-section">
      <h3>扭矩工具 · 借用与归还</h3>
      {view.loans.length === 0 && <p className="hint">本卡尚未挂接扭矩工具。</p>}
      <div className="loan-list">
        {view.loans.map((loan) => {
          const tool = toolsById.get(loan.toolId);
          const expired = tool ? !isCalibrationValid(tool, loan.start) : false;
          return (
            <article key={loan.toolId} className="loan-row">
              <div className="loan-head">
                <strong>{loan.toolId}</strong>
                <span>{tool ? `${tool.name} · ${tool.spec}` : "台账中不存在"}</span>
                {loan.returnedAt ? (
                  <span className={`flag ${loan.returnCalibrationOk ? "flag-ok" : "flag-danger"}`}>
                    {loan.returnCalibrationOk ? "已归还·封记正常" : "已归还·异常停用"}
                  </span>
                ) : (
                  <span className="flag flag-warn">未归还</span>
                )}
                {expired && <span className="flag flag-danger">借用时校准已过期</span>}
              </div>
              <div className="loan-body">
                <div className="range-inputs">
                  <input
                    type="datetime-local"
                    value={loan.start}
                    disabled={!addendum && (card.status === "signed" || card.status === "closed")}
                    onChange={(e) => onLoanChange(loan.toolId, { start: e.target.value })}
                  />
                  <span>至</span>
                  <input
                    type="datetime-local"
                    value={loan.end}
                    disabled={!addendum && (card.status === "signed" || card.status === "closed")}
                    onChange={(e) => onLoanChange(loan.toolId, { end: e.target.value })}
                  />
                </div>
                <div className="loan-side">
                  {!loan.returnedAt && (addendum || card.status !== "closed") && (
                    <button onClick={() => openReturn(loan)}>
                      {addendum ? "候选稿登记归还" : "登记归还"}
                    </button>
                  )}
                  {(card.status === "draft" || card.status === "active" || addendum) && (
                    <button className="danger-action ghost" onClick={() => onRemoveLoan(loan.toolId)}>
                      移除
                    </button>
                  )}
                </div>
              </div>
              {loan.returnedAt && (
                <dl className="return-record">
                  <div>
                    <dt>实际归还</dt>
                    <dd>{fmt(loan.returnedAt)}</dd>
                  </div>
                  <div>
                    <dt>校准封记</dt>
                    <dd>{loan.returnCalibrationOk ? "完好" : "异常 · 工具停用"}</dd>
                  </div>
                  <div className="return-note">
                    <dt>备注</dt>
                    <dd>{loan.returnNote || "—"}</dd>
                  </div>
                </dl>
              )}
              {returnToolId === loan.toolId && !loan.returnedAt && (
                <div className="return-form">
                  <div className="range-inputs">
                    <span>实际归还</span>
                    <input type="datetime-local" value={returnedAt} onChange={(e) => setReturnedAt(e.target.value)} />
                  </div>
                  <div className="cal-options">
                    <label>
                      <input type="radio" checked={calOk} onChange={() => setCalOk(true)} />
                      校准封记完好
                    </label>
                    <label>
                      <input type="radio" checked={!calOk} onChange={() => setCalOk(false)} />
                      异常（工具停用）
                    </label>
                  </div>
                  <input placeholder="归还备注（外观、封签、读数等）" value={note} onChange={(e) => setNote(e.target.value)} />
                  <div className="inline-actions">
                    <button
                      className="primary-action"
                      onClick={() => {
                        onReturn(loan.toolId, returnedAt, calOk, note);
                        setReturnToolId(null);
                      }}
                    >
                      确认归还
                    </button>
                    <button onClick={() => setReturnToolId(null)}>取消</button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
      {(card.status === "draft" || card.status === "active" || addendum) && available.length > 0 && (
        <div className="add-loan">
          <select value={newTool} onChange={(e) => setNewTool(e.target.value)}>
            <option value="">选择要挂接的扭矩工具…</option>
            {available.map((t) => (
              <option key={t.id} value={t.id}>
                {t.id} · {t.name}（校准至 {t.calibrateDue}
                {t.quarantine ? "·停用" : ""}）
              </option>
            ))}
          </select>
          <button disabled={!newTool} onClick={() => { onAddLoan(newTool); setNewTool(""); }}>
            挂接工具
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- 缺件挂签 ----------

function TagsSection({
  card,
  view,
  addendum,
  onAdd,
  onResolve,
}: {
  card: WorkCard;
  view: CardSnapshot;
  addendum: boolean;
  onAdd: (tag: Omit<MissingTag, "id" | "createdAt" | "resolvedAt" | "resolution">) => void;
  onResolve: (tagId: string, resolution: string) => void;
}) {
  const [pn, setPn] = useState("");
  const [name, setName] = useState("");
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState("");
  const [resolveId, setResolveId] = useState<string | null>(null);
  const [resolution, setResolution] = useState("");
  const frozen = card.status === "signed" || card.status === "closed";

  function submitNew() {
    if (!pn.trim() || !name.trim() || qty <= 0 || !reason.trim()) return;
    onAdd({ pn: pn.trim(), name: name.trim(), qty, reason: reason.trim() });
    setPn("");
    setName("");
    setQty(1);
    setReason("");
  }

  return (
    <div className="detail-section">
      <h3>缺件放行挂签</h3>
      {view.tags.length === 0 && <p className="hint">无缺件挂签，满足签署清零条件。</p>}
      <div className="tag-list">
        {view.tags.map((tag) => (
          <article key={tag.id} className={`tag-row ${tag.resolvedAt ? "resolved" : "open"}`}>
            <header>
              <strong>{tag.id}</strong>
              <span className="flag">{tag.resolvedAt ? "已解除" : "未解除"}</span>
            </header>
            <dl className="tag-facts">
              <div><dt>件号</dt><dd>{tag.pn}</dd></div>
              <div><dt>名称</dt><dd>{tag.name}</dd></div>
              <div><dt>数量</dt><dd>{tag.qty}</dd></div>
              <div className="wide"><dt>挂签原因</dt><dd>{tag.reason}</dd></div>
              <div><dt>挂签时间</dt><dd>{fmt(tag.createdAt)}</dd></div>
              {tag.resolvedAt && (
                <>
                  <div><dt>解除时间</dt><dd>{fmt(tag.resolvedAt)}</dd></div>
                  <div className="wide"><dt>解除说明</dt><dd>{tag.resolution}</dd></div>
                </>
              )}
            </dl>
            {!tag.resolvedAt && (!frozen || addendum) && (
              resolveId === tag.id ? (
                <div className="resolve-form">
                  <input
                    placeholder={`${addendum ? "补录解除" : "解除"}说明：件号到货 / 安装 / 复检结果（必填）`}
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                  />
                  <div className="inline-actions">
                    <button
                      className="primary-action"
                      onClick={() => {
                        if (!resolution.trim()) return;
                        onResolve(tag.id, resolution);
                        setResolveId(null);
                        setResolution("");
                      }}
                    >
                      {addendum ? "随版本解除" : "确认解除"}
                    </button>
                    <button onClick={() => setResolveId(null)}>取消</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setResolveId(tag.id); setResolution(""); }}>
                  {addendum ? "补录解除…" : "解除挂签"}
                </button>
              )
            )}
          </article>
        ))}
      </div>

      {(!frozen || addendum) && (
        <div className="tag-form">
          <div className="field-grid">
            <Field label="件号">
              <input value={pn} onChange={(e) => setPn(e.target.value)} placeholder="如 PN-451-3210" />
            </Field>
            <Field label="名称">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如 主轮螺栓锁片" />
            </Field>
            <Field label="数量">
              <input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
            </Field>
            <Field label="挂签原因">
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="如 航材待货" />
            </Field>
          </div>
          <button
            className="primary-action"
            disabled={!pn.trim() || !name.trim() || qty <= 0 || !reason.trim()}
            onClick={submitNew}
          >
            挂缺件签
          </button>
        </div>
      )}
      {frozen && !addendum && (
        <p className="hint">工卡已冻结：新增 / 解除挂签请走“签署后补录”，随新版本保存。</p>
      )}
    </div>
  );
}

// ---------- 版本链 ----------

function VersionChain({ card }: { card: WorkCard }) {
  if (card.versions.length === 0) {
    return (
      <div className="detail-section versions">
        <h3>版本链</h3>
        <p className="hint">尚未签署。签署时固化 v1 基线；此后每次补录追加一个带原因的版本。</p>
      </div>
    );
  }
  return (
    <div className="detail-section versions">
      <h3>版本链（{card.versions.length} 个版本，历史只读）</h3>
      <ol className="version-chain">
        {card.versions.map((v) => {
          const openTags = v.snapshot.tags.filter((t) => !t.resolvedAt).length;
          return (
            <li key={v.version} className={v.version === card.versions.length ? "latest" : ""}>
              <header>
                <strong>v{v.version}</strong>
                <span>{v.version === 1 && v.reason === "签署基线" ? "签署基线" : "补录版本"}</span>
              </header>
              <p className="version-reason">{v.reason}</p>
              <p className="version-meta">
                {v.createdBy} · {fmt(v.createdAt)}
              </p>
              <p className="version-snapshot">
                {v.snapshot.airframe} · {v.snapshot.ata} · 机位 {v.snapshot.stand} ·{" "}
                {fmt(v.snapshot.start)} ~ {fmt(v.snapshot.end)} · 工具 {v.snapshot.loans.length} 件 ·
                缺件 {openTags > 0 ? `${openTags} 项未解除` : "清零"}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
