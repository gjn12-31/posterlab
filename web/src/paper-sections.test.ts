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

it("removes raised sentence footnotes while preserving printed decimals and units", async () => {
  const { pdfPageText, abstractBeforeFigure } =
    await import("./paper-sections");
  const run = (
    str: string,
    x: number,
    y: number,
    height = 10,
    width = 100,
  ) => ({
    str,
    transform: [height, 0, 0, height, x, y],
    width,
    height,
    hasEOL: false,
    dir: "ltr",
    fontName: "test",
  });
  const view = [0, 0, 612, 792];
  const text = pdfPageText(
    [
      run("We measured 3.1 mm at 37 °C.", 100, 450, 10, 127),
      run("1", 227, 453.6, 7, 4),
      run("9.81 m/s", 100, 430, 10, 42),
      run("2", 142, 433.6, 7, 4),
      run(" at the surface.", 146, 430, 10, 80),
      run("1", 303, 32, 10, 5),
    ],
    view,
    1,
  );
  expect(text).toContain("3.1 mm at 37 °C.");
  expect(text).toContain("9.81 m/s2 at the surface.");
  expect(text).not.toContain("°C.1");
  expect(text.trimEnd()).not.toMatch(/\n1$/);
  const final =
    "PonderPythia-1B matches TinyLlama-1.1B, a model trained on 10 times more data.";
  expect(
    abstractBeforeFigure(
      final + "\n200M 500M 1B 2B 3B 7B\n#Parameters (log scale)",
    ),
  ).toBe(final);
  expect(abstractBeforeFigure("We tested 1B, 2B and 3B parameters.")).toBe(
    "We tested 1B, 2B and 3B parameters.",
  );
});

it("keeps scientific compounds and numbers intact across printed line breaks", async () => {
  const { unwrapPdfWords, pdfProse } = await import("./paper-sections");
  expect(
    pdfProse(
      unwrapPdfWords(
        "The pon-\ndering process used high-\nquality training data and test-\ntime scaling.\nPonderPythia-\n2.8B measured 0.\n35 mm.",
      ),
    ),
  ).toBe(
    "The pondering process used high-quality training data and test-time scaling.\nPonderPythia-2.8B measured 0.35 mm.",
  );
  expect(pdfProse(unwrapPdfWords("We ran task 2.\n3 studies followed."))).toBe(
    "We ran task 2.\n3 studies followed.",
  );
});

it("retains the original caption when its layout cannot establish a continued paragraph", async () => {
  const { pdfPageText } = await import("./paper-sections");
  const runs = [
    ["Figure 2: Change in density.", 600],
    ["Measurements matched earlier work.", 580],
  ] as const;
  const text = pdfPageText(
    runs.map(([str, y]) => ({
      str,
      transform: [10, 0, 0, 10, 70, y],
      width: 180,
      height: 10,
      hasEOL: false,
      dir: "ltr",
      fontName: "test",
    })),
    [0, 0, 612, 792],
    2,
  );
  expect(text).toContain("Change in density.");
  expect(text).toContain("Measurements matched earlier work.");
});
