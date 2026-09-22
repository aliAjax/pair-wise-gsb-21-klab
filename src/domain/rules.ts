import type { MissingTag, ToolLoan, TorqueTool, WorkCard } from "../data/types";

// 判定层：所有规则均为纯函数，不读写存储、不依赖界面。
// 冲突一律返回"原值"（输入值与被占用记录的值），由界面负责展示。

export type ConflictCode =
  | "FIELD_REQUIRED"
  | "TIME_INVALID"
  | "STAND_OVERLAP"
  | "TOOL_OVERLAP"
  | "CALIBRATION_EXPIRED"
  | "TAG_OPEN";

export interface Conflict {
  code: ConflictCode;
  /** 发生冲突的字段 / 对象 */
  field: string;
  message: string;
  /** 当前输入的原值 */
  enteredValue: string;
  /** 被比对的原值（占用记录 / 工具台账值） */
  existingValue: string;
}

export interface CardInput {
  aircraft: string;
  ata: string;
  stand: string;
  start: string;
  end: string;
  toolIds: string[];
  mechanic: string;
  /** 登记时随卡挂上的未解除缺件挂签描述（非空即视为缺件未解除） */
  pendingTags: { part: string; description: string }[];
}

/** 占用机位与工具时段的状态：草稿不占资源；rejected 不入库 */
export const OCCUPYING: ReadonlySet<WorkCard["status"]> = new Set([
  "registered",
  "signed",
  "closed",
]);

/** 半开区间 [s1,e1) 与 [s2,e2) 是否重叠；端点相接不算重叠 */
export function overlaps(
  s1: string,
  e1: string,
  s2: string,
  e2: string,
): boolean {
  return s1 < e2 && s2 < e1;
}

/** 日期（YYYY-MM-DD）转 UTC 日值，仅用于按日比较校准有效期 */
function dayValue(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
}

/** 校准有效期含当日；validAt 在有效期日期当天仍有效，次日起过期 */
export function isCalibrated(tool: TorqueTool, validAt: string): boolean {
  if (!validAt || !tool.calibratedUntil) return false;
  const day = validAt.slice(0, 10);
  return dayValue(day) <= dayValue(tool.calibratedUntil);
}

/** 距校准到期天数（0 表示今天到期，负数表示已过期） */
export function daysUntilDue(tool: TorqueTool, today: string): number {
  const ms = dayValue(tool.calibratedUntil) - dayValue(today.slice(0, 10));
  return Math.round(ms / 86_400_000);
}

function fmtRange(start: string, end: string): string {
  return `${fmtTime(start)} – ${fmtTime(end)}`;
}

function fmtTime(value: string): string {
  return value.replace("T", " ");
}

const requiredFields: { key: keyof CardInput; label: string }[] = [
  { key: "aircraft", label: "机身" },
  { key: "ata", label: "ATA章节" },
  { key: "stand", label: "机位" },
  { key: "start", label: "时段开始" },
  { key: "end", label: "时段结束" },
  { key: "mechanic", label: "签署 / 机械师" },
];

/**
 * 整卡校验：任一规则不通过即整卡拒绝，返回全部冲突（含原值）。
 * 同一条版本链（sameSeriesId）的卡互不判重；草稿与未占用资源的卡不参与比对。
 */
export function validateCard(params: {
  input: CardInput;
  cards: WorkCard[];
  tools: TorqueTool[];
  tags: MissingTag[];
  sameSeriesId?: string;
}): Conflict[] {
  const { input, cards, tools, tags, sameSeriesId } = params;
  const conflicts: Conflict[] = [];

  for (const f of requiredFields) {
    const value = input[f.key];
    const missing =
      typeof value === "string" ? value.trim() === "" : input.toolIds.length === 0;
    if (missing) {
      conflicts.push({
        code: "FIELD_REQUIRED",
        field: f.label,
        message: `${f.label}未填写，整卡不可登记。`,
        enteredValue: "（空）",
        existingValue: "—",
      });
    }
  }
  if (input.toolIds.length === 0) {
    conflicts.push({
      code: "FIELD_REQUIRED",
      field: "扭矩工具",
      message: "至少登记一件扭矩工具，整卡不可登记。",
      enteredValue: "（空）",
      existingValue: "—",
    });
  }

  if (input.start && input.end && input.end <= input.start) {
    conflicts.push({
      code: "TIME_INVALID",
      field: "施工时段",
      message: "时段结束必须晚于开始。",
      enteredValue: fmtRange(input.start, input.end),
      existingValue: "—",
    });
  }

  // 以下比对依赖时段合法
  const timeReady = input.start && input.end && input.end > input.start;

  // 每条版本链只有最新版本占用机位 / 工具资源（被新版本取代的旧卡仍冻结留痕，但不再占资源）
  const latestBySeries = new Map<string, WorkCard>();
  for (const c of cards) {
    if (c.status === "draft") continue;
    const cur = latestBySeries.get(c.seriesId);
    if (!cur || c.version > cur.version) latestBySeries.set(c.seriesId, c);
  }
  const occupants = new Set([...latestBySeries.values()].map((c) => c.id));

  if (input.stand.trim() && timeReady) {
    for (const other of cards) {
      if (other.seriesId === sameSeriesId) continue;
      if (!occupants.has(other.id)) continue;
      if (other.stand !== input.stand.trim()) continue;
      if (overlaps(input.start, input.end, other.start, other.end)) {
        conflicts.push({
          code: "STAND_OVERLAP",
          field: `机位 ${input.stand}`,
          message: `机位时段与工卡 ${other.cardNo}（v${other.version}，${other.aircraft}）重叠，机位同一时段只能派一张工卡。`,
          enteredValue: fmtRange(input.start, input.end),
          existingValue: `${other.cardNo} v${other.version} ${fmtRange(other.start, other.end)}`,
        });
      }
    }
  }

  const toolMap = new Map(tools.map((t) => [t.id, t]));

  for (const toolId of input.toolIds) {
    const tool = toolMap.get(toolId);
    if (!tool) continue;

    // 校准过期：借用起始时刻必须仍在校准有效期内
    if (input.start && !isCalibrated(tool, input.start)) {
      conflicts.push({
        code: "CALIBRATION_EXPIRED",
        field: `工具 ${tool.code}`,
        message: `扭矩工具 ${tool.code} 校准已过期，不得登记上卡。`,
        enteredValue: `借用起始 ${fmtTime(input.start)}`,
        existingValue: `校准有效期至 ${tool.calibratedUntil}`,
      });
    }

    if (!timeReady) continue;

    // 工具时段重叠：与该工具其他占用卡的施工时段比对
    for (const other of cards) {
      if (other.seriesId === sameSeriesId) continue;
      if (!occupants.has(other.id)) continue;
      if (!other.toolIds.includes(toolId)) continue;
      if (overlaps(input.start, input.end, other.start, other.end)) {
        conflicts.push({
          code: "TOOL_OVERLAP",
          field: `工具 ${tool.code}`,
          message: `工具 ${tool.code} 时段与工卡 ${other.cardNo}（v${other.version}）重叠，工具同一时段不能被两张工卡占用。`,
          enteredValue: fmtRange(input.start, input.end),
          existingValue: `${other.cardNo} v${other.version} ${fmtRange(other.start, other.end)}`,
        });
      }
    }
  }

  // 缺件挂签未解除：随卡登记的未解除挂签即整卡拒绝
  for (const tag of input.pendingTags) {
    if (tag.description.trim() || tag.part.trim()) {
      conflicts.push({
        code: "TAG_OPEN",
        field: "缺件挂签",
        message: "存在未解除缺件挂签，缺件清零前整卡拒绝登记。",
        enteredValue: `${tag.part || "（未填件号）"}：${tag.description || "（未填描述）"}`,
        existingValue: "挂签状态 open",
      });
    }
  }

  return conflicts;
}

/** 签署门禁：缺件必须清零 */
export function signConflicts(
  card: WorkCard,
  tags: MissingTag[],
  signer: string,
): Conflict[] {
  const conflicts: Conflict[] = [];
  const open = tags.filter((t) => t.cardId === card.id && t.status === "open");
  for (const tag of open) {
    conflicts.push({
      code: "TAG_OPEN",
      field: `挂签 ${tag.tagNo}`,
      message: "签署前缺件必须清零，请先解除挂签再签署。",
      enteredValue: `${tag.part}：${tag.description}`,
      existingValue: "挂签状态 open",
    });
  }
  if (signer.trim() === "") {
    conflicts.push({
      code: "FIELD_REQUIRED",
      field: "签署人",
      message: "签署人未填写。",
      enteredValue: "（空）",
      existingValue: "—",
    });
  }
  return conflicts;
}

/** 结卡门禁：工具必须全部归还 */
export function closeConflicts(card: WorkCard, loans: ToolLoan[]): Conflict[] {
  const conflicts: Conflict[] = [];
  const openLoans = loans.filter((l) => l.cardId === card.id && !l.returnedAt);
  for (const loan of openLoans) {
    conflicts.push({
      code: "TOOL_OVERLAP",
      field: "未归还工具",
      message: "工具未归还不得结卡，请先办理归还并记录校准状态。",
      enteredValue: `借用起始 ${fmtTime(loan.borrowAt)}`,
      existingValue: "归还时间 （空）",
    });
  }
  return conflicts;
}
