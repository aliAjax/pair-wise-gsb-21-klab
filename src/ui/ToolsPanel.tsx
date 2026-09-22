import type { ToolLoan, TorqueTool, WorkCard } from "../data/types";
import type { ToolView } from "../domain/selectors";
import { fmtDateTime } from "../domain/workshop";
import { Badge } from "./widgets";

export function ToolsPanel({
  views,
  loans,
  cards,
  onReturn,
}: {
  views: ToolView[];
  loans: ToolLoan[];
  cards: WorkCard[];
  onReturn: (loanId: string) => void;
}) {
  const cardMap = new Map(cards.map((c) => [c.id, c]));
  const toolMap = new Map(views.map((v) => [v.tool.id, v.tool]));

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>扭矩工具台账</p>
          <h2>校准状态与借还</h2>
        </div>
        <Badge tone="muted">归还记录校准原值 · 未归还不得结卡</Badge>
      </div>

      <div className="tool-table">
        {views.map(({ tool, calibrationDays, calibrationState, activeLoans }) => (
          <article key={tool.id} className="tool-row">
            <div className="tool-id">
              <b>{tool.code}</b>
              <span>{tool.name}</span>
              <small>{tool.range}</small>
            </div>
            <div className="tool-cal">
              <Badge tone={calibrationState === "expired" ? "danger" : calibrationState === "due-soon" ? "warn" : "ok"}>
                {calibrationState === "expired"
                  ? `校准已过期 ${-calibrationDays} 天`
                  : calibrationState === "due-soon"
                    ? `${calibrationDays} 天后到期`
                    : "校准有效"}
              </Badge>
              <span className="mono">有效期至 {tool.calibratedUntil}</span>
            </div>
            <div className="tool-loan">
              {activeLoans.length === 0 ? (
                <em className="muted-text">在库</em>
              ) : (
                activeLoans.map((loan) => {
                  const card = cardMap.get(loan.cardId);
                  return (
                    <div key={loan.id} className="loan-line">
                      <span>
                        借出 → {card?.cardNo ?? loan.cardId}
                        {card ? ` v${card.version}` : ""}
                      </span>
                      <span className="mono">{fmtDateTime(loan.borrowAt)}</span>
                      <button className="mini danger" onClick={() => onReturn(loan.id)}>
                        归还并记录校准状态
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </article>
        ))}
      </div>

      <h3 className="sub-title">全部借用 / 归还记录</h3>
      <div className="loan-history">
        {loans
          .slice()
          .sort((a, b) => b.borrowAt.localeCompare(a.borrowAt))
          .map((loan) => {
            const tool = toolMap.get(loan.toolId) as TorqueTool | undefined;
            const card = cardMap.get(loan.cardId);
            return (
              <div key={loan.id} className="history-line">
                <b>{tool?.code ?? loan.toolId}</b>
                <span>{card?.cardNo ?? loan.cardId}</span>
                <span className="mono">借 {fmtDateTime(loan.borrowAt)}</span>
                <span className="mono">还 {loan.returnedAt ? fmtDateTime(loan.returnedAt) : "未归还"}</span>
                <span className="mono">借时校准至 {loan.calibrationAtBorrow}</span>
                <span className="mono">还时校准至 {loan.calibrationAtReturn ?? "—"}</span>
              </div>
            );
          })}
      </div>
    </section>
  );
}
