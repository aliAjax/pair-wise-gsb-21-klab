import { useState } from "react";
import type { MissingTag, ToolLoan, TorqueTool, WorkCard } from "../data/types";
import type { CardSeries } from "../domain/selectors";
import type { Conflict } from "../domain/rules";
import { fmtDateTime } from "../domain/workshop";
import { Badge, ConflictReport, STATUS_TEXT, STATUS_TONE } from "./widgets";

type Handler = () => Conflict[];

export function CardSeriesView({
  series,
  tools,
  tags,
  loans,
  onRaiseTag,
  onClearTag,
  onSign,
  onClose,
  onSupplement,
}: {
  series: CardSeries;
  tools: TorqueTool[];
  tags: MissingTag[];
  loans: ToolLoan[];
  onRaiseTag: (cardId: string, part: string, desc: string) => Conflict[];
  onClearTag: (tagId: string, remark: string) => Conflict[];
  onSign: (cardId: string, signer: string) => Conflict[];
  onClose: (cardId: string) => Conflict[];
  onSupplement: (card: WorkCard) => void;
}) {
  const toolMap = new Map(tools.map((t) => [t.id, t]));
  const cardLoans = loans.filter((l) => l.cardId === series.current.id);
  const cardTags = tags.filter((t) => t.cardId === series.current.id);

  return (
    <article className="card-series">
      <header className="series-head">
        <div>
          <h3>{series.cardNo}</h3>
          <p>
            {series.aircraft} · {series.current.ata} · {series.current.stand}
          </p>
        </div>
        <div className="series-meta">
          <Badge tone={STATUS_TONE[series.current.status]}>{STATUS_TEXT[series.current.status]}</Badge>
          <Badge tone="muted">版本链 v1 – v{series.latestVersion}</Badge>
        </div>
      </header>

      <div className="version-chain">
        {series.versions.map((v) => {
          const isCurrent = v.id === series.current.id;
          return (
            <div key={v.id} className={isCurrent ? "version-node current" : "version-node old"}>
              <div className="version-tag">v{v.version}</div>
              <div className="version-body">
                <p>
                  {fmtRange(v)} · {v.mechanic}
                  {v.signer ? ` · 签署 ${v.signer}` : ""}
                </p>
                {v.supplementReason ? (
                  <p className="supplement-reason">
                    <b>补录原因：</b>
                    {v.supplementReason}
                  </p>
                ) : null}
                {!isCurrent ? (
                  <p className="muted-text">已被 v{series.latestVersion} 取代，原始记录冻结留痕、不再占用机位 / 工具。</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <CardBody
        card={series.current}
        toolMap={toolMap}
        cardLoans={cardLoans}
        cardTags={cardTags}
        onRaiseTag={onRaiseTag}
        onClearTag={onClearTag}
        onSign={onSign}
        onClose={onClose}
        onSupplement={onSupplement}
      />
    </article>
  );
}

function CardBody({
  card,
  toolMap,
  cardLoans,
  cardTags,
  onRaiseTag,
  onClearTag,
  onSign,
  onClose,
  onSupplement,
}: {
  card: WorkCard;
  toolMap: Map<string, TorqueTool>;
  cardLoans: ToolLoan[];
  cardTags: MissingTag[];
  onRaiseTag: (cardId: string, part: string, desc: string) => Conflict[];
  onClearTag: (tagId: string, remark: string) => Conflict[];
  onSign: (cardId: string, signer: string) => Conflict[];
  onClose: (cardId: string) => Conflict[];
  onSupplement: (card: WorkCard) => void;
}) {
  const [part, setPart] = useState("");
  const [desc, setDesc] = useState("");
  const [signer, setSigner] = useState("");
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const frozen = card.status === "signed" || card.status === "closed";

  const run = (handler: Handler) => {
    const result = handler();
    setConflicts(result);
    if (result.length === 0) {
      setPart("");
      setDesc("");
      setSigner("");
    }
  };

  return (
    <div className="card-body">
      <div className="kv-grid">
        <div>
          <span>施工时段</span>
          <b className="mono">{fmtRange(card)}</b>
        </div>
        <div>
          <span>扭矩工具</span>
          <b>{card.toolIds.map((id) => toolMap.get(id)?.code ?? id).join("、")}</b>
        </div>
        <div>
          <span>登记时间</span>
          <b className="mono">{fmtDateTime(card.createdAt)}</b>
        </div>
        <div>
          <span>签署 / 结卡</span>
          <b className="mono">
            {card.signedAt ? `${fmtDateTime(card.signedAt)}${card.signer ? ` · ${card.signer}` : ""}` : "未签署"}
            {card.closedAt ? ` / 结卡 ${fmtDateTime(card.closedAt)}` : ""}
          </b>
        </div>
      </div>

      <section className="sub-block">
        <h4>工具借用与归还</h4>
        {cardLoans.map((loan) => {
          const tool = toolMap.get(loan.toolId);
          return (
            <div key={loan.id} className="tag-line loan">
              <div>
                <b>{tool?.code ?? loan.toolId}</b> <span>{tool?.name}</span>
              </div>
              <div className="mono small">
                借 {fmtDateTime(loan.borrowAt)}（校准至 {loan.calibrationAtBorrow}）｜ 还{" "}
                {loan.returnedAt ? fmtDateTime(loan.returnedAt) : "未归还"}
                {loan.calibrationAtReturn ? `（校准至 ${loan.calibrationAtReturn}）` : ""}
              </div>
            </div>
          );
        })}
        {cardLoans.every((l) => l.returnedAt) && cardLoans.length > 0 ? (
          <p className="muted-text small">工具已全部归还。</p>
        ) : null}
      </section>

      <section className="sub-block">
        <h4>缺件挂签</h4>
        {cardTags.length === 0 ? <p className="muted-text small">无挂签，缺件为零。</p> : null}
        {cardTags.map((tag) => (
          <TagLine key={tag.id} tag={tag} onClear={onClearTag} readonly={frozen} />
        ))}

        {!frozen ? (
          <div className="tag-add">
            <input
              value={part}
              onChange={(e) => setPart(e.target.value)}
              placeholder="件号 / 数量"
            />
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="缺件描述"
            />
            <button
              className="mini"
              onClick={() => run(() => onRaiseTag(card.id, part, desc))}
            >
              补挂缺件签
            </button>
          </div>
        ) : (
          <p className="muted-text small">工卡已冻结，如需补录请另存版本。</p>
        )}
      </section>

      <ConflictReport conflicts={conflicts} title="操作拒绝 · 冲突清单" />

      <div className="card-actions">
        {card.status === "registered" ? (
          <>
            <input
              className="signer-input"
              value={signer}
              onChange={(e) => setSigner(e.target.value)}
              placeholder="放行签署人姓名"
            />
            <button className="primary-action" onClick={() => run(() => onSign(card.id, signer))}>
              缺件清零后签署（签署即冻结）
            </button>
          </>
        ) : null}
        {card.status === "signed" ? (
          <>
            <button className="primary-action" onClick={() => run(() => onClose(card.id))}>
              工具归还齐全后结卡
            </button>
            <button onClick={() => onSupplement(card)}>补录：带原因另存新版本</button>
          </>
        ) : null}
        {card.status === "closed" ? <Badge tone="muted">已结卡归档</Badge> : null}
      </div>
    </div>
  );
}

function TagLine({
  tag,
  onClear,
  readonly,
}: {
  tag: MissingTag;
  onClear: (tagId: string, remark: string) => Conflict[];
  readonly: boolean;
}) {
  const [remark, setRemark] = useState("");
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  return (
    <div className="tag-line">
      <div className="tag-head">
        <Badge tone={tag.status === "open" ? "danger" : "ok"}>
          {tag.status === "open" ? "未解除" : "已解除"}
        </Badge>
        <b>{tag.tagNo}</b>
        <span>
          {tag.part} · {tag.description}
        </span>
      </div>
      <div className="mono small">
        挂签 {fmtDateTime(tag.raisedAt)}
        {tag.clearedAt ? ` ｜ 解除 ${fmtDateTime(tag.clearedAt)}：${tag.clearRemark}` : ""}
      </div>
      {tag.status === "open" && !readonly ? (
        <div className="tag-add">
          <input
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="解除说明：来件 / 装机 / 复测结果"
          />
          <button
            className="mini ok"
            onClick={() => {
              const result = onClear(tag.id, remark);
              setConflicts(result);
            }}
          >
            缺件清零并解除
          </button>
        </div>
      ) : null}
      <ConflictReport conflicts={conflicts} title="解除失败" />
    </div>
  );
}

function fmtRange(card: WorkCard): string {
  return `${card.start.replace("T", " ")} – ${card.end.replace("T", " ")}`;
}
