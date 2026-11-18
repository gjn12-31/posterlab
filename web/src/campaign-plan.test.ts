import { describe, expect, it } from "vitest";
import { blankBrief, parseNotice } from "./campaign-model";
import { bindStageIntro, releaseCalendar, releasePlan } from "./campaign-plan";
import { createProject, parseProject } from "./model";

function newEvent() {
  return createProject({
    ...blankBrief,
    title: "书展, 初版; 会场",
    date: "2027-01-01",
    time: "10:00–14:00",
    venue: "A馆(2层)",
    description: "现场翻阅各类装帧。请带上自己的读书笔记。",
    url: "https://example.org/shelf",
  });
}

describe("活动发布计划", () => {
  it("旧项目自动生成三个阶段，按用户所给日期跨年排期", () => {
    const entries = releasePlan(parseProject(JSON.stringify(newEvent())));
    expect(entries.map((item) => item.date)).toEqual([
      "2026-12-25",
      "2026-12-31",
      "2027-01-01",
    ]);
    expect(entries[0].copy).toContain("现场翻阅各类装帧");
    expect(entries[1].intro).toBe("请带上自己的读书笔记。");
    expect(entries[2].copy).toMatch(
      /^今日活动.*\n地点：A馆\(2层\)\n时间：2027-01-01 10:00–14:00/,
    );
    expect(new Set(entries.map((item) => item.copy)).size).toBe(3);
    for (const entry of entries)
      expect(entry.copy).not.toMatch(/截止|售罄|名额/);
  });
  it("编辑阶段保留同一工程和配图。改期与移动场地也更新已编辑的开场", () => {
    const p = newEvent(),
      b = p.current.brief;
    p.current.campaignPlan = {
      announceDays: 3,
      stages: {
        prepare: {
          intro: bindStageIntro("在A馆(2层)见，10:00–14:00 可以入场。", b),
          format: "landscape",
        },
      },
    };
    Object.assign(b, { date: "2028-03-01", time: "11:00", venue: "新馆" });
    const entries = releasePlan(parseProject(JSON.stringify(p)));
    expect(entries.map((item) => item.date)).toEqual([
      "2028-02-27",
      "2028-02-29",
      "2028-03-01",
    ]);
    expect(entries[1]).toMatchObject({
      format: "landscape",
      intro: "在新馆见，11:00 可以入场。",
    });
    expect(entries[1].copy).not.toContain("A馆");
    expect(entries[2].copy).not.toContain("可以入场");
  });
  it("日期未明确时不猜年份或把报名日当活动日", () => {
    const p = newEvent();
    p.current.brief = parseNotice(
      "校园读书会\n报名截止：2026年11月12日 12:00\n地点：线上会议",
    );
    expect(p.current.brief.date).toBe("");
    expect(p.current.brief.description).toContain("报名截止");
    const entries = releasePlan(p);
    expect(entries.every((item) => !item.date)).toBe(true);
    expect(entries[1].intro).toContain("参会方式");
    expect(entries[1].copy).not.toContain("明日");
    expect(entries[2].copy).not.toContain("今日");
    expect(releaseCalendar(p)).toBe("");
  });
  it("导出全天发布任务，中文折行不截断多字节字符，改期保留各任务 UID", () => {
    const p = newEvent();
    const calendar = releaseCalendar(p);
    const lines = calendar.trimEnd().split("\r\n");
    expect(
      lines.every((line) => new TextEncoder().encode(line).length <= 75),
    ).toBe(true);
    const full = calendar.replaceAll("\r\n ", "");
    expect(full).toContain("书展\\, 初版\\; 会场");
    expect(full.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(full).toContain(
      "DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101",
    );
    const ids = full.match(/^UID:.*$/gm);
    expect(new Set(ids).size).toBe(3);
    p.current.brief.date = "2027-01-02";
    expect(
      releaseCalendar(p)
        .replaceAll("\r\n ", "")
        .match(/^UID:.*$/gm),
    ).toEqual(ids);
  });
});
