import type { ReactNode } from "react";
import type { CardStatus } from "../data/types";
import type { Conflict } from "../domain/rules";
import { fmtDateTime } from "../domain/workshop";

// 界面层：只负责渲染与收集输入；字段含义、门禁结论全部来自 domain。

export function Badge({ tone, children }: { tone: "ok" | "warn" | "danger" | "muted" | "info"; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export const STATUS_TONE: Record<CardStatus, "ok" | "warn" | "danger" | "muted" | "info"> = {
  draft: "muted",
  registered: "info",
  signed: "ok",
  closed: "muted",
};

export const STATUS_TEXT: Record<CardStatus, string> = {
  draft: "补录草稿",
  registered: "已登记",
  signed: "已签署 · 冻结",
  closed: "已结卡",
};

export function ConflictReport({ conflicts, title = "整卡拒绝 · 冲突清单" }: { conflicts: Conflict[]; title?: string }) {
  if (conflicts.length === 0) return null;
  return (
    <div className="conflict-box" role="alert">
      <h4>⛔ {title}</h4>
      <ul>
        {conflicts.map((c, i) => (
          <li key={`${c.code}-${c.field}-${i}`}>
            <p className="conflict-msg">{c.message}</p>
            <div className="conflict-values">
              <span>
                <b>录入原值</b>
                <em>{c.enteredValue}</em>
              </span>
              <span>
                <b>冲突原值</b>
                <em>{c.existingValue}</em>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>
        {label}
        {hint ? <small>{hint}</small> : null}
      </span>
      {children}
    </label>
  );
}

export function TimeText({ value }: { value: string | null }) {
  return <>{fmtDateTime(value)}</>;
}
