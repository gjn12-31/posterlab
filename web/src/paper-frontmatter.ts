// PDF text runs can be fragments of a single word, especially in TeX small caps.
import { cleanManuscriptText } from "./paper-clean";
import { unwrapPdfWords } from "./paper-sections";
import type { TextItem } from "pdfjs-dist/types/src/display/api";

export type PrintRun = Pick<TextItem, "str" | "height" | "width" | "transform">;
type Line = {
  runs: PrintRun[];
  y: number;
  height: number;
  x: number;
  right: number;
};
const xOf = (r: PrintRun) => r.transform[4];
const yOf = (r: PrintRun) => r.transform[5];
const gap = (a: PrintRun, b: PrintRun) => xOf(b) - xOf(a) - a.width;

function textLines(runs: PrintRun[], page: number[]) {
  const top = page[3],
    height = top - page[1];
  const lines: Line[] = [];
  const upper = runs
    .filter((r) => yOf(r) > top - height * 0.55)
    .sort((a, b) => yOf(b) - yOf(a) || xOf(a) - xOf(b));
  for (const r of upper) {
    let line = lines.at(-1);
    if (
      !line ||
      Math.abs(line.y - yOf(r)) > Math.max(line.height, r.height) * 0.42
    ) {
      line = {
        runs: [],
        x: xOf(r),
        right: xOf(r) + r.width,
        y: yOf(r),
        height: r.height,
      };
      lines.push(line);
    }
    line.runs.push(r);
    if (r.height > line.height) {
      line.height = r.height;
      line.y = yOf(r);
    }
    line.x = Math.min(line.x, xOf(r));
    line.right = Math.max(line.right, xOf(r) + r.width);
  }
  // Treat text across a column gutter as separate lines at the same baseline.
  const segments: Line[] = [];
  for (const line of lines) {
    line.runs.sort((a, b) => xOf(a) - xOf(b));
    let start = 0;
    for (let i = 1; i <= line.runs.length; i++) {
      if (
        i < line.runs.length &&
        gap(line.runs[i - 1], line.runs[i]) < line.height * 1.75
      )
        continue;
      const parts = line.runs.slice(start, i),
        last = parts.at(-1)!;
      segments.push({
        ...line,
        runs: parts,
        height: parts.reduce((max, p) => Math.max(max, p.height), 0),
        x: xOf(parts[0]),
        right: xOf(last) + last.width,
      });
      start = i;
    }
  }
  return segments;
}

function lineText(line: Line, names = false) {
  const parts = names
    ? line.runs.filter((r) => r.height >= line.height * 0.8)
    : line.runs;
  const small = (r: PrintRun) =>
    r.height < line.height * 0.91 && r.height > line.height * 0.65;
  const smallCaps =
    !names &&
    parts.some(
      (r, i) =>
        i > 0 &&
        small(r) &&
        !small(parts[i - 1]) &&
        /^[A-Z]/.test(r.str) &&
        /[A-Z]$/.test(parts[i - 1].str) &&
        gap(parts[i - 1], r) < line.height * 0.16,
    );
  let text = "";
  for (const [i, r] of parts.entries()) {
    const word = (smallCaps && small(r) ? r.str.toLowerCase() : r.str).trim();
    const prev = parts[i - 1];
    if (
      prev &&
      !/^[,.;:!?，。；：]/.test(word) &&
      (/\s$/.test(prev.str) ||
        /^\s/.test(r.str) ||
        /[,;]/.test(text.slice(-1)) ||
        gap(prev, r) > Math.min(prev.height, r.height) * 0.17) &&
      !(/[\p{Script=Han}]$/u.test(text) && /^[\p{Script=Han}]/u.test(word))
    )
      text += " ";
    text += word;
  }
  return text.replace(/\s+/g, " ").trim();
}

function credibleNames(lines: Line[], lastTitle: Line) {
  const names: string[] = [];
  let previous = lastTitle;
  for (const line of lines) {
    if (
      previous.y - line.y > previous.height * 2.5 ||
      line.height > lastTitle.height * 0.94
    )
      break;
    const text = lineText(line, true)
      .replace(/[∗*†‡]+/gu, "")
      .trim();
    if (
      /@|\b(?:university|institute|research|school|lab|laboratory|college|department|corporation|inc|ltd|gmbh|centre|center|academy|technologies|abstract|anonymous|conference)\b/i.test(
        text,
      )
    )
      break;
    const pieces = text
      .split(/\s*(?:,|;|\band\b|&)\s*/u)
      .map((s) => s.trim())
      .filter(Boolean);
    // Require a recognisable personal-name list directly beneath the heading.
    const person =
      /^(?:\p{Lu}[\p{L}.'’‐-]*|[A-Z]\.)(?:\s+(?:\p{Lu}[\p{L}.'’‐-]*|de|del|van|von|der|da)){1,4}$/u;
    if (!pieces.length || !pieces.every((n) => person.test(n))) break;
    names.push(...pieces);
    previous = line;
  }
  if (names.length < 2) return "";
  const byline = names.join(", ");
  if (byline.length <= 240) return byline;
  // Keep the field limit without cutting off part of a person's name.
  const shortened: string[] = [];
  for (const name of names) {
    if ([...shortened, name, "et al."].join(", ").length > 240) break;
    shortened.push(name);
  }
  return shortened.length ? shortened.join(", ") + ", et al." : "";
}

export function printedFrontmatter(items: PrintRun[], page: number[]) {
  const runs = items.filter(
    (r) =>
      r.str.trim() &&
      r.height > 0 &&
      Math.abs(r.transform[0]) > Math.abs(r.transform[1]),
  );
  const sizes = runs.slice().sort((a, b) => a.height - b.height);
  const weight = (r: PrintRun) => Math.min(r.str.trim().length, 80);
  let half = sizes.reduce((sum, r) => sum + weight(r), 0) / 2;
  const typical = sizes.find((r) => (half -= weight(r)) <= 0)?.height || 0;
  const lines = textLines(runs, page),
    text = lines.map((line) => lineText(line));
  let title = -1;
  for (const [i, line] of lines.entries()) {
    if (
      /^(?:abstract|摘要|(?:1\.?\s*)?introduction)(?:\s|[:：.]|$)/i.test(
        text[i],
      )
    )
      break;
    if (
      !cleanManuscriptText(text[i]) ||
      line.height < typical * 1.12 ||
      !/\p{L}{2}/u.test(text[i]) ||
      /copyright|arxiv:|preprint|https?:|proceedings|permission|published (?:by|as)|^\s*(?:ICLR|NeurIPS|ICML)\s+\d{4}\s*$/i.test(
        text[i],
      )
    )
      continue;
    if (title < 0 || line.height > lines[title].height * 1.06) title = i;
  }
  if (title < 0) return { title: "", byline: "" };
  const first = lines[title];
  const inTitleColumn = (line: Line) =>
    line.right > first.x && line.x < first.right;
  const heading = [text[title]];
  let lastTitle = first;
  for (let i = title + 1; i < lines.length; i++) {
    const line = lines[i],
      dy = lastTitle.y - line.y;
    if (dy > first.height * 1.85) break;
    if (!inTitleColumn(line) || dy < line.height * 0.55) continue;
    if (Math.abs(line.height - first.height) > first.height * 0.13) break;
    heading.push(text[i]);
    lastTitle = line;
  }
  const below = lines.filter(
    (line) => line.y < lastTitle.y && inTitleColumn(line),
  );
  return {
    title: unwrapPdfWords(heading.join("\n"), runs.map((r) => r.str).join(" "))
      .replaceAll("\n", " ")
      .slice(0, 500),
    byline: credibleNames(below, lastTitle),
  };
}

function metadataText(value: unknown) {
  const s = Array.isArray(value)
    ? value.filter((v) => typeof v === "string").join(", ")
    : typeof value === "string"
      ? value
      : "";
  return s.replace(/\s+/g, " ").trim();
}

export function metadataTitle(value: unknown) {
  const title = cleanManuscriptText(metadataText(value));
  return /^(?:untitled|microsoft (?:word|powerpoint)|arxiv:\s*\d|anonymous submission)|^main(?:\.pdf)?$|\.pdf$/i.test(
    title,
  )
    ? ""
    : title;
}

export function metadataAuthor(value: unknown) {
  const author = metadataText(value);
  return /^(?:anonymous(?: authors?)?|unknown|author|n\/a|microsoft (?:office )?user|admin(?:istrator)?|user)$/i.test(
    author,
  )
    ? ""
    : author;
}
