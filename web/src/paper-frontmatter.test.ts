import { expect, it } from "vitest";
import {
  metadataTitle,
  metadataAuthor,
  printedFrontmatter,
  type PrintRun,
} from "./paper-frontmatter";

const page = [0, 0, 612, 792];
const run = (
  str: string,
  x: number,
  y: number,
  height: number,
  width: number,
): PrintRun => ({
  str,
  width,
  height,
  transform: [height, 0, 0, height, x, y],
});
const body = Array.from({ length: 8 }, (_, i) =>
  run(
    "Ordinary prose establishes the body size of this paper.",
    48,
    440 - 12 * i,
    10,
    260,
  ),
);

it("reassembles mixed-size small capitals and acronym glyphs by position", () => {
  const blocks = [
    run("Published as a conference paper", 48, 760, 10, 150),
    run("G", 48, 710, 20, 13),
    run("RAPH", 61, 710, 16, 37),
    run("QA: L", 99, 710, 20, 48),
    run("EARNING FROM", 148, 710, 16, 112),
    run("S", 48, 687, 20, 11),
    run("PATIAL", 60, 687, 16, 50),
    run("S", 116, 687, 20, 11),
    run("IGNALS", 128, 687, 16, 54),
    run("Mei Lin", 48, 651, 10, 36),
    run("1", 84, 654, 7, 4),
    run(", Luca Rossi", 88, 651, 10, 55),
    run("2", 143, 654, 7, 4),
    run("University of Cambridge", 48, 638, 10, 130),
    run("Abstract", 195, 600, 14, 55),
    ...body,
  ];
  expect(printedFrontmatter(blocks.reverse(), page)).toEqual({
    title: "GraphQA: Learning from Spatial Signals",
    byline: "Mei Lin, Luca Rossi",
  });
});

it("keeps a wrapped title inside its column and skips affiliations and following headings", () => {
  const blocks = [
    run("Modelling Energy", 48, 719, 18, 151),
    run("RESEARCH NOTE", 370, 719, 10, 88),
    run("in Compact Cities", 48, 696, 18, 153),
    run("ISSN 0137-1234", 370, 696, 10, 84),
    run("City Research Institute", 48, 670, 10, 117),
    run("Blue Valley University", 362, 670, 10, 117),
    run("Abstract", 48, 625, 12, 78),
    run("INTRODUCTION", 364, 625, 20, 142),
    ...body,
  ];
  expect(printedFrontmatter(blocks, page)).toEqual({
    title: "Modelling Energy in Compact Cities",
    byline: "",
  });
});

it("preserves case in ordinary title runs and does not guess an ambiguous byline", () => {
  expect(
    printedFrontmatter(
      [
        run("GPU", 48, 700, 20, 37),
        run(" Models for RNA", 91, 700, 20, 145),
        run("For conference review", 48, 670, 11, 114),
        ...body,
      ],
      page,
    ),
  ).toEqual({ title: "GPU Models for RNA", byline: "" });
});

it("accepts document metadata strings and creator lists, and rejects export placeholders", () => {
  expect(metadataTitle("Microsoft Word - draft")).toBe("");
  expect(metadataTitle("untitled")).toBe("");
  expect(metadataTitle("Names in Space")).toBe("Names in Space");
  expect(metadataAuthor("Anonymous Author")).toBe("");
  expect(metadataAuthor(["Mei Lin", "Luca Rossi"])).toBe("Mei Lin, Luca Rossi");
});

it("restores the two printed PonderLM proceedings title lines from their PDF.js runs", () => {
  // ICLR 2026 proceedings PDF, first page. The source has no Title metadata.
  const rows: [string, number, number, number][][] = [
    [
      ["P", 108.4, 9.6, 17.2],
      ["ONDER", 118.9, 50.8, 13.8],
      ["LM: P", 170.5, 47.1, 17.2],
      ["RETRAINING", 218.5, 91.8, 13.8],
      ["L", 315.4, 10.5, 17.2],
      ["ANGUAGE", 326.8, 72.1, 13.8],
      ["M", 404, 15.3, 17.2],
      ["ODELS TO", 420.2, 71.9, 13.8],
    ],
    [
      ["P", 108.4, 9.6, 17.2],
      ["ONDER IN", 118.9, 71.4, 13.8],
      ["C", 195.4, 11.5, 17.2],
      ["ONTINUOUS", 207.7, 87.1, 13.8],
      ["S", 300, 9.6, 17.2],
      ["PACE", 310.4, 35.9, 13.8],
    ],
  ];
  const glyphs = rows.flatMap((row, i) =>
    row.map(([text, x, width, height]) =>
      run(text, x, i === 0 ? 698.7 : 678.8, height, width),
    ),
  );
  expect(printedFrontmatter([...glyphs, ...body], page).title).toBe(
    "PonderLM: Pretraining Language Models to Ponder in Continuous Space",
  );
});
