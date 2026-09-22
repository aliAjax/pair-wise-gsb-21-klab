import { useState } from "react";
import type { CardInput } from "../domain/rules";
import type { TorqueTool, WorkCard } from "../data/types";
import { localDateTime } from "../domain/workshop";
import { Badge, ConflictReport, Field } from "./widgets";

const ATA_CHAPTERS = [
  "ATA 05-00 时限 / 维护检查",
  "ATA 12-00 勤务",
  "ATA 21-00 空调",
  "ATA 24-00 电源",
  "ATA 27-00 飞行操纵",
  "ATA 32-11 起落架 · 机轮刹车",
  "ATA 36-00 引气",
  "ATA 49-00 辅助动力",
  "ATA 72-00 发动机",
];

export function AdmissionForm({
  tools,
  defaultStart,
  onAdmit,
}: {
  tools: TorqueTool[];
  defaultStart: string;
  onAdmit: (input: CardInput) => import("../domain/rules").Conflict[];
}) {
  const [aircraft, setAircraft] = useState("B-6612");
  const [ata, setAta] = useState(ATA_CHAPTERS[5]);
  const [stand, setStand] = useState("机位 8");
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(shiftHour(defaultStart, 3));
  const [toolIds, setToolIds] = useState<string[]>(["T-1"]);
  const [mechanic, setMechanic] = useState("李工");
  const [tagPart, setTagPart] = useState("");
  const [tagDesc, setTagDesc] = useState("");
  const [conflicts, setConflicts] = useState<import("../domain/rules").Conflict[]>([]);

  const toggleTool = (id: string) => {
    setConflicts([]);
    setToolIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  };

  const submit = () => {
    const pending =
      tagPart.trim() || tagDesc.trim() ? [{ part: tagPart, description: tagDesc }] : [];
    const input: CardInput = { aircraft, ata, stand, start, end, toolIds, mechanic, pendingTags: pending };
    const result = onAdmit(input);
    setConflicts(result);
    if (result.length === 0) {
      setTagPart("");
      setTagDesc("");
    }
  };

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>工卡登记台</p>
          <h2>登记新工卡</h2>
        </div>
        <Badge tone="info">机位 / 工具 / 校准 / 缺件 四检</Badge>
      </div>

      <div className="field-grid">
        <Field label="机身（机号）">
          <input value={aircraft} onChange={(e) => setAircraft(e.target.value)} placeholder="如 B-6612" />
        </Field>
        <Field label="ATA 章节">
          <select value={ata} onChange={(e) => setAta(e.target.value)}>
            {ATA_CHAPTERS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="机位">
          <input value={stand} onChange={(e) => setStand(e.target.value)} placeholder="如 机位 8" />
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
        <legend>扭矩工具登记（多选，校验校准有效期与占用时段）</legend>
        <div className="tool-checks">
          {tools.map((t) => (
            <button
              type="button"
              key={t.id}
              className={toolIds.includes(t.id) ? "tool-chip selected" : "tool-chip"}
              onClick={() => toggleTool(t.id)}
            >
              <b>{t.code}</b>
              <span>{t.name}</span>
              <small>{t.range}</small>
              <em>校准至 {t.calibratedUntil}</em>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="tag-pick">
        <legend>缺件挂签（登记时如有未解除缺件，整卡将被拒绝）</legend>
        <div className="field-grid">
          <Field label="件号 / 数量">
            <input value={tagPart} onChange={(e) => setTagPart(e.target.value)} placeholder="如 件号 P562-3 / 1 件" />
          </Field>
          <Field label="缺件描述">
            <input value={tagDesc} onChange={(e) => setTagDesc(e.target.value)} placeholder="留空表示不缺件" />
          </Field>
        </div>
      </fieldset>

      <ConflictReport conflicts={conflicts} />

      <div className="form-actions">
        <button className="primary-action" onClick={submit}>
          提交登记（冲突即整卡拒绝）
        </button>
      </div>
    </section>
  );
}

function shiftHour(value: string, hours: number): string {
  const d = new Date(value.replace("T", ":"));
  if (Number.isNaN(d.getTime())) return localDateTime();
  d.setHours(d.getHours() + hours);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}
