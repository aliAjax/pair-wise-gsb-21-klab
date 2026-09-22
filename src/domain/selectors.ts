import type { MissingTag, ToolLoan, TorqueTool, WorkCard, WorkshopState } from "../data/types";
import { daysUntilDue } from "./rules";

// 判定层：从 WorkshopState 派生的只读视图，供界面直接消费，界面不再自己算规则。

export interface ToolView {
  tool: TorqueTool;
  /** 未归还借用记录 */
  activeLoans: ToolLoan[];
  calibrationDays: number;
  calibrationState: "expired" | "due-soon" | "valid";
}

export interface CardSeries {
  seriesId: string;
  cardNo: string;
  aircraft: string;
  versions: WorkCard[]; // v1 在前
  current: WorkCard;
  latestVersion: number;
}

export function toolViews(tools: TorqueTool[], loans: ToolLoan[], today: string): ToolView[] {
  return tools.map((tool) => {
    const activeLoans = loans.filter((l) => l.toolId === tool.id && !l.returnedAt);
    const calibrationDays = daysUntilDue(tool, today);
    return {
      tool,
      activeLoans,
      calibrationDays,
      calibrationState:
        calibrationDays < 0 ? "expired" : calibrationDays <= 30 ? "due-soon" : "valid",
    };
  });
}

/** 一条卡是否为其版本链当前版本（非当前版本即已被新版本取代） */
export function isCurrentVersion(card: WorkCard, cards: WorkCard[]): boolean {
  if (card.status === "draft") return false;
  return !cards.some(
    (c) =>
      c.id !== card.id &&
      c.status !== "draft" &&
      c.seriesId === card.seriesId &&
      c.version > card.version,
  );
}

/** 按版本链分组，链内版本升序；链之间按最新卡创建时间倒序。草稿不进入版本链。 */
export function groupSeries(cards: WorkCard[]): CardSeries[] {
  const map = new Map<string, WorkCard[]>();
  for (const card of cards) {
    if (card.status === "draft") continue;
    const list = map.get(card.seriesId) ?? [];
    list.push(card);
    map.set(card.seriesId, list);
  }
  const series: CardSeries[] = [];
  for (const [seriesId, list] of map) {
    const versions = [...list].sort((a, b) => a.version - b.version);
    const current = versions[versions.length - 1];
    series.push({
      seriesId,
      cardNo: current.cardNo,
      aircraft: current.aircraft,
      versions,
      current,
      latestVersion: current.version,
    });
  }
  return series.sort((a, b) => b.current.createdAt.localeCompare(a.current.createdAt));
}

export function drafts(cards: WorkCard[]): WorkCard[] {
  return cards.filter((c) => c.status === "draft");
}

export function cardTags(cardId: string, tags: MissingTag[]): MissingTag[] {
  return tags.filter((t) => t.cardId === cardId);
}

export function cardLoans(cardId: string, loans: ToolLoan[]): ToolLoan[] {
  return loans.filter((l) => l.cardId === cardId);
}

export interface Metrics {
  /** 当前版本工卡总数（不含草稿与被取代旧版本） */
  current: number;
  draft: number;
  registered: number;
  signed: number;
  closed: number;
  openTags: number;
  openLoans: number;
  expiredTools: number;
}

export function metrics(state: WorkshopState, today: string): Metrics {
  const m: Metrics = {
    current: 0,
    draft: 0,
    registered: 0,
    signed: 0,
    closed: 0,
    openTags: state.tags.filter((t) => t.status === "open").length,
    openLoans: state.loans.filter((l) => !l.returnedAt).length,
    expiredTools: 0,
  };
  for (const card of state.cards) {
    if (card.status === "draft") {
      m.draft += 1;
    } else if (isCurrentVersion(card, state.cards)) {
      m.current += 1;
      m[card.status] += 1;
    }
  }
  for (const view of toolViews(state.tools, [], today)) {
    if (view.calibrationState === "expired") m.expiredTools += 1;
  }
  return m;
}
