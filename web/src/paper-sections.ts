import type { TextItem } from "pdfjs-dist/types/src/display/api";
import { prepareText } from "./paper-model";
import { cleanManuscriptText } from "./paper-clean";

// Only match section names at a line boundary. Numbers in citations and
// occurrences of "introduction" in ordinary prose are part of the source.
const abstractHeading =
  /(?:^|\n)[ \t]*(?:abstract\b|摘[ \t]*要)[ \t:：.．—–-]*/i;
const introductionHeading =
  /(?:^|\n)[ \t]*(?:(?:1|I|一)[ \t]*[.．、)）]?[ \t]*|第一[章节][ \t]*)?(?:introduction\b|引[ \t]*言|绪[ \t]*论|前[ \t]*言)[ \t:：.．—–-]*/i;
const nextSection =
  /(?:^|\n)[ \t]*(?:(?:II[.．、)）]?[ \t]+|[2-9二][.．、)）][ \t]*|[2-9][ \t]+)[A-Z\p{Script=Han}][^\n]{0,90}(?=\n|$)|第[二三][章节][^\n]*|(?:related work|background|methods?(?: and materials)?|materials and methods|results|references|参考文献|相关工作|研究方法|实验方法)(?=[ \t]*[:：\n]|[ \t]*$))/iu;
const metadata =
  /\n[ \t]*(?:keywords|key words|index terms|关键词|doi[ \t]*[:：])[ \t:：]*/i;

// Keep the last abstract sentence even when the plot starts before its caption.
export function abstractBeforeFigure(section: string) {
  const caption =
    /\n[ \t]*(?:fig(?:ure)?\.?\s*\d+|图\s*\d+)[ \t]*[.|:：丨｜—–-]/iu.exec(
      section,
    );
  const before = caption ? section.slice(0, caption.index).trimEnd() : section;
  // Both a tick sequence and an axis label are needed. Units in prose stay intact.
  const axes =
    /\n[ \t]*(?:[-+]?\d+(?:\.\d+)?[kKMBGT%µμ]*[ \t]+){2,}[-+]?\d+(?:\.\d+)?[kKMBGT%µμ]*[ \t]*\n[ \t]*(?:#\w+|[^\n]{1,32}\((?:log|linear) scale\))/i.exec(
      before,
    );
  return (axes ? before.slice(0, axes.index) : before).trimEnd();
}

// Line counters in review PDFs are separate runs aligned down the outside
// margins or the column gutter. Identify a numbered series before flattening
// the page, when it is still distinguishable from prose, years and quantities.
function reviewCounters(items: TextItem[], view: number[]) {
  const counters = new Set<TextItem>();
  const templateText = items.map((item) => item.str.trim()).join(" ");
  if (
    !/confidential\s+review\s+copy|(?:CVPR|ICCV|ECCV|ICLR|NeurIPS|ICML)\s+20\d{2}\s+submission|under review as a conference paper/i.test(
      templateText,
    )
  )
    return counters;
  const columns: TextItem[][] = [];
  const width = view[2] - view[0];
  for (const item of items) {
    if (!/^\d{3}$/.test(item.str.trim())) continue;
    const x = item.transform[4];
    const fraction = (x - view[0]) / width;
    if (fraction > 0.12 && fraction < 0.88 && Math.abs(fraction - 0.5) > 0.045)
      continue;
    const column = columns.find(
      (group) => Math.abs(group[0].transform[4] - x) <= 2,
    );
    if (column) column.push(item);
    else columns.push([item]);
  }
  for (const column of columns) {
    column.sort((a, b) => b.transform[5] - a.transform[5]);
    for (let i = 0; i < column.length;) {
      let j = i + 1;
      for (; j < column.length; j++) {
        const prev = column[j - 1],
          next = column[j];
        const drop = prev.transform[5] - next.transform[5];
        if (
          Number(next.str) !== Number(prev.str) + 1 ||
          drop < prev.height * 0.6 ||
          drop > prev.height * 4
        )
          break;
      }
      if (j - i >= 3 && column[i].str.trim().startsWith("0")) {
        for (let k = i; k < j; k++) counters.add(column[k]);
      }
      i = j;
    }
  }
  return counters;
}

// Use the page geometry before flattening PDF.js runs into text. Footnote
// indices and mathematical exponents often contain the very same characters.
export function pdfPageText(
  items: TextItem[],
  view: number[],
  pageNumber: number,
) {
  const lines: string[] = [];
  const pageHeight = view[3] - view[1];
  const center = (view[2] + view[0]) / 2;
  let previous: TextItem | undefined;
  const visible = items.filter((item) => item.str.trim());
  const captionStart = /^(?:Fig(?:ure)?\.?\s*\d+|图\s*\d+)\s*[.:：|丨｜—–-]/iu;
  const hidden = reviewCounters(visible, view);
  const anchors = new Map<TextItem, string>();
  let footerY = -Infinity;
  let footerHeight = 0;
  for (let i = 1; i < visible.length; i++) {
    const item = visible[i],
      prev = visible[i - 1];
    const note =
      /corresponding author|equal contribution|full author list|work (?:performed|done)|(?:the )?code is available/i;
    const marked =
      /^(?:[∗*†‡]|\d{1,2})$/.test(prev.str.trim()) &&
      prev.height < item.height * 0.82;
    if (
      item.transform[5] < view[1] + pageHeight * 0.14 &&
      note.test(item.str) &&
      (marked || /^[∗*†‡]/.test(item.str.trim()))
    ) {
      footerY = Math.max(
        footerY,
        marked ? prev.transform[5] + 1 : item.transform[5] + 1,
      );
      footerHeight = Math.max(footerHeight, item.height);
    }
    const label = captionStart.exec(prev.str.trim());
    if (pageNumber <= 1 || !label) continue;
    // A floated caption can fall between two halves of a paragraph at a page break.
    // Only exclude it if a separate lower-case continuation follows its closing sentence.
    for (let j = i; j < Math.min(visible.length, i + 100); j++) {
      const before = visible[j - 1],
        after = visible[j];
      if (
        Math.abs(before.transform[5] - after.transform[5]) <=
        Math.max(before.height, after.height) * 1.65
      )
        continue;
      if (
        /[.!?。！？][”"')\]]?$/.test(before.str.trim()) &&
        /^\p{Ll}/u.test(after.str.trim())
      ) {
        anchors.set(prev, label[0]);
        visible.slice(i, j).forEach((run) => hidden.add(run));
      }
      break;
    }
  }
  for (const item of items) {
    const text = item.str.trim();
    const [x, y] = item.transform.slice(4);
    if (
      (y <= footerY && item.height <= footerHeight * 1.03) ||
      hidden.has(item)
    )
      continue;
    if (
      text === String(pageNumber) &&
      y < view[1] + pageHeight * 0.08 &&
      Math.abs(x + item.width / 2 - center) < (view[2] - view[0]) * 0.04
    )
      continue;
    if (
      y > view[3] - pageHeight * 0.09 &&
      /^Published as a conference paper at\b/i.test(text)
    )
      continue;
    if (!text) {
      if (item.hasEOL) lines.push("\n");
      else if (item.str) lines.push(" ");
      continue;
    }
    if (
      previous &&
      /^[0-9]{1,2}$/.test(text) &&
      /[.!?。！？]$/.test(previous.str.trim()) &&
      item.height < previous.height * 0.82 &&
      y > previous.transform[5] + previous.height * 0.16 &&
      y < previous.transform[5] + previous.height * 0.8 &&
      Math.abs(x - previous.transform[4] - previous.width) <
        previous.height * 0.25
    )
      continue;
    const dy = previous ? previous.transform[5] - y : 0;
    if (previous && Math.abs(dy) > Math.max(3, item.height * 0.6))
      lines.push("\n");
    lines.push(anchors.get(item) || item.str);
    if (item.hasEOL) lines.push("\n");
    previous = item;
  }
  return stripDiagramLabels(
    lines.join("").replace(/(?:[ \t]*\n)+[ \t]*/g, "\n"),
  );
}

// Unwrap typeset English lines while retaining paragraph/section breaks and
// punctuation in the source that the author can review in the import form.
export function pdfProse(text: string) {
  return text
    .replace(/([^\n])\n(?=([A-Za-z0-9“‘(]))/g, (match, end: string) =>
      /[a-zA-Z0-9,;:–—”’)]/.test(end) ? end + " " : match,
    )
    .trim();
}

export function unwrapPdfWords(text: string, spellingSource = text) {
  // Prefer the spelling printed elsewhere in the same extract. Productive
  // compound prefixes retain their hyphens; TeX syllable splits are rejoined.
  const spellings = new Set(
    spellingSource.toLowerCase().match(/[a-z]+(?:-[a-z]+)+/g),
  );
  return text
    .replace(/([a-z]+)-\n([a-z]+)/gi, (_, left: string, right: string) => {
      const hyphenated = left + "-" + right;
      if (
        /^[A-Z]/.test(right) ||
        spellings.has(hyphenated.toLowerCase()) ||
        /^(?:high|low|self|semi|human|test|model|fine|open|large|small|long|short|end|non|multi|cross|well)$/i.test(
          left,
        )
      )
        return hyphenated;
      return left + right;
    })
    .replace(/([A-Za-z0-9])[-‐]\n(?=\d)/g, "$1-")
    .replace(
      /(\d\.)\n(?=\d{1,4}(?:[kKMBGT](?![A-Za-z])|\s*(?:%|mm\b|cm\b|nm\b|ms\b|eV\b)))/g,
      "$1",
    );
}

// PDF readers sometimes interleave the labels and pseudocode inside a diagram
// with the surrounding introduction. Only omit a dense numeric block when a
// figure caption follows it on the same page and no intervening prose is present.
export function stripDiagramLabels(page: string) {
  const lines = page.split("\n");
  const kept: string[] = [];
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    if (
      !/^\s*(?:fig(?:ure)?\.?\s*\d+|图\s*\d+)\s*[.|:：丨｜—–-]/i.test(lines[i])
    )
      continue;
    let boundary = i - 1;
    while (boundary >= start && lines[boundary].trim().length < 65) boundary--;
    const fragment = lines.slice(boundary + 1, i);
    const tick = /^\s*(?:[-+]?\d+(?:\.\d+)?|[⋯…⨀⨁]+)\s*$/;
    if (fragment.filter((line) => tick.test(line)).length < 8) continue;
    const first = fragment.findIndex((line) => tick.test(line));
    kept.push(...lines.slice(start, boundary + 1 + first));
    start = i;
  }
  return kept.concat(lines.slice(start)).join("\n");
}

export function extractSections(raw: string, titleHint = "") {
  const text = cleanManuscriptText(raw);
  const front = prepareText(text, titleHint);
  const intro = introductionHeading.exec(text);
  const before = intro ? text.slice(0, intro.index) : text;
  const heading = abstractHeading.exec(before);
  const unlabelled =
    /(?:^|\n)[ \t]*[（(][^\n]{0,300}(?:received|收稿)[^\n]{0,300}[）)]/i.exec(
      before,
    );
  // An introduction on page one may follow only a cover/title and author list.
  const abstract = (
    heading
      ? before.slice(heading.index + heading[0].length)
      : unlabelled
        ? before.slice(unlabelled.index + unlabelled[0].length)
        : intro
          ? before
              .split(/\n/)
              .slice(1)
              .join("\n")
              .match(/(?:^|\n)([^\n]{35,}[\s\S]*[。.!?！？][\s\S]*)/)?.[1] || ""
          : front.body
  )
    .split(metadata)[0]
    .trim();
  const sections = intro
    ? text.slice(intro.index + intro[0].length).split(nextSection)
    : [];
  const introduction = sections[0]?.trim() || "";
  return {
    title: front.title,
    source: front.source,
    abstract,
    introduction,
    namedAbstract: !!heading || !!unlabelled,
    hasIntroduction: !!intro,
    introductionContinues: !!introduction && sections.length === 1,
  };
}
