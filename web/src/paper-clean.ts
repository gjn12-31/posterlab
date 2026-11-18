// Review templates repeat these notices above or between blocks of manuscript text.
// Only match a complete notice at a line or sentence boundary, so discussion of
// review practices (and papers that cite a venue) remains valid source material.
const notice =
  /(^|(?<=[.!?。！？])[ \t]+|\n[ \t]*)(?:(?:CVPR|ICCV|ECCV|ICLR|ICML|NeurIPS|ACL|EMNLP|AAAI)[ \t]+20\d{2}[ \t]+submission(?:[ \t]+(?:ID|number|no\.?))?(?:[ \t]*#?[ \t]*\d{1,8})?|confidential[ \t]+review[ \t]+copy|do[ \t]+not[ \t]+distribute|anonymous[ \t]+(?:conference[ \t]+)?submission|under[ \t]+review[ \t]+(?:as[ \t]+a[ \t]+conference[ \t]+paper[ \t]+at|at)[ \t]+(?:ICLR|ICML|NeurIPS|CVPR)[ \t]+20\d{2})(?:[.!](?=\s|$)|(?=[ \t]*(?:\n|$)))/gi;

// Text pasted out of an anonymous manuscript may retain its zero-padded line
// numbers. Only remove runs of three or more ascending labels on consecutive
// prose lines; a year, measured value, or method name is not a line label.
function stripPastedLineNumbers(text: string) {
  const lines = text.split("\n");
  for (const edge of ["start", "end"] as const) {
    const pattern =
      edge === "start" ? /^\s*(\d{3})[ \t]+/ : /[ \t]+(\d{3})\s*$/;
    let start = 0;
    while (start < lines.length) {
      const first = pattern.exec(lines[start]);
      if (!first || !/\p{L}/u.test(lines[start])) {
        start++;
        continue;
      }
      let end = start + 1;
      while (end < lines.length) {
        const next = pattern.exec(lines[end]);
        if (
          !next ||
          !/\p{L}/u.test(lines[end]) ||
          Number(next[1]) !== Number(first[1]) + end - start
        )
          break;
        end++;
      }
      if (end - start >= 3 && first[1].startsWith("0")) {
        for (let i = start; i < end; i++)
          lines[i] = lines[i].replace(pattern, "");
      }
      start = end;
    }
  }
  return lines.join("\n");
}

export function cleanManuscriptText(raw: string) {
  const text = raw.replace(/\r\n?/g, "\n");
  // Delete each matched administrative sentence in place. Leave a separator
  // when it fell between two pieces of running text on the same line.
  return stripPastedLineNumbers(text)
    .replace(notice, "$1")
    .replace(/^[ \t]+|[ \t]+$/gm, "")
    .trim();
}
