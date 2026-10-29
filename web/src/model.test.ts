import { describe, it, expect } from "vitest";
import {
  createProject,
  applySuggestion,
  parseProject,
  parseBrief,
  parseCsv,
  checkpoint,
  briefSchema,
  migrateLegacy,
} from "./model";
describe("project data boundaries", () => {
  it("protects locked event facts while applying creative changes", () => {
    const p = createProject();
    const next = applySuggestion(p, {
      source: "stepfun",
      fields: { date: "2030-01-01", title: "新的创意" },
      theme: "mint",
      reason: "test",
    });
    expect(next.current.brief.date).toBe(p.current.brief.date);
    expect(next.current.brief.title).toBe("新的创意");
    expect(p.current.theme).toBe("violet");
  });
  it("rejects active external assets and missing assets", () => {
    const p = createProject();
    p.current.heroId = "x";
    expect(() => parseProject(JSON.stringify(p))).toThrow();
    p.assets.x = {
      id: "x",
      name: "x",
      data: "https://evil.example/track.svg",
      width: 100,
      height: 100,
      license: "",
    };
    expect(() => parseProject(JSON.stringify(p))).toThrow();
  });
  it("rejects invalid dates and script links", () => {
    expect(() =>
      briefSchema.parse({
        ...createProject().current.brief,
        date: "2026-02-30",
      }),
    ).toThrow();
    expect(() =>
      briefSchema.parse({
        ...createProject().current.brief,
        url: "javascript:alert(1)",
      }),
    ).toThrow();
  });
  it("preserves independent version snapshots", () => {
    const p = createProject();
    const next = checkpoint(p, "里程碑");
    next.current.brief.title = "新版";
    expect(next.history[0].brief.title).toBe(p.current.brief.title);
    expect(next.current.id).not.toBe(next.history[0].id);
  });
  it("migrates legacy themes without deleting the original payload", () => {
    const old = [{ id: "1", fields: { title: "以前的作品" }, theme: "sage" }];
    expect(migrateLegacy(old)[0].current.theme).toBe("mint");
    expect(old[0].theme).toBe("sage");
  });
});
describe("brief and batch import", () => {
  it("extracts only present facts", () => {
    expect(parseBrief("标题：设计交流\n日期：2026-11-08")).toEqual({
      title: "设计交流",
      date: "2026-11-08",
    });
  });
  it("handles quoted commas, newlines and BOM from spreadsheets", () => {
    expect(
      parseCsv('\uFEFFtitle,description\r\n"a,b","first\nsecond"\r\n'),
    ).toEqual([{ title: "a,b", description: "first\nsecond" }]);
  });
  it("rejects incomplete quotes and oversized batches", () => {
    expect(() => parseCsv('title\n"bad')).toThrow();
    expect(() =>
      parseCsv("title\n" + Array(31).fill("x").join("\n")),
    ).toThrow();
  });
});
