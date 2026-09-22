import { useState } from "react";
import type { WorkCard } from "../data/types";
import type { Conflict } from "../domain/rules";
import { Badge, ConflictReport } from "./widgets";

export function DraftsPanel({
  drafts,
  onPromote,
  onDiscard,
}: {
  drafts: WorkCard[];
  onPromote: (draft: WorkCard, reason: string) => Conflict[];
  onDiscard: (draftId: string) => Conflict[];
}) {
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [errorsById, setErrorsById] = useState<Record<string, Conflict[]>>({});

  if (drafts.length === 0) return null;

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>补录暂存</p>
          <h2>补录草稿（不占机位 / 工具）</h2>
        </div>
        <Badge tone="muted">{drafts.length} 张待登记</Badge>
      </div>
      <div className="draft-list">
        {drafts.map((d) => (
          <article key={d.id} className="draft-card">
            <div className="draft-head">
              <b>{d.cardNo}</b>
              <span>
                {d.aircraft} · {d.ata} · {d.stand}
              </span>
              <span className="mono small">
                {d.start.replace("T", " ")} – {d.end.replace("T", " ")}
              </span>
            </div>
            <input
              placeholder="补录原因（必填，否则不能另存版本）"
              value={reasonById[d.id] ?? ""}
              onChange={(e) => setReasonById((p) => ({ ...p, [d.id]: e.target.value }))}
            />
            <ConflictReport conflicts={errorsById[d.id] ?? []} title="登记拒绝 · 冲突清单" />
            <div className="draft-actions">
              <button
                className="primary-action mini"
                onClick={() => {
                  const result = onPromote(d, reasonById[d.id] ?? "");
                  setErrorsById((p) => ({ ...p, [d.id]: result }));
                }}
              >
                校验并另存新版本
              </button>
              <button
                className="mini"
                onClick={() => setErrorsById((p) => ({ ...p, [d.id]: onDiscard(d.id) }))}
              >
                删除草稿
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
