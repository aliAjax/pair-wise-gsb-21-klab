// 判定层：时段重叠、校准、缺件、签署、结卡规则
// 输入纯数据，输出纯数据；不依赖 React、localStorage 与界面

import type {
  CardSnapshot,
  Conflict,
  Database,
  TorqueTool,
  ToolLoan,
  WorkCard,
} from "../data/types";

// ---------- 基础判定 ----------

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  // 半开区间：一端相等不算占用冲突
  return Boolean(aStart && aEnd && bStart && bEnd) && aStart < bEnd && bStart < aEnd;
}

export function isCalibrationValid(tool: TorqueTool, at: string): boolean {
  // at 为 datetime-local，取日期部分与校准到期日比较（到期日当天仍有效）
  const day = at.slice(0, 10);
  return Boolean(tool.calibrateDue) && day <= tool.calibrateDue;
}

// ---------- 整卡校验：提交 / 签署 / 补录共用 ----------

interface ValidateOptions {
  /** 签署校验：缺件必须清零 */
  requireTagsClear?: boolean;
}

export function validateCard(
  db: Database,
  cardId: string,
  candidate: CardSnapshot,
  opts: ValidateOptions = {},
): Conflict[] {
  const conflicts: Conflict[] = [];
  const toolsById = new Map(db.tools.map((t) => [t.id, t]));
  const at = candidate.start || candidate.end;

  // 1) 字段与时段本身
  if (!candidate.airframe.trim()) {
    conflicts.push(fieldConflict("机身（机号）", "空"));
  }
  if (!candidate.ata.trim()) {
    conflicts.push(fieldConflict("ATA章节", "空"));
  }
  if (!candidate.stand.trim()) {
    conflicts.push(fieldConflict("机位", "空"));
  }
  if (!candidate.start || !candidate.end) {
    conflicts.push(fieldConflict("作业时段", `${candidate.start || "—"} ~ ${candidate.end || "—"}`));
  } else if (candidate.start >= candidate.end) {
    conflicts.push({
      kind: "window",
      title: "作业时段无效",
      message: "时段起始必须早于结束",
      facts: [
        { label: "起始", value: fmt(candidate.start) },
        { label: "结束", value: fmt(candidate.end) },
      ],
    });
  }

  const loans: ToolLoan[] = [];

  candidate.loans.forEach((loan, index) => {
    const tool = toolsById.get(loan.toolId);
    const label = `扭矩工具 #${index + 1}（${loan.toolId}）`;

    if (!loan.start || !loan.end || loan.start >= loan.end) {
      conflicts.push({
        kind: "window",
        title: `${label} 借用时段无效`,
        message: "借用起始必须早于结束",
        facts: [
          { label: "借用起始", value: fmt(loan.start) || "空" },
          { label: "计划归还", value: fmt(loan.end) || "空" },
        ],
      });
      return;
    }

    // 借用时段必须落在作业时段内
    if (
      candidate.start &&
      candidate.end &&
      (loan.start < candidate.start || loan.end > candidate.end)
    ) {
      conflicts.push({
        kind: "window",
        title: `${label} 借用时段超出作业时段`,
        message: "工具借用 / 归还须在工卡作业时段内",
        facts: [
          { label: "作业时段", value: `${fmt(candidate.start)} ~ ${fmt(candidate.end)}` },
          { label: "借用时段", value: `${fmt(loan.start)} ~ ${fmt(loan.end)}` },
        ],
      });
    }

    if (!tool) {
      conflicts.push({
        kind: "field",
        title: `${label} 不在工具台账`,
        message: "工具编号已注销或不存在",
        facts: [{ label: "工具编号原值", value: loan.toolId }],
      });
      return;
    }

    // 2) 工具校准过期
    if (!isCalibrationValid(tool, loan.start)) {
      conflicts.push({
        kind: "calibration",
        title: `${tool.name} 校准已过期`,
        message: `借用起始日晚于校准到期日 ${tool.calibrateDue}`,
        facts: [
          { label: "工具编号", value: tool.id },
          { label: "本次校准", value: tool.calibratedAt },
          { label: "校准到期", value: tool.calibrateDue },
          { label: "借用起始原值", value: fmt(loan.start) },
        ],
      });
    }

    // 3) 工具已停用（归还异常）
    if (tool.quarantine) {
      conflicts.push({
        kind: "quarantine",
        title: `${tool.name} 已停用`,
        message: "上一次归还判定校准封记异常，工具停用中，不得借用",
        facts: [
          { label: "工具编号", value: tool.id },
          { label: "当前状态", value: "停用 / quarantine" },
        ],
      });
    }

    loans.push(loan);
  });

  // 4) 同卡内同一工具借用时段重叠
  for (let i = 0; i < loans.length; i++) {
    for (let j = i + 1; j < loans.length; j++) {
      if (
        loans[i].toolId === loans[j].toolId &&
        overlaps(loans[i].start, loans[i].end, loans[j].start, loans[j].end)
      ) {
        conflicts.push({
          kind: "tool-overlap",
          title: `同卡内工具 ${loans[i].toolId} 借用时段重叠`,
          message: "同一扭矩工具不能在同一时段重复占用",
          facts: [
            { label: "时段①原值", value: `${fmt(loans[i].start)} ~ ${fmt(loans[i].end)}` },
            { label: "时段②原值", value: `${fmt(loans[j].start)} ~ ${fmt(loans[j].end)}` },
          ],
        });
      }
    }
  }

  // 5) 跨卡冲突：机位占用、工具占用（只与已提交、非本卡的工卡比）
  const others = db.cards.filter((c) => c.id !== cardId);

  for (const other of others) {
    if (candidate.stand && candidate.start && candidate.end &&
        other.stand.trim() && candidate.stand.trim() === other.stand.trim() &&
        overlaps(candidate.start, candidate.end, other.start, other.end)) {
      conflicts.push({
        kind: "stand",
        title: `机位 ${candidate.stand} 时段重叠`,
        message: `与工卡 ${other.id}（机身 ${other.airframe} / ${statusLabel(other.status)}）占用冲突`,
        facts: [
          { label: "本卡时段原值", value: `${fmt(candidate.start)} ~ ${fmt(candidate.end)}` },
          { label: `${other.id} 时段原值`, value: `${fmt(other.start)} ~ ${fmt(other.end)}` },
          { label: "机位原值", value: candidate.stand },
        ],
      });
    }

    for (const loan of loans) {
      for (const otherLoan of other.loans) {
        if (
          loan.toolId === otherLoan.toolId &&
          overlaps(loan.start, loan.end, otherLoan.start, otherLoan.end)
        ) {
          conflicts.push({
            kind: "tool-overlap",
            title: `工具 ${loan.toolId} 跨卡借用时段重叠`,
            message: `与工卡 ${other.id}（${statusLabel(other.status)}）冲突`,
            facts: [
              { label: `本卡 ${loan.toolId} 时段原值`, value: `${fmt(loan.start)} ~ ${fmt(loan.end)}` },
              { label: `${other.id} 时段原值`, value: `${fmt(otherLoan.start)} ~ ${fmt(otherLoan.end)}` },
            ],
          });
        }
      }
    }
  }

  // 6) 缺件挂签
  const openTags = candidate.tags.filter((t) => !t.resolvedAt);
  if (openTags.length > 0) {
    for (const tag of openTags) {
      conflicts.push({
        kind: "tag",
        title: opts.requireTagsClear
          ? `缺件挂签 ${tag.id} 未解除，禁止签署`
          : `存在未解除缺件挂签 ${tag.id}`,
        message: opts.requireTagsClear
          ? "签署前缺件必须清零，请先解除挂签或改为补录版本"
          : "缺件未解除，工卡不得提交（缺件放行挂签中）",
        facts: [
          { label: "件号原值", value: tag.pn || "—" },
          { label: "名称", value: tag.name || "—" },
          { label: "数量", value: String(tag.qty) },
          { label: "挂签时间", value: fmt(tag.createdAt) },
        ],
      });
    }
  }

  return conflicts;
}

// ---------- 签署 / 结卡前置 ----------

export function signBlockers(db: Database, card: WorkCard): Conflict[] {
  // 签署：通过整卡校验且缺件清零
  return validateCard(db, card.id, snapshotOf(card), { requireTagsClear: true });
}

export function closeBlockers(card: WorkCard): Conflict[] {
  const conflicts: Conflict[] = [];
  const open = card.tags.filter((t) => !t.resolvedAt);
  open.forEach((tag) => {
    conflicts.push({
      kind: "tag",
      title: `缺件挂签 ${tag.id} 未解除`,
      message: "缺件未清零，不得结卡",
      facts: [
        { label: "件号原值", value: tag.pn || "—" },
        { label: "数量", value: String(tag.qty) },
      ],
    });
  });
  card.loans.forEach((loan) => {
    if (!loan.returnedAt) {
      conflicts.push({
        kind: "return",
        title: `工具 ${loan.toolId} 未归还`,
        message: "未归还扭矩工具不得结卡",
        facts: [
          { label: "借用起始原值", value: fmt(loan.start) },
          { label: "计划归还原值", value: fmt(loan.end) },
          { label: "实际归还", value: "未归还" },
        ],
      });
    }
  });
  return conflicts;
}

// ---------- 工具 ----------

export function snapshotOf(card: WorkCard): CardSnapshot {
  const { airframe, ata, stand, start, end, loans, tags } = card;
  return { airframe, ata, stand, start, end, loans, tags };
}

export function fmt(value: string | null): string {
  if (!value) return "";
  return value.replace("T", " ");
}

function fieldConflict(label: string, value: string): Conflict {
  return {
    kind: "field",
    title: `${label}缺失或无效`,
    message: "该字段为必填项",
    facts: [{ label: `${label}原值`, value }],
  };
}

export function statusLabel(status: WorkCard["status"]): string {
  return (
    { draft: "草稿", active: "已提交", signed: "已签署冻结", closed: "已结卡" } as const
  )[status];
}
