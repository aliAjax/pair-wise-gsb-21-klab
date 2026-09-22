// 界面层装配：顶部看板 + 操作人 + 新建工卡 + 工具台账 / 工卡列表 / 工卡详情
import { useEffect, useState } from "react";
import "./styles.css";
import { useDatabase } from "./app/useDatabase";
import { ToolLedger } from "./ui/ToolLedger";
import { CardList } from "./ui/CardList";
import { CardDetail } from "./ui/CardDetail";

function App() {
  const api = useDatabase();
  const { db, metrics } = api;
  const [selectedId, setSelectedId] = useState<string | null>(db.cards[0]?.id ?? null);

  useEffect(() => {
    if (selectedId && !db.cards.some((c) => c.id === selectedId)) {
      setSelectedId(db.cards[0]?.id ?? null);
    }
  }, [db.cards, selectedId]);

  const selected = db.cards.find((c) => c.id === selectedId) ?? null;

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-07 · port 5107</p>
          <h1>工卡与缺件放行台</h1>
          <p className="subtitle">
            工卡登记机身、ATA章节、机位、时段、扭矩工具与缺件挂签；机位 / 工具时段重叠、工具校准过期、缺件未解除时整卡拒绝。
            签署前缺件清零，签署后冻结、补录带原因另存版本；工具未归还不得结卡。
          </p>
        </div>
        <div className="stack-card">
          <span>当前操作 / 签署人</span>
          <input
            value={db.operator}
            onChange={(e) => api.setOperator(e.target.value)}
            placeholder="输入姓名"
          />
          <button className="reset-btn" onClick={api.resetAll}>
            恢复演示数据
          </button>
        </div>
      </section>

      <section className="metrics-grid">
        <Metric label="工卡总数" value={String(metrics.total)} tone="accent" />
        <Metric label="未解除缺件" value={String(metrics.openTags)} tone="danger" />
        <Metric label="工具未归还" value={String(metrics.unreturned)} tone="warn" />
        <Metric label="工具过期/停用" value={String(metrics.expiredTools)} tone="warn" />
        <Metric label="已签署冻结" value={String(metrics.signed)} tone="accent" />
        <Metric label="已结卡" value={String(metrics.closed)} tone="ok" />
      </section>

      <NewCardForm onCreate={(id) => setSelectedId(id)} createCard={api.createCard} />

      <section className="workspace three-col">
        <ToolLedger db={db} />
        <CardList db={db} selectedId={selectedId} onSelect={setSelectedId} />
        {selected ? (
          <CardDetail key={selected.id + selected.updatedAt} card={selected} api={api} />
        ) : (
          <section className="panel detail-panel empty-detail">
            <p>从左侧选择一张工卡，或新建工卡开始登记。</p>
          </section>
        )}
      </section>

      <footer className="page-foot">
        数据仅保存在本机浏览器（localStorage），刷新后工卡、工具、缺件与版本链保持一致；数据层 / 判定层 / 界面层分离，未新增任何依赖。
      </footer>
    </main>
  );
}

const toneClass = {
  accent: "status-ok",
  warn: "status-watch",
  danger: "status-danger",
  ok: "status-ok",
} as const;

function Metric({ label, value, tone }: { label: string; value: string; tone: keyof typeof toneClass }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <i className={toneClass[tone]} />
    </article>
  );
}

function NewCardForm({
  createCard,
  onCreate,
}: {
  createCard: ReturnType<typeof useDatabase>["createCard"];
  onCreate: (id: string) => void;
}) {
  const [airframe, setAirframe] = useState("");
  const [ata, setAta] = useState("ATA 32 起落架");
  const [stand, setStand] = useState("");
  const [start, setStart] = useState("2026-09-24T09:00");
  const [end, setEnd] = useState("2026-09-24T17:00");

  return (
    <section className="panel new-card">
      <div className="panel-head">
        <h2>新建工卡</h2>
        <span className="hint">创建后为草稿，登记完成须“校验并提交”</span>
      </div>
      <div className="new-card-grid">
        <label className="field">
          <span>机身（机号）</span>
          <input value={airframe} onChange={(e) => setAirframe(e.target.value)} placeholder="如 B-9921" />
        </label>
        <label className="field">
          <span>ATA章节</span>
          <input value={ata} onChange={(e) => setAta(e.target.value)} />
        </label>
        <label className="field">
          <span>机位</span>
          <input value={stand} onChange={(e) => setStand(e.target.value)} placeholder="如 A12" />
        </label>
        <label className="field">
          <span>时段起</span>
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="field">
          <span>时段止</span>
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <button
          className="primary-action"
          disabled={!airframe.trim() || !stand.trim() || !ata.trim()}
          onClick={() => onCreate(createCard({ airframe, ata, stand, start, end, toolIds: [] }))}
        >
          登记新工卡
        </button>
      </div>
    </section>
  );
}

export default App;
