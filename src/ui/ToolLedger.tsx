// 界面层：扭矩工具台账（校准状态 / 停用状态）
import type { Database, TorqueTool } from "../data/types";
import { fmt } from "../domain/rules";

export function ToolLedger({ db }: { db: Database }) {
  const today = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const todayStr = `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`;

  // 汇总每件工具当前未归还借用
  const loansByTool = new Map<string, { cardId: string; end: string }[]>();
  db.cards.forEach((c) => {
    c.loans.forEach((l) => {
      if (!l.returnedAt) {
        const list = loansByTool.get(l.toolId) ?? [];
        list.push({ cardId: c.id, end: l.end });
        loansByTool.set(l.toolId, list);
      }
    });
  });

  return (
    <aside className="panel tool-panel">
      <div className="panel-head">
        <h2>扭矩工具台账</h2>
        <span className="hint">归还异常自动停用</span>
      </div>
      <div className="tool-list">
        {db.tools.map((t) => (
          <ToolRow key={t.id} tool={t} today={todayStr} loans={loansByTool.get(t.id) ?? []} />
        ))}
      </div>
    </aside>
  );
}

function ToolRow({ tool, today, loans }: { tool: TorqueTool; today: string; loans: { cardId: string; end: string }[] }) {
  const expired = today > tool.calibrateDue;
  const days = Math.round((new Date(tool.calibrateDue).getTime() - new Date(today).getTime()) / 86400000);
  const out = loans.length > 0;
  return (
    <article className={`tool-row ${tool.quarantine ? "tool-quarantine" : expired ? "tool-expired" : ""}`}>
      <header>
        <strong>{tool.id}</strong>
        <span className="tool-state">
          {tool.quarantine ? "停用" : expired ? "校准过期" : out ? "借出中" : "在库"}
        </span>
      </header>
      <p className="tool-name">{tool.name} · {tool.spec}</p>
      <p className="tool-sn">序列号 {tool.serial}</p>
      <dl className="tool-meta">
        <div>
          <dt>本次校准</dt>
          <dd>{tool.calibratedAt}</dd>
        </div>
        <div>
          <dt>到期</dt>
          <dd>{tool.calibrateDue}{!tool.quarantine && !expired && days <= 14 ? `（剩${days}天）` : ""}</dd>
        </div>
      </dl>
      {out && (
        <p className="tool-loans">
          未归还：{loans.map((l) => `${l.cardId}（应还 ${fmt(l.end)}）`).join("，")}
        </p>
      )}
    </article>
  );
}
