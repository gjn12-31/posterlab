import type { Paper } from "./paper-model";
import type { PosterLayout, PosterObject } from "./paper-layout-model";

const english = (s: string | undefined) =>
  !!s && /[a-z]/i.test(s) && !/[\u3400-\u9fff]/u.test(s);
const invitation =
  /\b(?:we invite|take a look|try it|read the|explore the|check out|we welcome|join us)\b/i;
const methodCue =
  /\b(?:we (?:built|introduce|develop|construct|train|evaluate|compare|release)|is (?:computed|evaluated|measured)|architecture|pipeline)\b/i;
const resultCue =
  /\b(?:observed|achieved?|outperform\w*|fell|reduced?|increased?|lower(?:s|ed)?|found|show(?:s|ed)?|occurs?|appear(?:s|ed)?|reached?|remain(?:s|ed)?|leaves?|yield(?:s|ed)?|ended)\b/i;

function completeSentences(raw: string) {
  const cleaned = raw
    .replace(/^\s*\d+\s*\/\s*\d+\s+/gm, "")
    .replace(/([a-z])-\s+([a-z])/g, "$1$2");
  return cleaned
    .split(/\n\s*\n/)
    .flatMap((p) =>
      Array.from(
        new Intl.Segmenter("en", { granularity: "sentence" }).segment(
          p.replace(/\s+/g, " "),
        ),
        (s) => s.segment.trim(),
      ),
    )
    .filter(
      (s) =>
        english(s) &&
        /^[“"'(]?[A-Z0-9]/.test(s) &&
        /[.?!]["')”]?$/u.test(s) &&
        !/https?:\/\/|\[…\]|^\d+\.\d+\s+[A-Z]/.test(s) &&
        s.length >= 24 &&
        s.length <= 270,
    );
}

// Read the existing English release and each finding's own verbatim evidence.
// Empty roles stay empty for papers lacking English source material.
export function englishPaperLayout(
  paper: Paper,
  layout: PosterLayout,
): PosterLayout {
  if (layout.language === "en" || layout.edited) return layout;
  const read = paper.process?.analysis?.reading;
  const posts = completeSentences(paper.edits.x || "");
  const quotes = (role: "problem" | "method" | "result") =>
    (read?.[role].refs || []).flatMap((ref) => completeSentences(ref.quote));
  const evidence = paper.evidence.flatMap((e) => completeSentences(e.quote));
  const title = english(paper.coverTitleEn) ? paper.coverTitleEn! : paper.title;
  const used = new Set([title]);
  function take(list: (string | undefined)[]) {
    for (const s of list)
      if (s && english(s) && !used.has(s)) {
        used.add(s);
        return s;
      }
    return "";
  }
  const subtitle = take([
    paper.coverLineEn,
    ...posts.filter((s) => !invitation.test(s)),
  ]);
  const question = take([
    ...posts.filter(
      (s) =>
        /\?|\b(?:test what|what happens|why|when|whether|risk)\b/i.test(s) &&
        !invitation.test(s),
    ),
    ...quotes("problem"),
  ]);
  const methods = quotes("method"),
    results = quotes("result");
  const method = take([
    ...methods.filter((s) => methodCue.test(s)),
    ...posts.filter((s) => methodCue.test(s)),
    ...methods,
  ]);
  const result = take([
    ...results.filter((s) => resultCue.test(s) && /\d/.test(s)),
    ...posts.filter((s) => resultCue.test(s) && /\d/.test(s)),
    ...results,
  ]);
  const end = take(posts.filter((s) => invitation.test(s)));
  function credit(id: string) {
    const o = layout.objects.find(
      (obj) => obj.id === id && obj.type === "image",
    );
    const v =
      o?.type === "image"
        ? paper.visuals?.find((v) => v.id === o.source)
        : undefined;
    return v ? v.label + " · p. " + v.page : o?.name || "";
  }
  const strings: Record<string, string> = {
    title,
    subtitle,
    "concept-credit": "AI concept illustration",
    "problem-label": question ? "Research question" : "",
    problem: question,
    "method-header": method || credit("method-image") ? "Method" : "",
    "method-body": method,
    "result-header": result || credit("result-image") ? "Results" : "",
    "result-body": result,
    "method-source": credit("method-image"),
    "result-source": credit("result-image"),
    caption: end,
    finding: take([...posts, ...evidence]),
  };
  const objects: PosterObject[] = layout.objects.flatMap((o) => {
    if (o.type !== "text" || !(o.id in strings)) return [o];
    const text = strings[o.id];
    return text ? [{ ...o, text }] : [];
  });
  return { ...layout, language: "en", objects };
}
