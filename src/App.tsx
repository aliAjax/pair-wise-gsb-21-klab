import { useMemo, useState } from "react";
import "./styles.css";
import type { WorkCard } from "./data/types";
import { useWorkshop } from "./data/store";
import type { CardInput, Conflict } from "./domain/rules";
import {
  admitCard,
  clearTag,
  closeCard,
  discardDraft,
  fmtDateTime,
  localDateTime,
  promoteDraft,
  raiseTag,
  returnTool,
  saveDraft,
  signCard,
  updateDraft,
} from "./domain/workshop";
import { drafts as selectDrafts, groupSeries, metrics, toolViews } from "./domain/selectors";
import { AdmissionForm } from "./ui/AdmissionForm";
import { CardSeriesView } from "./ui/CardView";
import { DraftsPanel } from "./ui/DraftsPanel";
import { SupplementDialog } from "./ui/SupplementDialog";
import { ToolsPanel } from "./ui/ToolsPanel";
import { Badge } from "./ui/widgets";

function App() {
  const { state, setState, savedAt, resetSeed } = useWorkshop();
  const [toast, setToast] = useState<string | null>(null);
  const [supplementSource, setSupplementSource] = useState<WorkCard | null>(null);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const views = useMemo(() => toolViews(state.tools, state.loans, today), [state, today]);
  const series = useMemo(() => groupSeries(state.cards), [state.cards]);
  const draftList = useMemo(() => selectDrafts(state.cards), [state.cards]);
  const m = useMemo(() => metrics(state, today), [state, today]);

  const notify = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 3500);
  };

  // ---- 登记：冲突则整卡拒绝、不入库；表单保留原值 ----
  const handleAdmit = (input: CardInput): Conflict[] => {
    const result = admitCard(state, input);
    if (!result.ok) return result.conflicts;
    setState(result.state);
    notify(`工卡 ${result.card?.cardNo} 登记通过，已生成工具借用记录。`);
    return [];
  };

  const handleRaiseTag = (cardId: string, part: string, desc: string): Conflict[] => {
    const result = raiseTag(state, cardId, { part, description: desc });
    if (!result.ok) return result.conflicts;
    setState(result.state);
    notify(`已挂缺件签 ${result.tag?.tagNo}，该卡签署前必须清零。`);
    return [];
  };

  const handleClearTag = (tagId: string, remark: string): Conflict[] => {
    const result = clearTag(state, tagId, remark);
    if (!result.ok) return result.conflicts;
    setState(result.state);
    notify("缺件挂签已解除。");
    return [];
  };

  const handleReturn = (loanId: string) => {
    const result = returnTool(state, loanId);
    if (!result.ok) {
      notify(result.conflicts[0]?.message ?? "归还失败");
      return;
    }
    setState(result.state);
    notify("工具已归还，归还时校准状态已记录。");
  };

  const handleSign = (cardId: string, signer: string): Conflict[] => {
    const result = signCard(state, cardId, signer);
    if (!result.ok) return result.conflicts;
    setState(result.state);
    notify("签署完成，工卡已冻结；后续补录只能带原因另存版本。");
    return [];
  };

  const handleClose = (cardId: string): Conflict[] => {
    const result = closeCard(state, cardId);
    if (!result.ok) return result.conflicts;
    setState(result.state);
    notify("工具全部归还，工卡已结卡。");
    return [];
  };

  // ---- 补录：先存草稿（不校验、不占资源），再带原因登记为新版本 ----
  const handleSaveDraft = (
    input: CardInput,
    draftId?: string,
  ): { conflicts: Conflict[]; draft?: WorkCard } => {
    if (draftId) {
      const result = updateDraft(state, draftId, input);
      if (!result.ok) return { conflicts: result.conflicts };
      setState(result.state);
      return { conflicts: [], draft: result.card };
    }
    const result = saveDraft(state, input, supplementSource ?? undefined);
    if (!result.ok) return { conflicts: result.conflicts };
    setState(result.state);
    notify("已保存为补录草稿，不占用机位与工具时段。");
    return { conflicts: [], draft: result.card };
  };

  const handlePromoteFromDialog = (draft: WorkCard, input: CardInput, reason: string): Conflict[] => {
    const result = promoteDraft(state, draft, input, reason);
    if (!result.ok) return result.conflicts;
    setState(result.state);
    setSupplementSource(null);
    notify(`补录已另存为 ${result.card?.cardNo} v${result.card?.version}，旧版本保持冻结。`);
    return [];
  };

  const handlePromoteFromPanel = (draft: WorkCard, reason: string): Conflict[] => {
    const input: CardInput = {
      aircraft: draft.aircraft,
      ata: draft.ata,
      stand: draft.stand,
      start: draft.start,
      end: draft.end,
      toolIds: draft.toolIds,
      mechanic: draft.mechanic,
      pendingTags: [],
    };
    const result = promoteDraft(state, draft, input, reason);
    if (!result.ok) return result.conflicts;
    setState(result.state);
    notify(`补录已另存为 ${result.card?.cardNo} v${result.card?.version}。`);
    return [];
  };

  const handleDiscard = (draftId: string): Conflict[] => {
    const result = discardDraft(state, draftId);
    if (!result.ok) return result.conflicts;
    setState(result.state);
    return [];
  };

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-07 · port 5107</p>
          <h1>工卡与缺件放行台</h1>
          <p className="subtitle">
            登记机身、ATA章节、机位、时段、扭矩工具与缺件挂签；机位 / 工具时段重叠、工具校准过期、缺件未解除即整卡拒绝。
            签署前缺件清零，签署后冻结，补录带原因另存版本；工具未归还不得结卡。
          </p>
          <p className="persist-line">
            数据已持久化到本机浏览器，最近保存 {fmtDateTime(savedAt)}
            <button className="mini" onClick={resetSeed}>
              恢复演示数据
            </button>
          </p>
        </div>
        <div className="stack-card">
          <span>分层结构（无新增依赖）</span>
          <strong>data 数据 · domain 判定 · ui 界面</strong>
          <span>React + Vite + TypeScript + localStorage</span>
        </div>
      </section>

      <section className="metrics-grid">
        <Metric label="当前版本工卡" value={m.current} tone="info" note={`草稿 ${m.draft}`} />
        <Metric label="待签署" value={m.registered} tone="warn" note="已登记" />
        <Metric label="已签署待结卡" value={m.signed} tone="ok" note="冻结中" />
        <Metric label="未解除缺件" value={m.openTags} tone="danger" note="签署门禁" />
        <Metric label="未归还工具" value={m.openLoans} tone="warn" note="结卡门禁" />
        <Metric label="校准过期工具" value={m.expiredTools} tone="danger" note="禁止上卡" />
        <Metric label="已结卡" value={m.closed} tone="muted" note="归档" />
        <Metric label="版本链" value={series.length} tone="info" note="工卡号维度" />
      </section>

      <AdmissionForm tools={state.tools} defaultStart={defaultSlot()} onAdmit={(input) => handleAdmit(input)} />

      <ToolsPanel
        views={views}
        loans={state.loans}
        cards={state.cards}
        onReturn={handleReturn}
      />

      <DraftsPanel drafts={draftList} onPromote={handlePromoteFromPanel} onDiscard={handleDiscard} />

      <section className="panel">
        <div className="section-heading">
          <div>
            <p>工卡版本链</p>
            <h2>已登记 / 签署 / 结卡工卡</h2>
          </div>
          <Badge tone="muted">同号卡按版本链展示，旧版本冻结留痕</Badge>
        </div>
        <div className="series-list">
          {series.map((s) => (
            <CardSeriesView
              key={s.seriesId}
              series={s}
              tools={state.tools}
              tags={state.tags}
              loans={state.loans}
              onRaiseTag={handleRaiseTag}
              onClearTag={handleClearTag}
              onSign={handleSign}
              onClose={handleClose}
              onSupplement={setSupplementSource}
            />
          ))}
        </div>
      </section>

      {supplementSource ? (
        <SupplementDialog
          source={supplementSource}
          tools={state.tools}
          onCancel={() => setSupplementSource(null)}
          onSaveDraft={handleSaveDraft}
          onPromote={handlePromoteFromDialog}
        />
      ) : null}

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </main>
  );
}

function Metric({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: number;
  note: string;
  tone: "ok" | "warn" | "danger" | "muted" | "info";
}) {
  return (
    <article className={`metric-card tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <i className={`badge badge-${tone}`}>{note}</i>
    </article>
  );
}

/** 表单默认时段：取当前时刻凑整到下一整点，时长 3 小时 */
function defaultSlot(): string {
  const d = new Date();
  d.setHours(d.getMinutes() > 0 ? d.getHours() + 1 : d.getHours(), 0, 0, 0);
  return localDateTime(d);
}

export default App;
