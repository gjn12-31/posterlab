import { describe, it, expect } from "vitest";
import { extractSections } from "./paper-sections";
describe("PDF sections", () => {
  it("separates headings and keeps the introduction up to the next section", () => {
    const parsed = extractSections(
      "Tree shade\nAbstract—We measured shade.\nKeywords: shade\n1. Introduction\nEarlier studies focused on summer.\n2 Methods\nOutside the introduction.",
    );
    expect(parsed.abstract).toBe("We measured shade.");
    expect(parsed.introduction).toBe("Earlier studies focused on summer.");
  });
  it("recognizes Chinese headings and a second page continuation", () => {
    const data = extractSections(
      "树荫研究\n摘 要：记录观测结果。\n关键词：气候\n一、引 言\n先前工作集中于白天。\n夜间仍需观察。\n二、研究方法\n忽略方法。",
    );
    expect(data.abstract).toBe("记录观测结果。");
    expect(data.introduction).toBe("先前工作集中于白天。\n夜间仍需观察。");
  });
  it("does not label an author list as an abstract and accepts introduction only", () => {
    const parsed = extractSections(
      "Park cover\nLee and other collaborators\nI. Introduction\nPrior work examined shade.",
    );
    expect(parsed.abstract).toBe("");
    expect(parsed.introduction).toContain("Prior work");
  });
});
