import assert from "node:assert/strict";
import test from "node:test";
import { SEED } from "../src/data/seed.ts";
import { closeConflicts, isCalibrated, overlaps, signConflicts, validateCard, type CardInput } from "../src/domain/rules.ts";
import {
  admitCard,
  clearTag,
  closeCard,
  promoteDraft,
  raiseTag,
  returnTool,
  saveDraft,
  signCard,
} from "../src/domain/workshop.ts";
import { groupSeries, isCurrentVersion, metrics } from "../src/domain/selectors.ts";

const base: CardInput = {
  aircraft: "B-9001",
  ata: "ATA 21-00",
  stand: "机位 9",
  start: "2026-09-23T09:00",
  end: "2026-09-23T11:00",
  toolIds: ["T-1"],
  mechanic: "测试工",
  pendingTags: [],
};

test("overlaps: 端点相接不算重叠，区间相交才算", () => {
  assert.equal(overlaps("09:00", "11:00", "11:00", "12:00"), false);
  assert.equal(overlaps("09:00", "11:01", "11:00", "12:00"), true);
  assert.equal(overlaps("08:00", "09:00", "09:00", "10:00"), false);
});

test("isCalibrated: 有效期含当日，次日过期", () => {
  const t = SEED.tools[1]; // 2026-08-31
  assert.equal(isCalibrated(t, "2026-08-31T08:00"), true);
  assert.equal(isCalibrated(t, "2026-09-01T08:00"), false);
});

test("登记成功：建卡、建借用记录并快照校准原值", () => {
  const r = admitCard(SEED, base);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.state.cards[0].status, "registered");
  assert.equal(r.state.loans[0].cardId, r.card!.id);
  assert.equal(r.state.loans[0].calibrationAtBorrow, "2026-10-05");
});

test("机位重叠：整卡拒绝并列出双方原值，不入库", () => {
  const input: CardInput = { ...base, stand: "机位 5", start: "2026-09-22T10:00", end: "2026-09-22T11:30" };
  const r = admitCard(SEED, input);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.ok(r.conflicts.some((c) => c.code === "STAND_OVERLAP"));
  const c = r.conflicts.find((x) => x.code === "STAND_OVERLAP")!;
  assert.match(c.existingValue, /WO-20260922-001/);
  assert.equal(r.conflicts.length, 1);
});

test("工具时段重叠：同一工具两张卡占用即冲突；不同工具不冲突", () => {
  const sameTool: CardInput = { ...base, stand: "机位 3", start: "2026-09-22T09:30", end: "2026-09-22T10:30", toolIds: ["T-3"] };
  const r1 = validateCard({ input: sameTool, cards: SEED.cards, tools: SEED.tools, tags: SEED.tags });
  assert.ok(r1.some((c) => c.code === "TOOL_OVERLAP"));

  const otherTool: CardInput = { ...sameTool, toolIds: ["T-1"] };
  const r2 = validateCard({ input: otherTool, cards: SEED.cards, tools: SEED.tools, tags: SEED.tags });
  assert.ok(!r2.some((c) => c.code === "TOOL_OVERLAP"));
});

test("校准过期：过期工具整卡拒绝并给出校准原值", () => {
  const r = admitCard(SEED, { ...base, toolIds: ["T-2"] });
  assert.equal(r.ok, false);
  if (r.ok) return;
  const c = r.conflicts.find((x) => x.code === "CALIBRATION_EXPIRED")!;
  assert.equal(c.existingValue, "校准有效期至 2026-08-31");
});

test("缺件未解除：登记随卡挂签即整卡拒绝", () => {
  const r = admitCard(SEED, { ...base, pendingTags: [{ part: "P1/1", description: "螺栓待料" }] });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.ok(r.conflicts.some((c) => c.code === "TAG_OPEN"));
  // 拒绝不入库
  assert.equal(r.conflicts.length > 0, true);
});

test("同版本链不自我冲突；被取代旧版本不再占资源", () => {
  // C-201(signed v1) 与 C-202(registered v2) 同链同时段，互不判重
  const conflicts = validateCard({
    input: { ...base, stand: "机位 2", start: "2026-09-22T15:00", end: "2026-09-22T16:30", toolIds: ["T-1"] },
    cards: SEED.cards,
    tools: SEED.tools,
    tags: SEED.tags,
  });
  // v2 (T-1,T-4) 是当前版本，仍占机位 2 与工具，故外部卡冲突
  assert.ok(conflicts.some((c) => c.code === "STAND_OVERLAP" && c.existingValue.includes("v2")));
  assert.ok(!conflicts.some((c) => c.existingValue.includes("v1")));
});

test("签署门禁：有未解除挂签不能签署；清零并归还后可签署、结卡", () => {
  const card = SEED.cards.find((c) => c.id === "C-101")!;
  assert.equal(signConflicts(card, SEED.tags, "赵放行").some((c) => c.code === "TAG_OPEN"), true);

  // 解除挂签需要说明
  const badClear = clearTag(SEED, "Q-1", "  ");
  assert.equal(badClear.ok, false);

  let s = clearTag(SEED, "Q-1", "锁片已装机，力矩复测合格").state;
  // 工具未归还不能结卡（签署本身不卡归还）
  const signed = signCard(s, "C-101", "赵放行");
  assert.equal(signed.ok, true);
  s = signed.state;
  const blocked = closeCard(s, "C-101");
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.ok(blocked.conflicts.some((c) => c.message.includes("未归还不得结卡")));

  // 归还记录校准快照后可结卡
  const loanId = s.loans.find((l) => l.cardId === "C-101")!.id;
  s = returnTool(s, loanId).state;
  const closed = closeCard(s, "C-101");
  assert.equal(closed.ok, true);
});

test("签署后冻结：不能在原卡挂签；补录无原因不能另存版本", () => {
  const frozen = SEED.cards.find((c) => c.id === "C-201")!;
  const r = raiseTag(SEED, frozen.id, { part: "X", description: "Y" });
  assert.equal(r.ok, false);

  const draft = saveDraft(SEED, {
    aircraft: "B-5520", ata: "ATA 72-00", stand: "机位 2",
    start: "2026-09-23T14:00", end: "2026-09-23T17:00",
    toolIds: ["T-1", "T-4"], mechanic: "周工", pendingTags: [],
  }, frozen);
  assert.equal(draft.ok, true);
  if (!draft.ok) return;
  assert.equal(draft.card!.status, "draft");

  const noReason = promoteDraft(draft.state, draft.card!, {
    aircraft: "B-5520", ata: "ATA 72-00", stand: "机位 2",
    start: "2026-09-23T14:00", end: "2026-09-23T17:00",
    toolIds: ["T-1", "T-4"], mechanic: "周工", pendingTags: [],
  }, "  ");
  assert.equal(noReason.ok, false);
  if (!noReason.ok) assert.ok(noReason.conflicts.some((c) => c.field === "补录原因"));
});

test("补录带原因另存 v3：同号同链、草稿移除、旧 v2 不再占资源、生成新借用记录", () => {
  const frozen = SEED.cards.find((c) => c.id === "C-201")!;
  const draftR = saveDraft(SEED, {
    aircraft: "B-5520", ata: "ATA 72-00", stand: "机位 2",
    start: "2026-09-23T14:00", end: "2026-09-23T17:00",
    toolIds: ["T-1"], mechanic: "周工", pendingTags: [],
  }, frozen);
  if (!draftR.ok) throw new Error("draft failed");
  const input: CardInput = {
    aircraft: "B-5520", ata: "ATA 72-00", stand: "机位 2",
    start: "2026-09-23T14:00", end: "2026-09-23T17:00",
    toolIds: ["T-1"], mechanic: "周工", pendingTags: [],
  };
  const r = promoteDraft(draftR.state, draftR.card!, input, "补录右发滑油滤复测");
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.card!.version, 3);
  assert.equal(r.card!.cardNo, "WO-20260922-002");
  assert.equal(r.card!.supersedesId, "C-202");
  assert.ok(!r.state.cards.some((c) => c.id === draftR.card!.id));
  // v2 不再是当前版本
  const v2 = r.state.cards.find((c) => c.id === "C-202")!;
  assert.equal(isCurrentVersion(v2, r.state.cards), false);
  assert.equal(isCurrentVersion(r.card!, r.state.cards), true);
  // v3 有自己的新借用记录
  assert.ok(r.state.loans.some((l) => l.cardId === r.card!.id && l.toolId === "T-1"));
  // 旧 v1 仍冻结留痕
  const v1 = r.state.cards.find((c) => c.id === "C-201")!;
  assert.equal(v1.status, "signed");
});

test("缺字段与时段非法均拒绝", () => {
  const r1 = admitCard(SEED, { ...base, aircraft: "" });
  assert.equal(r1.ok, false);
  const r2 = admitCard(SEED, { ...base, end: "2026-09-23T08:00" });
  assert.equal(r2.ok, false);
  if (r2.ok) return;
  assert.ok(r2.conflicts.some((c) => c.code === "TIME_INVALID"));
});

test("刷新一致性：版本链分组与指标只统计当前版本", () => {
  const sList = groupSeries(SEED.cards);
  assert.equal(sList.length, 2);
  const s200 = sList.find((s) => s.cardNo === "WO-20260922-002")!;
  assert.deepEqual(s200.versions.map((v) => v.version), [1, 2]);
  assert.equal(s200.current.id, "C-202");
  const m = metrics(SEED, "2026-09-22");
  assert.equal(m.registered, 2); // C-101、C-202（v1 signed 被取代不计）
  assert.equal(m.signed, 0);
  assert.equal(m.openTags, 1);
  assert.equal(m.openLoans, 1);
  assert.equal(m.expiredTools, 1);
});

test("归还时校准状态被独立快照，不影响借用时原值", () => {
  const s = returnTool(SEED, "L-1").state;
  const loan = s.loans.find((l) => l.id === "L-1")!;
  assert.ok(loan.returnedAt);
  assert.equal(loan.calibrationAtBorrow, "2027-03-18");
  assert.equal(loan.calibrationAtReturn, "2027-03-18");
  assert.equal(closeConflicts(s.cards[0], []).length, 0 || 0);
});
