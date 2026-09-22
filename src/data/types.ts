// 数据层：工卡与缺件放行台的领域数据结构（纯类型，不含任何判定与界面逻辑）

export type CardStatus = "draft" | "registered" | "signed" | "closed";

export const CARD_STATUS_LABEL: Record<CardStatus, string> = {
  draft: "补录草稿",
  registered: "已登记",
  signed: "已签署",
  closed: "已结卡",
};

/** 工卡：一条工卡的某个版本（版本链内同 seriesId） */
export interface WorkCard {
  id: string;
  /** 版本链稳定标识，补录另存的版本共享同一 seriesId */
  seriesId: string;
  version: number;
  /** 工卡号在版本链内保持不变 */
  cardNo: string;
  supersedesId: string | null;
  /** 补录另存时必填的原因 */
  supplementReason: string | null;

  /** 机身（机号 / 注册号） */
  aircraft: string;
  /** ATA 章节 */
  ata: string;
  /** 机位 */
  stand: string;
  /** 施工时段（本地时间 YYYY-MM-DDTHH:mm） */
  start: string;
  end: string;
  /** 扭矩工具 id 列表 */
  toolIds: string[];
  mechanic: string;

  status: CardStatus;
  createdAt: string;
  signedAt: string | null;
  signer: string | null;
  closedAt: string | null;
}

/** 扭矩工具（工具台账） */
export interface TorqueTool {
  id: string;
  /** 工具编号 */
  code: string;
  name: string;
  /** 量程 */
  range: string;
  /** 校准有效期至（YYYY-MM-DD，当日含） */
  calibratedUntil: string;
}

/** 工具借用 / 归还记录 */
export interface ToolLoan {
  id: string;
  cardId: string;
  toolId: string;
  /** 借用起始时间 */
  borrowAt: string;
  /** 实际归还时间，null 表示未归还 */
  returnedAt: string | null;
  /** 借用时记录的校准有效期（原值快照） */
  calibrationAtBorrow: string;
  /** 归还时记录的校准有效期（原值快照） */
  calibrationAtReturn: string | null;
}

export type TagStatus = "open" | "cleared";

/** 缺件挂签 */
export interface MissingTag {
  id: string;
  cardId: string;
  /** 挂签编号 */
  tagNo: string;
  ata: string;
  /** 件号 / 数量 */
  part: string;
  description: string;
  raisedAt: string;
  status: TagStatus;
  clearedAt: string | null;
  clearRemark: string | null;
}

export interface Counters {
  card: number;
  series: number;
  tag: number;
  loan: number;
}

export interface WorkshopState {
  storageVersion: 1;
  cards: WorkCard[];
  tools: TorqueTool[];
  loans: ToolLoan[];
  tags: MissingTag[];
  counters: Counters;
}
