type Page = { page: number; text: string };
const encoder = new TextEncoder();
const bytes = (value: unknown) => encoder.encode(JSON.stringify(value)).length;
const limit = 1_900_000;
const gap = "\n[…]\n";
const relevant =
  /\b(?:methods?|results?|evaluat\w*|findings?|experiments?|conclusions?|table|figure)\b|方法|结果|实验|结论|图表/i;

// Byte allowance includes escaped JSON, so quotes, newlines and non-BMP
// characters count exactly as they do in the gateway's UTF-8 request body.
function sample(text: string, budget: number) {
  if (bytes(text) <= budget) return text;
  const chars = Array.from(text),
    pieces: string[] = [];
  for (let i = 0; i < chars.length; i += 320)
    pieces.push(chars.slice(i, i + 320).join(""));
  const key = pieces
    .map((p, i) => (relevant.test(p) ? i : -1))
    .filter((i) => i >= 0);
  const positions = new Set<number>([0, pieces.length - 1]);
  // Give early and late findings a chance before adding general context.
  for (const i of [key[0], key.at(-1), Math.floor(pieces.length / 2)])
    if (i !== undefined) positions.add(i);
  for (let divisions = 4; divisions < pieces.length * 2; divisions *= 2)
    for (let j = 1; j < divisions; j += 2)
      positions.add(Math.floor((pieces.length * j) / divisions));
  for (const i of key) positions.add(i);
  let used = 2;
  const picked: number[] = [];
  for (const i of positions) {
    const cost = bytes(pieces[i]) - 2 + bytes(gap) - 2;
    if (used + cost <= budget) {
      picked.push(i);
      used += cost;
    }
  }
  picked.sort((a, b) => a - b);
  return picked
    .map((i, j) => (j && picked[j - 1] + 1 !== i ? gap : "") + pieces[i])
    .join("");
}

export function readingPayload<T extends { pages: Page[] }>(payload: T): T {
  if (bytes(payload) <= limit) return payload;
  const base = bytes({
    ...payload,
    pages: payload.pages.map((p) => ({ ...p, text: "" })),
  });
  let remaining = limit - base;
  const sizes = payload.pages
    .map((p, i) => ({ i, n: bytes(p.text) - 2 }))
    .sort((a, b) => a.n - b.n);
  const allocations: number[] = [];
  for (const [j, { i, n }] of sizes.entries()) {
    const allowance = Math.min(n, Math.floor(remaining / (sizes.length - j)));
    allocations[i] = allowance + 2;
    remaining -= allowance;
  }
  return {
    ...payload,
    pages: payload.pages.map((p, i) => ({
      ...p,
      text: sample(p.text, allocations[i]),
    })),
  };
}
