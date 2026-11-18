import { describe, it, expect } from "vitest";
import {
  abstractBeforeFigure,
  extractSections,
  stripDiagramLabels,
} from "./paper-sections";
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

it("omits isolated figure tick labels and keeps captions, prose and unrelated numbers", () => {
  const plot = "0.1\n0.2\n⋯\n0.1\n0.3\n⋯\n0.4\n0.8\nHidden\nEmbedding";
  const before = "Earlier studies measured 0.3 seconds.";
  const after =
    "Figure 2 | A distribution over tokens.\nOur comparison concerns nine benchmarks.";
  expect(stripDiagramLabels([before, plot, after].join("\n"))).toBe(
    before + "\n" + after,
  );
  expect(stripDiagramLabels(plot)).toBe(plot);
  expect(stripDiagramLabels("0.3\n" + after)).toBe("0.3\n" + after);
});

it("keeps figure-specific comparisons outside the PDF abstract", () => {
  const abstract = "On nine tasks, the 2.8B model approaches the 12B baseline.";
  const caption =
    "Figure 1 | A different comparison: 2.55B matches the training loss.";
  expect(
    abstractBeforeFigure(
      [abstract, "200M 1B 7B", "#Parameters", caption].join("\n"),
    ),
  ).toBe(abstract);
  expect(
    abstractBeforeFigure("As Figure 1 illustrates, performance improves."),
  ).toBe("As Figure 1 illustrates, performance improves.");
});
