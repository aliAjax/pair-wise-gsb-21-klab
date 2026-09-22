// 界面层：工卡列表
import type { Database } from "../data/types";
import { fmt } from "../domain/rules";
import { Badge } from "./widgets";

export function CardList({
  db,
  selectedId,
  onSelect,
}: {
  db: Database;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="panel card-list-panel">
      <div className="panel-head">
        <h2>维修工卡</h2>
        <span className="hint">机位 / 工具时段冲突整卡拒绝</span>
      </div>
      <div className="card-list">
        {db.cards.map((c) => {
          const openTags = c.tags.filter((t) => !t.resolvedAt).length;
          const unreturned = c.loans.filter((l) => !l.returnedAt).length;
          return (
            <button
              key={c.id}
              className={`card-row ${selectedId === c.id ? "selected" : ""}`}
              onClick={() => onSelect(c.id)}
            >
              <div className="card-row-top">
                <strong>{c.id}</strong>
                <Badge status={c.status} />
              </div>
              <p className="card-row-main">
                {c.airframe || "（未填机身）"} · {c.ata || "（未填ATA）"}
              </p>
              <p className="card-row-sub">
                机位 {c.stand || "—"} · {fmt(c.start) || "时段未填"} ~ {fmt(c.end) || ""}
              </p>
              <p className="card-row-flags">
                {openTags > 0 && <span className="flag flag-danger">缺件挂签 {openTags}</span>}
                {unreturned > 0 && <span className="flag flag-warn">工具未还 {unreturned}</span>}
                {c.versions.length > 0 && <span className="flag flag-info">版本 v{c.versions.length}</span>}
                {openTags === 0 && unreturned === 0 && c.status !== "draft" && (
                  <span className="flag flag-ok">无挂起项</span>
                )}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
