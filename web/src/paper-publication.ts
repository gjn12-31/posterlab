// A one-line note stays intact when an author has not supplied a separate title.
export function noteParts(copy: string) {
  const [first, ...rest] = copy.trim().split(/\r?\n/);
  const body = rest.join("\n").trim();
  return first.length <= 72 && body
    ? { title: first, body }
    : { title: "", body: copy.trim() };
}

export function postParts(copy: string) {
  return copy
    .trim()
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function articleFragment(copy: string) {
  const { title, body } = noteParts(copy);
  const root = document.createElement("article");
  root.style.cssText = "color:#24252c;font-size:16px;line-height:1.85";
  function block(tag: "h2" | "p", content: string) {
    const el = document.createElement(tag);
    el.style.cssText =
      tag === "h2"
        ? "font-size:22px;line-height:1.45;margin:0 0 18px"
        : "margin:0 0 16px";
    for (const [i, line] of content.split(/\r?\n/).entries()) {
      if (i) el.append(document.createElement("br"));
      el.append(document.createTextNode(line));
    }
    root.append(el);
  }
  if (title) block("h2", title);
  for (const p of postParts(body)) block("p", p);
  return root.outerHTML;
}
