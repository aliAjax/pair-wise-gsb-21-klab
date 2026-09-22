import { useState } from "react";
import type { TorqueTool, WorkCard } from "../data/types";
import type { CardInput, Conflict } from "../domain/rules";
import { ConflictReport, Field } from "./widgets";

export function SupplementDialog({
  source,
  tools,
  onCancel,
  onSaveDraft,
  onPromote,
}: {
  source: WorkCard;
  tools: TorqueTool[];
  onCancel: () => void;
  onSaveDraft: (input: CardInput, draftId?: string) => { conflicts: Conflict[]; draft?: WorkCard };
  onPromote: (draft: WorkCard, input: CardInput, reason: string) => Conflict[];
}) {
  const [aircraft, setAircraft] = useState(source.aircraft);
  const [ata, setAta] = useState(source.ata);
  const [stand, setStand] = useState(source.stand);
  const [start, setStart] = useState(source.start);
  const [end, setEnd] = useState(source.end);
  const [toolIds, setToolIds] = useState<string[]>(source.toolIds);
  const [mechanic, setMechanic] = useState(source.mechanic);
  const [reason, setReason] = useState("");
  const [draft, setDraft] = useState<WorkCard | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);

  const input: CardInput = { aircraft, ata, stand, start, end, toolIds, mechanic, pendingTags: [] };

  return (
    <div className="modal-mask" onClick={onCancel}>
      <div className="modal panel" onClick={(e) => e.stopPropagation()}>
        <div className="section-heading">
          <div>
            <p>签署后冻结 · 补录另存版本</p>
            <h2>
              {source.cardNo}（v{source.version}）补录
            </h2>
          </div>
          <button onClick={onCancel}>关闭</button>
        </div>

        <p className="modal-note">
          原签署卡不可修改。补录内容先保存为草稿（不占机位 / 工具），登记时必须填写补录原因，
          通过机位、工具时段、校准、缺件四项校验后另存为同号 v{source.version + 1}，形成版本链。
        </p>

        <div className="field-grid">
          <Field label="机身（机号）">
            <input value={aircraft} onChange={(e) => setAircraft(e.target.value)} />
          </Field>
          <Field label="ATA 章节">
            <input value={ata} onChange={(e) => setAta(e.target.value)} />
          </Field>
          <Field label="机位">
            <input value={stand} onChange={(e) => setStand(e.target.value)} />
          </Field>
          <Field label="机械师">
            <input value={mechanic} onChange={(e) => setMechanic(e.target.value)} />
          </Field>
          <Field label="时段开始">
            <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="时段结束">
            <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>

        <fieldset className="tool-pick">
          <legend>扭矩工具</legend>
          <div className="tool-checks">
            {tools.map((t) => (
              <button
                type="button"
                key={t.id}
                className={toolIds.includes(t.id) ? "tool-chip selected" : "tool-chip"}
                onClick={() =>
                  setToolIds((prev) =>
                    prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id],
                  )
                }
              >
                <b>{t.code}</b>
                <em>校准至 {t.calibratedUntil}</em>
              </button>
            ))}
          </div>
        </fieldset>

        <Field label="补录原因（登记新版本时必填）">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="如：签署后补录右发滑油滤紧固复测，需另存版本留痕。"
          />
        </Field>

        <ConflictReport conflicts={conflicts} />

        <div className="form-actions">
          <button
            onClick={() => {
              const result = onSaveDraft(input, draft?.id);
              setConflicts(result.conflicts);
              if (result.conflicts.length === 0 && result.draft) {
                setDraft(result.draft);
              }
            }}
          >
            {draft ? "覆盖保存草稿" : "先存为补录草稿"}
          </button>
          <button
            className="primary-action"
            disabled={!draft}
            title={draft ? "校验通过即另存为新版本" : "请先保存草稿，再登记为新版本"}
            onClick={() => {
              if (!draft) return;
              setConflicts(onPromote(draft, input, reason));
            }}
          >
            带原因登记为 v{source.version + 1}
          </button>
        </div>
        {draft ? <p className="muted-text small">草稿已暂存（编号 {source.cardNo}），可继续修改后登记。</p> : null}
      </div>
    </div>
  );
}
