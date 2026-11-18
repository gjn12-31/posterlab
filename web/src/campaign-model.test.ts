import { describe, expect, it } from "vitest";
import {
  campaigns,
  parseNotice,
  noticeFromBrief,
  changeNotice,
  invitation,
} from "./campaign-model";

describe("活动通知", () => {
  it.each(campaigns)("生成$label成品的实际活动信息", (sample) => {
    const b = parseNotice(sample.notice);
    expect(b.title).toBe(sample.notice.split("\n")[0]);
    expect(b.date).toMatch(/^2026-12-/);
    expect(b.venue).toBeTruthy();
    expect(b.description).toContain(sample.notice.split("\n")[2].slice(0, -1));
    expect(parseNotice(noticeFromBrief(b))).toEqual(b);
  });
  it("在未给出年份时保留原文", () => {
    expect(
      parseNotice("冬日共读\n时间：12月6日 14:00\n地点：栖云书店"),
    ).toMatchObject({ date: "", time: "12月6日 14:00", venue: "栖云书店" });
    expect(parseNotice("冬日共读\n时间：下周六 14:00").time).toBe(
      "下周六 14:00",
    );
  });
  it("识别一句话中的时间和地点", () => {
    expect(
      parseNotice("12月6日下午两点在栖云书店举办冬日共读，带一本喜欢的书。"),
    ).toMatchObject({
      title: "冬日共读",
      venue: "栖云书店",
      date: "",
      time: "12月6日 下午两点",
      description: expect.stringContaining("带一本喜欢的书"),
    });
  });
  it("保留跨日活动的日期范围", () => {
    expect(parseNotice("海边音乐周\n2026年12月4日至6日 18:00").time).toBe(
      "2026年12月4日至6日 18:00",
    );
  });
  it.each(["2026-02-30", "14月29日"])("无效日期 %s 可被纠正", (day) => {
    expect(() => parseNotice("新年跑步\n" + day)).toThrow("日期无效");
  });
  it("独立保留邀请文案、报名网址和改期通知", () => {
    const original = parseNotice(
      "冬日共读\n2026-12-06 14:00，地点：栖云书店。每人带一本书。\nhttps://example.org/join",
    );
    const updated = { ...original, date: "2026-12-08", venue: "树屋书店" };
    expect(updated.url).toBe("https://example.org/join");
    expect(invitation(updated)).toContain("每人带一本书");
    expect(invitation(updated)).not.toContain("栖云");
    expect(changeNotice(original, updated)).toContain("栖云书店 → 树屋书店");
    expect(changeNotice(updated, updated)).toBe("");
  });
});
