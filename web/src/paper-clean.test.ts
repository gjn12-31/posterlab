import { expect, it } from "vitest";
import { cleanManuscriptText } from "./paper-clean";
import { extractSections, pdfPageText, pdfProse } from "./paper-sections";
import {
  channelCopy,
  channels,
  createPaper,
  readSavedPaper,
} from "./paper-model";

const header =
  "CVPR 2027 Submission #702. CONFIDENTIAL REVIEW COPY. DO NOT DISTRIBUTE.";
const findings = [
  "We measured light with Sensor013 on 120 samples.",
  "The reading was 1.3 ± 0.2 mm.",
  "The result was limited to ambient conditions.",
];
it("drops a review header and actual margin counts before reading the PDF columns", () => {
  const run = (str: string, x: number, y: number, height = 10) => ({
    str,
    transform: [height, 0, 0, height, x, y],
    width: 150,
    height,
    hasEOL: true,
    dir: "ltr",
    fontName: "Test",
  });
  const content = [
    run("Measured light", 82, 730, 18),
    run("Abstract", 80, 684),
    run(header, 85, 668),
    ...findings.flatMap((line, i) => [
      run(String(i + 13).padStart(3, "0"), 24, 640 - i * 13, 8),
      run(line, 72, 640 - i * 13),
    ]),
    run("1. Introduction", 72, 510),
    run("Earlier studies used calibration lamps.", 72, 495),
  ];
  const text = extractSections(pdfPageText(content, [0, 0, 612, 792], 1));
  const paper = createPaper(text.abstract, text.title, "");
  expect(text.abstract.split("\n")).toEqual(findings);
  expect(paper.evidence.map((x) => x.quote)).toEqual(findings);
  for (const channel of channels)
    expect(channelCopy(paper, channel)).not.toMatch(
      /CONFIDENTIAL|DISTRIBUTE|Submission|\b01[345]\b/,
    );
});

it("removes pasted line counters without altering the same digits in methods, units, quotations or years", () => {
  const text = findings
    .map((f, i) => String(i + 1).padStart(3, "0") + " " + f)
    .join("\n");
  expect(cleanManuscriptText(header + "\n" + text)).toBe(findings.join("\n"));
  const prose =
    "We study the phrase “do not distribute”. CVPR 2027 submission rates were measured. Our 013 samples were compared with Sensor013.";
  expect(cleanManuscriptText(prose)).toBe(prose);
  expect(() => createPaper(header, "A manuscript", "")).toThrow("摘要或正文");
});

it("repairs old local and library records without replacing the project, edited copy, or a linked citation", () => {
  const old = createPaper(findings.join(" "), "Measured light", "");
  old.sections = {
    abstract: header + " " + findings.join(" "),
    introduction: "",
  };
  old.body = old.sections.abstract;
  old.evidence = [
    { quote: "CVPR 2027 Submission #702.", line: "CVPR 2027 Submission #702." },
    { quote: "CONFIDENTIAL REVIEW COPY.", line: "CONFIDENTIAL REVIEW COPY." },
    { quote: "DO NOT DISTRIBUTE.", line: "DO NOT DISTRIBUTE." },
    { quote: findings[0], line: "原作者核对过的仪器型号 Sensor013。" },
  ];
  old.edits.red = "这份文稿已经人工校订。";
  old.evidenceIds = { x: [4], red: [1, 4] };
  const p = readSavedPaper(old);
  expect(p.id).toBe(old.id);
  expect(p.evidenceIds).toEqual({ x: [1] });
  expect(p.edits).toEqual(old.edits);
  expect(p.sections?.abstract).toBe(findings.join(" "));
  expect(p.evidence[0].line).toBe(old.evidence[3].line);
  expect(p.evidence.every((e) => p.body.includes(e.quote))).toBe(true);
  expect(readSavedPaper(p)).toEqual(p);
});

it("rejoins typeset lines across invisible PDF.js spaces left behind by margin counters", () => {
  const row = (str: string, x: number, y: number, eol = false) => ({
    str,
    transform: [10, 0, 0, 10, x, y],
    width: 50,
    height: 10,
    hasEOL: eol,
    dir: "ltr",
    fontName: "Test",
  });
  const runs = [
    row(header, 80, 700, true),
    ...["The method uses", "120 sampled sites to", "measure 1.3 mm."].flatMap(
      (s, i) => [
        row("", 24, 640 - i * 13, true),
        row("01" + (i + 3), 24, 640 - i * 13),
        row(" ", 42, 640 - i * 13),
        row(s, 80, 640 - i * 13),
      ],
    ),
  ];
  expect(
    pdfProse(cleanManuscriptText(pdfPageText(runs, [0, 0, 612, 792], 1))),
  ).toBe("The method uses 120 sampled sites to measure 1.3 mm.");
});
