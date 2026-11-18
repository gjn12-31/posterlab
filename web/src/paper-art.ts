import { loadFonts } from "./render";
import {
  channels,
  channelCopy,
  evidenceText,
  imageCredit,
  platforms,
  type Channel,
  type Paper,
} from "./paper-model";
let photo: Promise<HTMLImageElement> | undefined;
async function image() {
  photo ??= (async () => {
    const img = new Image();
    img.src = import.meta.env.BASE_URL + "papers/m87.jpg";
    await img.decode();
    return img;
  })().catch((e) => {
    photo = undefined;
    throw e;
  });
  return photo;
}
const paperFont = 'PosterCommon, PosterSans, "PingFang SC", sans-serif';
function rows(ctx: CanvasRenderingContext2D, text: string, w: number) {
  const out: string[] = [];
  let row = "";
  const tokens = Array.from(
    new Intl.Segmenter(undefined, { granularity: "word" }).segment(text),
    (s) => s.segment,
  );
  for (const segment of tokens) {
    for (const token of ctx.measureText(segment).width > w
      ? [...segment]
      : [segment]) {
      if (row && ctx.measureText(row + token).width > w) {
        out.push(row.trimEnd());
        row = "";
      }
      row += row ? token : token.trimStart();
    }
  }
  if (row) out.push(row.trimEnd());
  return out;
}
export async function drawPaper(p: Paper, c: Channel) {
  const { width: w, height: h } = platforms[c];
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d")!;
  const title = c === "x" ? p.title : p.headline;
  await loadFonts(title + "科研笔记论文导读研究分享");
  const wide = w / h > 1.4,
    pad = w * 0.062,
    warm = p.sample && !p.figure,
    dark = warm ? "#120e10" : "#191c32",
    accent = warm ? "#ffa16d" : "#cdc6ff";
  g.fillStyle = dark;
  g.fillRect(0, 0, w, h);
  if (p.figure) {
    const img = new Image();
    img.src = p.figure.data;
    await img.decode();
    const box = wide
      ? { x: w * 0.62, y: h * 0.13, w: w * 0.33, h: h * 0.66 }
      : { x: pad, y: h * 0.13, w: w - pad * 2, h: h * 0.34 };
    const scale = Math.min(box.w / img.width, box.h / img.height);
    g.drawImage(
      img,
      box.x + (box.w - img.width * scale) / 2,
      box.y + (box.h - img.height * scale) / 2,
      img.width * scale,
      img.height * scale,
    );
  } else if (warm) {
    const img = await image();
    const size = wide ? h * 1.27 : w * 0.84,
      cx = wide ? w * 0.77 : w * 0.5,
      cy = wide ? h * 0.5 : h * 0.32;
    g.save();
    g.beginPath();
    g.rect(0, 0, w, h);
    g.clip();
    g.globalCompositeOperation = "screen";
    g.drawImage(img, cx - size * 0.85, cy - size * 0.5, size * 1.7, size);
    g.restore();
  } else {
    g.save();
    g.fillStyle = "#343252";
    g.translate(wide ? w * 0.82 : w * 0.76, wide ? h * 0.5 : h * 0.2);
    g.rotate(-0.24);
    for (const shift of [-1, 1]) {
      const q = wide ? h * 0.27 : w * 0.22;
      g.fillRect(shift * q * 0.52 - q * 0.45, -q * 0.82, q * 0.88, q * 1.24);
      g.beginPath();
      g.moveTo(shift * q * 0.52 - q * 0.45, q * 0.38);
      g.lineTo(shift * q * 0.52 + q * 0.43, q * 0.38);
      g.lineTo(shift * q * 0.52 - q * 0.45, q * 0.97);
      g.fill();
    }
    g.restore();
  }
  g.fillStyle = accent;
  g.font = "bold " + Math.round(Math.min(w, h) * 0.029) + "px Arial";
  const tag = {
    red: "RESEARCH NOTES",
    x: "RESEARCH THREAD",
    moments: "PAPER SPOTLIGHT",
    wechat: "RESEARCH BRIEF",
  }[c];
  g.fillText(tag, pad, wide ? h * 0.125 : h * 0.083);
  const areaW = wide ? w * 0.53 : w * 0.87,
    top = wide ? h * 0.23 : h * 0.505;
  const take =
    c === "x"
      ? p.evidence[p.evidence.length - 1].quote
      : p.evidence[Math.min(1, p.evidence.length - 1)].line;
  const captionSize = Math.min(w, h) * (wide ? 0.034 : 0.033);
  g.font = "400 " + captionSize + "px " + paperFont;
  const caption = rows(g, take, areaW);
  const fits = caption.length <= (wide ? 3 : 4);
  const bottom = fits ? (wide ? h * 0.57 : h * 0.665) : h * 0.84;
  let font = Math.min(w, h) * (wide ? 0.108 : 0.084),
    lines: string[] = [];
  while (true) {
    g.font = "700 " + font + "px " + paperFont;
    lines = rows(g, title, areaW);
    if (lines.length * font * 1.15 <= bottom - top || font <= 12) break;
    font *= 0.94;
  }
  g.fillStyle = "#fffaf5";
  g.textBaseline = "top";
  lines.forEach((s, i) => g.fillText(s, pad, top + i * font * 1.15));
  if (fits) {
    g.font = "400 " + captionSize + "px " + paperFont;
    g.fillStyle = "#e7dcd3";
    caption.forEach((s, i) =>
      g.fillText(s, pad, bottom + h * 0.026 + i * captionSize * 1.36),
    );
  }
  g.textBaseline = "alphabetic";
  g.strokeStyle = "#60575c";
  g.beginPath();
  g.moveTo(pad, h * 0.885);
  g.lineTo(w - pad, h * 0.885);
  g.stroke();
  g.fillStyle = accent;
  g.font = "bold " + Math.round(Math.min(w, h) * 0.023) + "px Arial";
  g.fillText(
    warm ? "M87*   /   EHT 2019" : "PAPER  /  RESEARCH NOTES",
    pad,
    h * 0.94,
  );
  g.textAlign = "right";
  g.fillStyle = "#e4d9d6";
  g.font = Math.round(Math.min(w, h) * 0.018) + "px Arial";
  g.fillText(
    p.figure
      ? p.figure.credit.length > 45
        ? p.figure.credit.slice(0, 44) + "…"
        : p.figure.credit
      : warm
        ? imageCredit
        : "PosterLab",
    w - pad,
    h * 0.94,
    w * 0.54,
  );
  return canvas;
}
export async function paperPng(p: Paper, c: Channel) {
  const canvas = await drawPaper(p, c);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(Error("配图导出失败"))),
      "image/png",
    ),
  );
}
export async function paperPack(p: Paper) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const c of channels) {
    const folder = platforms[c].name + "/";
    zip.file(folder + "配图.png", await paperPng(p, c));
    zip.file(folder + "发布文案.txt", channelCopy(p, c));
  }
  zip.file("原文与引文.txt", evidenceText(p));
  return zip.generateAsync({ type: "blob" });
}
