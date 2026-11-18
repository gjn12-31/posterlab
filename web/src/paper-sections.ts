import { prepareText } from "./paper-model";

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

// A first-page teaser between Abstract and Introduction is outside the abstract.
export function abstractBeforeFigure(section: string) {
  const caption =
    /\n[ \t]*(?:fig(?:ure)?\.?\s*\d+|图\s*\d+)[ \t]*[.|:：丨｜—–-]/iu.exec(
      section,
    );
  if (!caption) return section;
  const before = section.slice(0, caption.index).trimEnd();
  const prose = /[。！？.!?][”"’')）\]]?(?=\s*\n|$)/g;
  const last = [...before.matchAll(prose)].at(-1);
  return last ? before.slice(0, last.index! + last[0].length) : before;
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
  const text = raw
    .replace(/\r/g, "")
    .replace(/(\p{Script=Latin})-\n(?!\p{Ll}+[-‐])(?=\p{Ll})/gu, "$1")
    .trim();
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
