import LineBreaker from "linebreak";

type Measure = (value: string) => number;
const words =
  typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter("zh", { granularity: "word" })
    : undefined;
const glyphs =
  typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : undefined;

export function campaignLines(
  paragraph: string,
  width: number,
  measure: Measure,
  balance = false,
): string[] {
  if (!paragraph || measure(paragraph) <= width) return [paragraph];
  const breaker = new LineBreaker(paragraph);
  const ends: number[] = [];
  for (let point = breaker.nextBreak(); point; point = breaker.nextBreak())
    ends.push(point.position);

  // A two-line headline can use a more balanced break than body text.
  // Among legal Unicode breaks, prefer word boundaries for Chinese compounds.
  if (balance && measure(paragraph) <= width * 2) {
    const natural = new Set(
      Array.from(words?.segment(paragraph) ?? [], (part) => part.index),
    );
    let best = 0,
      score = Infinity;
    for (const end of ends.slice(0, -1)) {
      const left = measure(paragraph.slice(0, end).trimEnd()),
        right = measure(paragraph.slice(end).trimStart());
      if (left > width || right > width || !left || !right) continue;
      const cost =
        Math.abs(left - right) +
        (natural.size && !natural.has(end) ? width * 0.65 : 0);
      if (cost < score) {
        best = end;
        score = cost;
      }
    }
    if (best)
      return [
        paragraph.slice(0, best).trimEnd(),
        paragraph.slice(best).trimStart(),
      ];
  }
  const lines: string[] = [];
  let current = "",
    from = 0;
  for (const end of ends) {
    const part = paragraph.slice(from, end);
    from = end;
    if (current && measure((current + part).trimEnd()) > width) {
      lines.push(current.trimEnd());
      current = "";
    }
    const next = current ? part : part.trimStart();
    if (measure(next.trimEnd()) <= width) {
      current += next;
      continue;
    }
    // An entire URL or long technical name may exceed a column even on its own.
    const chars = glyphs
      ? Array.from(glyphs.segment(next), (p) => p.segment)
      : Array.from(next);
    for (const char of chars) {
      if (current && measure(current + char) > width) {
        lines.push(current.trimEnd());
        current = "";
      }
      current += char;
    }
  }
  if (current.trimEnd() || !lines.length) lines.push(current.trimEnd());
  return lines;
}
