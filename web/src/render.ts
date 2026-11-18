import { renderCover } from "./cover";
import { escapeXml, wrap } from "./poster-text";
export { escapeXml, wrap } from "./poster-text";
import QRCode from "qrcode";
import commonGlyphs from "./common-glyphs.txt?raw";
import "./poster-fonts.css";
import { editions, editionImage } from "./editions";

import {
  type Project,
  type Format,
  formats,
  themes,
  type Field,
  labels,
  briefSchema,
} from "./model";
export type Issue = {
  level: "error" | "warning";
  field?: Field;
  message: string;
};
const compactGlyphs = new Set(commonGlyphs);
function fontFamilyFor(text: string) {
  return Array.from(text).every(
    (char) => /\s/.test(char) || compactGlyphs.has(char),
  )
    ? "PosterCommon"
    : "PosterSans";
}
export async function loadFonts(text = "") {
  const family = fontFamilyFor(text);
  await Promise.all(
    [400, 700].map((weight) =>
      document.fonts.load(`${weight} 32px ${family}`, text || "Aa"),
    ),
  );
}
export function renderPoster(
  project: Project,
  format: Format,
): { svg: string; issues: Issue[] } {
  if (project.current.composition === "cover" && project.current.edition)
    return renderCover(project, format);
  const s = project.current,
    b = s.brief,
    t = themes[s.theme];
  const accent = s.brand.enabled ? s.brand.accent : t.accent;
  const { width: w, height: h } = formats[format],
    land = format === "landscape",
    m = 64;
  const issues: Issue[] = [];
  const validation = briefSchema.safeParse(b);
  if (!validation.success)
    for (const issue of validation.error.issues) {
      const field = issue.path[0] as Field;
      issues.push({
        level: "error",
        field,
        message: labels[field] + "：格式或长度不符合要求",
      });
    }

  for (const field of ["title"] as Field[])
    if (!b[field].trim())
      issues.push({ level: "error", field, message: `请填写${labels[field]}` });
  const qr = !!b.url;
  let body = "";
  const text = (
    value: string,
    x: number,
    y: number,
    size: number,
    color: string,
    weight = 400,
    anchor = "start",
  ) =>
    `<text x="${x}" y="${y}" fill="${color}" font-family="PosterCommon, PosterSans, sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${escapeXml(value)}</text>`;
  const art = (x: number, y: number, width: number, height: number) => {
    const hero = s.heroId && project.assets[s.heroId];
    if (hero)
      return `<clipPath id="artclip"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="18"/></clipPath><image href="${hero.data}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#artclip)"/>`;
    let inner = "";
    const cx = x + width * 0.65,
      cy = y + height * 0.55,
      r = Math.min(width * 0.35, height * 0.75);
    if (s.theme === "violet" || s.theme === "night") {
      inner = `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r * 0.8}" fill="url(#chrome)" transform="rotate(-25 ${cx} ${cy})"/><ellipse cx="${cx}" cy="${cy}" rx="${r * 0.42}" ry="${r * 0.35}" fill="${t.soft}" transform="rotate(-25 ${cx} ${cy})"/>`;
    } else if (s.theme === "mint" || s.theme === "paper") {
      for (let i = 0; i < 12; i++)
        inner += `<ellipse cx="${cx}" cy="${cy + height * 0.25}" rx="${r + i * 12}" ry="${r * 1.3 + i * 12}" fill="none" stroke="${accent}" stroke-width="${i % 2 ? 4 : 9}" opacity=".65"/>`;
    } else if (s.theme === "orange") {
      const pts = Array.from({ length: 24 }, (_, i) => {
        const angle = (i * Math.PI) / 12,
          rad = i % 2 ? r * 0.42 : r;
        return `${cx + Math.cos(angle) * rad},${cy + Math.sin(angle) * rad}`;
      }).join(" ");
      inner = `<polygon points="${pts}" fill="${t.ink}"/>`;
    } else {
      for (let i = 0; i < 10; i++)
        inner += `<rect x="${x + (i * width) / 10}" y="${y - height * 0.5}" width="${width / 20}" height="${height * 2}" fill="${accent}" opacity=".6" transform="rotate(25 ${cx} ${cy})"/>`;
    }
    return `<clipPath id="artclip"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="16"/></clipPath><g clip-path="url(#artclip)"><rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${t.soft}"/>${inner}</g>`;
  };
  const logo = s.logoId && project.assets[s.logoId];
  if (wrap(s.brand.name, 19, w - 2 * m - (logo ? 65 : 0), true).length > 1)
    issues.push({ level: "error", message: "品牌名称过长，请缩短名称" });
  if (logo)
    body += `<image href="${logo.data}" x="${m}" y="42" width="46" height="46" preserveAspectRatio="xMidYMid meet"/>`;
  body += text(
    s.brand.name || "POSTERLAB / CREATIVE COMMUNITY",
    m + (logo ? 65 : 0),
    75,
    19,
    accent,
    700,
  );
  const edition = s.edition && editions[s.edition];
  const hasDetails = !!(
    b.date ||
    b.time ||
    b.venue ||
    b.speaker ||
    b.description ||
    b.url ||
    b.cta
  );
  let titleTop = 140;
  if (edition && s.edition) {
    const artX = land ? 1120 : 0;
    const artY = land ? 0 : 108;
    const artW = w - artX;
    const artH = land
      ? h
      : Math.round(
          h * (hasDetails ? (format === "square" ? 0.22 : 0.34) : 0.6),
        );
    const hero = s.heroId && project.assets[s.heroId];
    const photo = hero ? hero.data : editionImage(s.edition);
    body += `<svg x="${artX}" y="${artY}" width="${artW}" height="${artH}" viewBox="0 0 ${artW} ${artH}"><image href="${photo}" width="${artW}" height="${artH}" preserveAspectRatio="xMidYMid slice"/><rect width="${artW}" height="${artH}" fill="url(#photo-fade)"/><text x="45" y="${artH - 38}" font-family="Georgia,serif" font-style="italic" font-size="${Math.min(artW * 0.25, artH * 0.46)}" letter-spacing="-8" fill="#fff8e8">${edition.wordmark}</text></svg>`;
    titleTop = land ? 166 : artY + artH + 18;
  }
  const areaW = land ? (edition ? 985 : 1080) : w - 2 * m;
  let font = (land ? 92 : format === "square" ? 86 : 106) * s.titleScale;
  const titleLimit = land ? 270 : format === "square" ? 235 : 350;
  let titleLines = wrap(b.title || "写下你的好想法", font, areaW, true);
  while (titleLines.length * font * 1.15 > titleLimit && font > 48) {
    font -= 2;
    titleLines = wrap(b.title, font, areaW, true);
  }
  if (titleLines.length * font * 1.15 > titleLimit)
    issues.push({
      level: "error",
      field: "title",
      message: "标题过长，请缩短或调小字号",
    });
  let y = titleTop;
  const anchor = s.align === "center" ? "middle" : "start",
    tx = s.align === "center" ? m + areaW / 2 : m;
  titleLines.forEach((line) => {
    y += font * 1.15;
    body += text(line, tx, y, font, t.ink, 700, anchor);
  });
  y += 38;
  if (land && !edition) {
    body += art(1235, 125, 620, 660);
    y = Math.max(y, 420);
  } else if (!edition) {
    const artH = format === "square" ? 145 : 255;
    body += art(m, y, w - m * 2, artH);
    y += artH + 43;
  }
  const contentW = areaW,
    col = contentW / 2 - 24;
  const row = (a: Field, c: Field) => {
    const entries = [a, c];
    let rowHeight = 0;
    entries.forEach((field, index) => {
      if (!b[field]) return;
      const x = m + index * (contentW / 2 + 12);
      body += text(labels[field], x, y, 18, accent);
      const lines = wrap(b[field], 29, col, true);
      lines.forEach(
        (line, i) => (body += text(line, x, y + 39 + i * 38, 29, t.ink, 700)),
      );
      rowHeight = Math.max(rowHeight, 48 + lines.length * 38);
    });
    y += rowHeight + 13;
  };
  row("speaker", "date");
  row("time", "venue");
  const qrSize = land ? 174 : 148,
    descW = contentW - (qr ? qrSize + 30 : 0),
    footerY = h - 70;
  let descSize = 28;
  let descLines = wrap(b.description, descSize, descW);
  const available = footerY - y - 55;
  while (descLines.length * descSize * 1.45 > available && descSize > 24) {
    descSize--;
    descLines = wrap(b.description, descSize, descW);
  }
  if (descLines.length * descSize * 1.45 > available)
    issues.push({
      level: "error",
      field: "description",
      message: "介绍超出版面，请缩短介绍或拆分物料",
    });
  descLines.forEach(
    (line, i) =>
      (body += text(
        line,
        m,
        y + descSize + i * descSize * 1.45,
        descSize,
        t.ink,
      )),
  );
  if (qr) {
    try {
      const code = QRCode.create(b.url, { errorCorrectionLevel: "M" }),
        n = code.modules.size,
        side = n + 8;
      const qx = land && !edition ? 1550 : m + contentW - qrSize,
        qy = land && !edition ? 830 : y;
      let path = "";
      for (let r = 0; r < n; r++)
        for (let c = 0; c < n; c++)
          if (code.modules.get(r, c)) path += `M${c + 4} ${r + 4}h1v1h-1z`;
      body += `<svg x="${qx}" y="${qy}" width="${qrSize}" height="${qrSize}" viewBox="0 0 ${side} ${side}"><rect width="${side}" height="${side}" fill="#fff"/><path d="${path}" fill="#111"/></svg>`;
      if ((!land || edition) && qy + qrSize > footerY - 20)
        issues.push({
          level: "error",
          field: "url",
          message: "二维码区域超出版面，请缩短文字",
        });
      if (qrSize / side < 2)
        issues.push({
          level: "warning",
          field: "url",
          message: "链接较长，二维码较密集，建议使用更短的报名链接",
        });
    } catch {
      issues.push({
        level: "error",
        field: "url",
        message: "报名链接无法生成二维码",
      });
    }
  }
  if (y > footerY - 60)
    issues.push({ level: "error", message: "活动信息过长，已超出安全区域" });
  body += `<line x1="${m}" y1="${footerY - 16}" x2="${land && edition ? 1050 : w - m}" y2="${footerY - 16}" stroke="${accent}" opacity=".4"/>`;
  const ctaLines = wrap(b.cta, 22, land && edition ? areaW : w - 2 * m);
  if (ctaLines.length > 1)
    issues.push({
      level: "error",
      field: "cta",
      message: "行动号召较长，请精简为一行",
    });
  body += text(b.cta, m, footerY + 18, 22, accent);
  if (s.brand.enabled) {
    const luminance = (hex: string) => {
      const nums = hex
        .slice(1)
        .match(/../g)!
        .map((c) => parseInt(c, 16) / 255)
        .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return nums[0] * 0.2126 + nums[1] * 0.7152 + nums[2] * 0.0722;
    };
    const a = luminance(accent),
      bg = luminance(t.bg),
      contrast = (Math.max(a, bg) + 0.05) / (Math.min(a, bg) + 0.05);
    if (contrast < 4.5)
      issues.push({
        level: "warning",
        message: "品牌强调色与背景对比度不足，建议选择更清晰的颜色",
      });
  }
  const prefix = `p-${project.id.replace(/[^a-zA-Z0-9-]/g, "")}-${format}-${s.theme}-`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="海报预览"><defs><linearGradient id="photo-fade" x2="0" y2="1"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".38"/></linearGradient><linearGradient id="chrome" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#effffc"/><stop offset=".22" stop-color="#727b9d"/><stop offset=".4" stop-color="#e8dfff"/><stop offset=".6" stop-color="#242c50"/><stop offset=".8" stop-color="#c4ffeb"/><stop offset="1" stop-color="#8c71b0"/></linearGradient></defs><rect width="${w}" height="${h}" fill="${t.bg}"/>${body}</svg>`;
  return {
    svg: svg
      .replaceAll('id="photo-fade"', `id="${prefix}photo-fade"`)
      .replaceAll("url(#photo-fade)", `url(#${prefix}photo-fade)`)
      .replaceAll('id="artclip"', `id="${prefix}artclip"`)
      .replaceAll("url(#artclip)", `url(#${prefix}artclip)`)
      .replaceAll('id="chrome"', `id="${prefix}chrome"`)
      .replaceAll("url(#chrome)", `url(#${prefix}chrome)`),
    issues,
  };
}
const embeddedFonts = new Map<string, Promise<string>>();
function fontStyle(family: string) {
  const cached = embeddedFonts.get(family);
  if (cached) return cached;
  const loading = (async () => {
    const fetchFont = async (name: string) => {
      const r = await fetch(`${import.meta.env.BASE_URL}fonts/${name}`);
      if (!r.ok) throw Error("导出字体加载失败，请联网重试");
      return new Promise<string>((resolve, reject) => {
        r.blob()
          .then((blob) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          })
          .catch(reject);
      });
    };
    const [regular, bold] = await Promise.all([
      fetchFont(family + "-Regular.woff2"),
      fetchFont(family + "-Bold.woff2"),
    ]);
    return `<style>@font-face{font-family:${family};src:url(${regular});font-weight:400}@font-face{font-family:${family};src:url(${bold});font-weight:700}</style>`;
  })().catch((error) => {
    embeddedFonts.delete(family);
    throw error;
  });
  embeddedFonts.set(family, loading);
  return loading;
}
export async function exportBlob(
  project: Project,
  format: Format,
  type: "png" | "svg",
) {
  const text = [
    project.current.brand.name,
    project.current.displayTitle || "",
    project.current.creditLine || "",
    ...(project.current.notes || []).map((note) => note.text),
    ...Object.values(project.current.brief),
    ...Object.values(labels),
    "写下你的好想法",
  ].join("");
  await loadFonts(text);
  const rendered = renderPoster(project, format);
  if (rendered.issues.some((i) => i.level === "error"))
    throw Error(
      `${formats[format].name}：${rendered.issues.find((i) => i.level === "error")!.message}`,
    );
  let svg = rendered.svg.replace(
    "<defs>",
    "<defs>" + (await fontStyle(fontFamilyFor(text))),
  );
  if (project.current.edition && !project.current.heroId) {
    const url = editionImage(project.current.edition);
    const response = await fetch(url);
    if (!response.ok) throw Error("主视觉加载失败，请重试导出");
    const blob = await response.blob();
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(Error("主视觉读取失败"));
      reader.readAsDataURL(blob);
    });
    svg = svg.replace(`href="${url}"`, `href="${data}"`);
  }
  if (type === "svg") return new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const { width, height } = formats[format];
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(Error("图片导出失败"))),
        "image/png",
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export async function exportPack(p: Project, onProgress: (n: number) => void) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const [i, format] of (Object.keys(formats) as Format[]).entries()) {
    zip.file(`${formats[format].name}.png`, await exportBlob(p, format, "png"));
    onProgress(i + 1);
  }
  zip.file("project.posterlab.json", JSON.stringify(p, null, 2));
  zip.file(
    "发布文案.txt",
    `${p.current.brief.title}\n\n${p.current.brief.description}\n\n${p.current.brief.date} ${p.current.brief.time}\n${p.current.brief.venue}\n${p.current.brief.cta}\n${p.current.brief.url}`,
  );
  zip.file(
    "使用说明.txt",
    "此包包含三种尺寸海报、可重新导入的项目与发布文案。活动信息由创作者提供，请在发布前确认。图片和字体请遵守各自许可。",
  );
  return zip.generateAsync({ type: "blob" });
}
export async function readAsset(file: File) {
  if (file.size > 8_000_000) throw Error("图片上限8MB");
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw Error("请上传 PNG、JPEG 或 WebP 图片");
  const image = await createImageBitmap(file);
  if (image.width * image.height > 32_000_000) {
    image.close();
    throw Error("图片像素过大，请压缩后上传");
  }
  const scale = Math.min(1, 1800 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  return {
    id: crypto.randomUUID(),
    name: file.name.slice(0, 200),
    data: canvas.toDataURL(
      file.type === "image/png" ? "image/png" : "image/jpeg",
      0.86,
    ),
    width: canvas.width,
    height: canvas.height,
    license: "用户提供，请确认具有使用权",
  };
}
