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
