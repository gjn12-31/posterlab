import { workspaceKey } from "./workspace";
import { findWork, type Artwork } from "./atlas-data";

import { validCrop, cropImage, type Crop } from "./atlas-crop";
const key = workspaceKey("posterlab.atlas.folio.v1");
export type Folio = Record<string, { note: string; crop?: Crop }>;
export function readFolio(): Folio {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "{}");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const result: Folio = {};
    for (const [id, value] of Object.entries(raw)) {
      if (!findWork(id)) continue;
      if (typeof value === "string") {
        result[id] = { note: value };
        continue;
      }
      if (
        value &&
        typeof value === "object" &&
        "note" in value &&
        typeof value.note === "string"
      )
        result[id] = {
          note: value.note,
          ...("crop" in value && validCrop(value.crop)
            ? { crop: value.crop }
            : {}),
        };
    }
    return result;
  } catch {
    return {};
  }
}
export function saveFolio(folio: Folio) {
  localStorage.setItem(key, JSON.stringify(folio));
}
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
async function embedImage(work: Artwork) {
  const r = await fetch(work.thumb);
  if (!r.ok) throw Error("图像读取失败");
  const blob = await r.blob();
  return new Promise<string>((ok, fail) => {
    const reader = new FileReader();
    reader.onload = () => ok(String(reader.result));
    reader.onerror = () => fail(Error("图像读取失败"));
    reader.readAsDataURL(blob);
  });
}
export async function exportFolio(items: Artwork[], notes: Folio) {
  const figures = await Promise.all(
    items.map(
      async (w) =>
        `<article><img src="${await embedImage(w)}" alt="${escape(w.title)}"><h2>${escape(w.title)}</h2><p>${escape(w.originalTitle)}</p><p>${escape([w.artist, w.year, w.medium].join(" · "))}</p><p>${escape(w.collection)} · <a href="${escape(w.sourceUrl)}">原作档案</a> · <a href="${escape(w.rightsUrl)}">图像授权</a></p>${notes[w.id]?.crop ? `<figure><img alt="收藏的局部" src="${await cropImage(w.image, notes[w.id].crop!)}"><figcaption>收藏的局部</figcaption></figure>` : ""}${notes[w.id]?.note ? `<blockquote>${escape(notes[w.id].note)}</blockquote>` : ""}</article>`,
    ),
  );
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>我的图像收藏 · PosterLab</title><style>*{box-sizing:border-box}body{background:#f4f1e9;color:#242421;font:16px/1.6 system-ui,sans-serif;max-width:1100px;margin:0 auto;padding:5vw}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr));gap:26px}article{border-top:1px solid #777;padding:16px 0;break-inside:avoid}img{width:100%;height:320px;object-fit:contain;background:#e4e0d6}h2{margin:12px 0 0}p{margin:6px 0}blockquote{margin:12px 0;padding-left:12px;border-left:2px solid #b34029;white-space:pre-wrap}a{color:#73442f}@media print{body{padding:0}article{page-break-inside:avoid}}</style><header>PosterLab 图像档案馆<h1>我的图像收藏</h1><p>${items.length} 件作品</p></header><main>${figures.join("")}</main></html>`;
  const url = URL.createObjectURL(
    new Blob([html], { type: "text/html;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "PosterLab-我的图像收藏.html";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
