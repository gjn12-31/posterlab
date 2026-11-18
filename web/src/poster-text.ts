export const escapeXml = (s: string) =>
  s.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
const canvas = document.createElement("canvas"),
  ctx = canvas.getContext("2d")!;
export function wrap(text: string, size: number, width: number, bold = false) {
  ctx.font = `${bold ? 700 : 400} ${size}px PosterCommon, PosterSans, sans-serif`;
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const c of para) {
      if (ctx.measureText(line + c).width > width && line) {
        out.push(line);
        line = c;
      } else line += c;
    }
    out.push(line);
  }
  return out;
}
