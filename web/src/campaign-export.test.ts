import { describe, expect, it, vi } from "vitest";
import { blankBrief } from "./campaign-model";
import {
  campaignExportFiles,
  exportSelection,
  type ExportSelection,
} from "./campaign-export";
import { createProject } from "./model";

vi.mock("./render", () => ({ exportBlob: vi.fn() }));

const event = createProject({
  ...blankBrief,
  title: "书展",
  date: "2027-02-01",
  venue: "新馆",
});
const selection: ExportSelection = {
  formats: ["square"],
  imageType: "jpg",
  copy: false,
  calendar: true,
};

describe("按渠道导出", () => {
  it("清单复用同一份选择，日历只引用实际选择的图片文件", () => {
    const files = campaignExportFiles(event, selection);
    expect(files.map((f) => f.filename)).toEqual([
      "社交方图.jpg",
      "发布日历.ics",
    ]);
    const calendar = files[1];
    expect(
      "text" in calendar && calendar.text.replaceAll("\r\n ", ""),
    ).toContain("社交方图.jpg");
    expect("text" in calendar && calendar.text).not.toContain(".png");
  });
  it("发布文案使用当前项目的阶段设置和改期通知", () => {
    const project = structuredClone(event);
    project.current.campaignPlan = {
      stages: { prepare: { intro: "在{{地点}}见。" } },
    };
    const files = campaignExportFiles(
      project,
      { ...selection, formats: [], copy: true, calendar: false },
      "改期到周日",
    );
    expect(files.map((f) => f.filename)).toEqual([
      "活动预告.txt",
      "行前提醒.txt",
      "当天到场.txt",
      "改期通知.txt",
    ]);
    expect(files[1]).toMatchObject({
      text: expect.stringContaining("在新馆见。"),
    });
    expect(files[3]).toMatchObject({ text: "改期到周日" });
  });
  it("无活动日期时不输出日历，选择为空不能下载", async () => {
    const project = structuredClone(event);
    project.current.brief.date = "";
    const files = campaignExportFiles(project, { ...selection, formats: [] });
    expect(files).toEqual([]);
    await expect(exportSelection(project, files, "书展")).rejects.toThrow(
      "请选择",
    );
  });
  it("只有日历时直接下载 ICS", async () => {
    const files = campaignExportFiles(event, { ...selection, formats: [] });
    const result = await exportSelection(event, files, "书展");
    expect(result.filename).toBe("书展-发布日历.ics");
    expect(result.blob.type).toContain("text/calendar");
    expect((await result.blob.text()).match(/BEGIN:VEVENT/g)).toHaveLength(3);
  });
});
