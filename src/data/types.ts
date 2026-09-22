// 数据层：工卡 / 扭矩工具 / 缺件挂签 / 版本链 的结构定义
// 纯类型，不含任何判定与界面逻辑

export type CardStatus = "draft" | "active" | "signed" | "closed";

/** 扭矩工具台账 */
export interface TorqueTool {
  id: string; // 工具编号
  name: string; // 名称
  spec: string; // 量程规格
  serial: string; // 序列号
  calibratedAt: string; // 本次校准日期 YYYY-MM-DD
  calibrateDue: string; // 校准到期日期 YYYY-MM-DD
  quarantine: boolean; // 归还异常后停用
}

/** 工具借用 / 归还记录（挂在工卡上） */
export interface ToolLoan {
  toolId: string;
  start: string; // 借用起始（datetime-local）
  end: string; // 计划归还（datetime-local）
  returnedAt: string | null; // 实际归还时间
  returnCalibrationOk: boolean | null; // 归还时校准封记 / 状态
  returnNote: string; // 归还备注
}

/** 缺件挂签 */
export interface MissingTag {
  id: string;
  pn: string; // 件号
  name: string; // 名称
  qty: number; // 缺件数量
  reason: string; // 挂签原因
  createdAt: string;
  resolvedAt: string | null; // 解除时间，null 表示未解除
  resolution: string; // 解除说明
}

/** 被版本链固化的工卡内容快照 */
export interface CardSnapshot {
  airframe: string; // 机身（机号）
  ata: string; // ATA 章节
  stand: string; // 机位
  start: string; // 作业时段起
  end: string; // 作业时段止
  loans: ToolLoan[];
  tags: MissingTag[];
}

export interface CardVersion {
  version: number;
  reason: string; // 补录原因（必填）
  createdBy: string;
  createdAt: string;
  snapshot: CardSnapshot;
}

export interface WorkCard extends CardSnapshot {
  id: string;
  status: CardStatus;
  signer: string | null;
  signedAt: string | null;
  versions: CardVersion[];
  createdAt: string;
  updatedAt: string;
}

export interface Database {
  cards: WorkCard[];
  tools: TorqueTool[];
  operator: string; // 当前操作 / 签署人
  seq: number;
}

/** 一条冲突：携带冲突说明与触发冲突的原值 */
export interface Conflict {
  kind: "field" | "window" | "stand" | "tool-overlap" | "calibration" | "quarantine" | "tag" | "return" | "state";
  title: string;
  message: string;
  facts: { label: string; value: string }[];
}

export type ActionResult = { ok: true } | { ok: false; conflicts: Conflict[] };

export interface NewCardInput {
  airframe: string;
  ata: string;
  stand: string;
  start: string;
  end: string;
  toolIds: string[];
}
