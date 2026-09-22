// 界面层：共用小组件
import type { Conflict } from "../data/types";
import { statusLabel } from "../domain/rules";
import type { CardStatus } from "../data/types";

export function Badge({ status }: { status: CardStatus }) {
  const cls = {
    draft: "badge-draft",
    active: "badge-active",
    signed: "badge-signed",
    closed: "badge-closed",
  }[status];
  return <span className={`badge ${cls}`}>{statusLabel(status)}</span>;
}

export function ConflictPanel({ conflicts }: { conflicts: Conflict[] }) {
  if (conflicts.length === 0) return null;
  return (
    <section className="conflict-box">
      <h3>整卡拒绝 · 共 {conflicts.length} 条冲突（附原值）</h3>
      <ol>
        {conflicts.map((c, i) => (
          <li key={i}>
            <div className="conflict-title">
              <span className="conflict-kind">{kindLabel(c.kind)}</span>
              {c.title}
            </div>
            <p>{c.message}</p>
            {c.facts.length > 0 && (
              <dl>
                {c.facts.map((f) => (
                  <div key={f.label}>
                    <dt>{f.label}</dt>
                    <dd>{f.value || "—"}</dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Notice({ kind, children }: { kind: "ok" | "info"; children: React.ReactNode }) {
  return <p className={`notice notice-${kind}`}>{children}</p>;
}

function kindLabel(kind: Conflict["kind"]): string {
  return (
    {
      field: "字段",
      window: "时段",
      stand: "机位重叠",
      "tool-overlap": "工具重叠",
      calibration: "校准过期",
      quarantine: "工具停用",
      tag: "缺件",
      return: "未归还",
      state: "状态",
    } as const
  )[kind];
}
