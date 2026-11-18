import { expect, it } from "vitest";
import { readingPayload } from "./paper-reading-payload";

it("fits 128 dense Unicode pages into one request while preserving original page and excerpt boundaries", () => {
  const body = '结合研究设计评估实际环境中的决策。🌍"结果"\\数据\n'.repeat(830);
  const pages = Array.from({ length: 128 }, (_, i) => ({
    page: i + 1,
    text: ("页首" + (i + 1) + body + "页尾").slice(0, 19900) + "该页结束",
  }));
  const source = {
    title: "ClashBench",
    sections: {
      abstract: "中".repeat(40000),
      introduction: "中".repeat(45000),
    },
    pages,
    candidates: [],
  };
  const result = readingPayload(source);
  expect(
    new TextEncoder().encode(JSON.stringify(result)).length,
  ).toBeLessThanOrEqual(1_900_000);
  expect(result.pages.map((p) => p.page)).toEqual(pages.map((p) => p.page));
  for (const [i, p] of result.pages.entries()) {
    expect(p.text.startsWith("页首" + (i + 1))).toBe(true);
    expect(p.text.endsWith("该页结束")).toBe(true);
    for (const fragment of p.text.split("\n[…]\n"))
      expect(pages[i].text).toContain(fragment);
    expect(pages[i].text.length).toBeGreaterThan(p.text.length);
  }
  expect(result.sections).toBe(source.sections);
  const short = { pages: [{ page: 1, text: "摘要与引言" }] };
  expect(readingPayload(short)).toBe(short);
});
