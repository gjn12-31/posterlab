import QRCode from "qrcode";
import { editions, editionImage, type Edition } from "./editions";
import {
  createProject,
  formats,
  themes,
  briefSchema,
  labels,
  type Field,
  type Format,
  type Project,
  type Snapshot,
} from "./model";
import type { Issue } from "./render";
import { escapeXml } from "./poster-text";

export type LayerStyle = NonNullable<
  NonNullable<Snapshot["layerStyles"]>["portrait"]
>[string];
export function makeCover(id: Edition, title?: string) {
  const art = editions[id];
  const project = createProject({
    title: title?.trim() || art.title,
    speaker: "",
    date: "",
    time: "",
    venue: "",
    description: "",
    cta: "",
    url: "",
  });
  Object.assign(project.current, {
    edition: id,
    composition: "cover",
    theme: art.theme,
    locked: [],
  });
  return project;
}
export function layerText(s: Snapshot, id: string) {
  if (id === "credit")
    return (
      s.creditLine ??
      (s.brand.enabled
        ? s.brand.name
        : "POSTERLAB  /  " + editions[s.edition!].category)
    );
  if (id === "display") return s.displayTitle ?? editions[s.edition!].wordmark;
  if (id.startsWith("note-"))
    return s.notes?.find((n) => n.id === id)?.text ?? "";
  return s.brief[id as Field] ?? "";
}
export function changeText(s: Snapshot, id: string, value: string) {
  if (id === "credit") s.creditLine = value;
  else if (id === "display") s.displayTitle = value;
  else if (id.startsWith("note-")) {
    const item = s.notes?.find((n) => n.id === id);
    if (item) item.text = value;
  } else if (Object.hasOwn(labels, id)) s.brief[id as Field] = value;
}
export function patchLayer(
  s: Snapshot,
  format: Format,
  id: string,
  patch: LayerStyle,
) {
  s.layerStyles ??= {};
  const current = (s.layerStyles[format] ??= {});
  current[id] = { ...current[id], ...patch };
}
const ctx = document.createElement("canvas").getContext("2d")!;
const xml = escapeXml;
const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));
export function renderCover(project: Project, format: Format) {
  const s = project.current,
    id = s.edition!,
    art = editions[id],
    b = s.brief;
  const { width: w, height: h } = formats[format],
    land = format === "landscape";
  const unit = Math.min(w, h),
    margin = Math.round(unit * 0.065);
  const issues: Issue[] = [];
  const valid = briefSchema.safeParse(b);
  if (!valid.success)
    for (const issue of valid.error.issues)
      issues.push({
        level: "error",
        field: issue.path[0] as Field,
        message: issue.message,
      });
  if (!b.title.trim())
    issues.push({
      level: "error",
      field: "title",
      message: "给这张海报起个标题",
    });
  const background =
    (s.heroId && project.assets[s.heroId]?.data) || editionImage(id);
  const palette =
    s.theme === art.theme
      ? art.color
      : s.theme === "night"
        ? themes.night.accent
        : themes[s.theme].bg;
  const accent = s.brand.enabled ? s.brand.accent : palette;
  const ns = project.id.replace(/[^a-zA-Z0-9-]/g, "") + "-" + format;
  const fade = "veil-" + ns;
  let content = `<image href="${background}" width="${w}" height="${h}" preserveAspectRatio="${id === "afterglow" && !land ? "xMaxYMid" : "xMidYMid"} slice"/><rect width="${w}" height="${h}" fill="url(#${fade})"/>`;
  const logo = s.logoId && project.assets[s.logoId];
  if (logo)
    content += `<image href="${logo.data}" x="${margin}" y="${margin * 0.63}" width="52" height="52" preserveAspectRatio="xMidYMid meet"/>`;
  function textLayer(
    key: string,
    value: string,
    x: number,
    y: number,
    size: number,
    color: string,
    style = "body",
    maxW = w - 2 * margin,
    measureOnly = false,
  ) {
    if (!value.trim()) return 0;
    const settings = s.layerStyles?.[format]?.[key] || {};
    const accentText = style === "display",
      title = style === "title";
    const family =
      accentText && id !== "vinyl"
        ? "Georgia,serif"
        : "PosterCommon,PosterSans,sans-serif";
    const italic = accentText && (id === "bloom" || id === "coffee");
    const weight = title || (accentText && id === "vinyl") ? 700 : 400;
    let px = Math.round(
      size * (settings.scale ?? 1) * (title ? s.titleScale : 1),
    );
    function measure() {
      ctx.font = `${italic ? "italic " : ""}${weight} ${px}px ${family}`;
    }
    measure();
    if (accentText && !value.includes("\n")) {
      px = Math.max(
        22,
        Math.min(
          px,
          Math.floor((px * maxW) / Math.max(1, ctx.measureText(value).width)),
        ),
      );
      measure();
    }
    const lines: string[] = [];
    for (const paragraph of value.split("\n")) {
      let line = "";
      for (const char of paragraph) {
        if (line && ctx.measureText(line + char).width > maxW) {
          lines.push(line);
          line = "";
        }
        line += char;
      }
      lines.push(line);
    }
    const width = Math.min(
      w,
      Math.max(1, ...lines.map((line) => ctx.measureText(line).width)) +
        px * 0.14,
    );
    const step = px * 1.15,
      height = lines.length * step;
    if (measureOnly) return height / h;
    if (height > h - margin)
      issues.push({
        level: "error",
        field: Object.hasOwn(labels, key) ? (key as Field) : undefined,
        message: "文字超出画布，请缩短内容或缩小字号",
      });
    const left = clamp((settings.x ?? x) * w, 0, Math.max(0, w - width));
    const top = clamp((settings.y ?? y) * h, 0, Math.max(0, h - height));
    const runs = lines
      .map(
        (line, i) =>
          `<tspan x="0" y="${px * 0.9 + step * i}">${xml(line)}</tspan>`,
      )
      .join("");
    content += `<g data-layer="${xml(key)}" transform="translate(${left} ${top})"><rect width="${width}" height="${height}" fill="transparent"/><text fill="${xml(settings.color ?? color)}" font-family="${family}" font-size="${px}" font-style="${italic ? "italic" : "normal"}" font-weight="${weight}">${runs}</text></g>`;
    return height / h;
  }
  const x = margin / w;
  textLayer(
    "credit",
    layerText(s, "credit"),
    (margin + (logo ? 66 : 0)) / w,
    (margin * 0.65) / h,
    unit * 0.022,
    "#ffffff",
  );
  const factKeys = (
    ["speaker", "date", "time", "venue", "description", "cta"] as Field[]
  ).filter((k) => b[k]);
  const factWidth = w * (b.url?.trim() ? 0.68 : 0.87);
  const factSize = unit * 0.026;
  const display = s.displayTitle ?? art.wordmark,
    displaySize = unit * (land ? 0.24 : 0.19),
    titleSize = unit * (land ? 0.076 : 0.067);
  const displaySpan = textLayer(
    "display",
    display,
    x,
    0,
    displaySize,
    accent,
    "display",
    w - 2 * margin,
    true,
  );
  const titleSpan = textLayer(
    "title",
    b.title,
    x,
    0,
    titleSize,
    "#fff8f1",
    "title",
    w - 2 * margin,
    true,
  );
  const factsSpan = factKeys.reduce(
    (sum, k) =>
      sum +
      textLayer(k, b[k], x, 0, factSize, "#fffaf4", "body", factWidth, true) +
      0.009,
    0,
  );
  const preferredY =
    id === "bloom" ? 0.16 : id === "vinyl" ? 0.56 : land ? 0.34 : 0.51;
  const titleY = Math.max(
    0.095,
    Math.min(preferredY, 0.965 - displaySpan - titleSpan - factsSpan - 0.044),
  );
  textLayer("display", display, x, titleY, displaySize, accent, "display");
  textLayer(
    "title",
    b.title,
    x,
    titleY + displaySpan + 0.008,
    titleSize,
    "#fff8f1",
    "title",
  );
  let y = Math.max(
    titleY + displaySpan + titleSpan + 0.038,
    Math.min(id === "bloom" ? 0.62 : 0.79, 0.965 - factsSpan),
  );
  for (const key of factKeys) {
    const span = textLayer(
      key,
      b[key],
      x,
      y,
      factSize,
      "#fffaf4",
      "body",
      factWidth,
    );
    if (y + span > 1 && s.layerStyles?.[format]?.[key]?.y === undefined)
      issues.push({
        level: "error",
        field: key,
        message:
          labels[key] + "排版空间不足，请缩短文字、缩小字号或拖动调整位置",
      });
    y += span + 0.009;
  }
  for (const [i, note] of (s.notes ?? []).entries())
    textLayer(
      note.id,
      note.text,
      x,
      0.28 + i * 0.055,
      unit * 0.046,
      "#ffffff",
      "body",
    );
  if (b.url && valid.success) {
    try {
      const qr = QRCode.create(b.url),
        n = qr.modules.size;
      let path = "";
      for (let row = 0; row < n; row++)
        for (let col = 0; col < n; col++)
          if (qr.modules.get(row, col))
            path += `M${col + 4} ${row + 4}h1v1h-1z`;
      const size = unit * 0.15;
      content += `<svg x="${w - margin - size}" y="${h - margin - size}" width="${size}" height="${size}" viewBox="0 0 ${n + 8} ${n + 8}"><rect width="100%" height="100%" fill="white"/><path d="${path}"/></svg>`;
    } catch {
      issues.push({
        level: "error",
        field: "url",
        message: "报名链接太长，无法生成二维码",
      });
    }
  }
  return {
    issues,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="海报预览" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="${fade}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#070714" stop-opacity=".25"/><stop offset=".38" stop-color="#080919" stop-opacity=".07"/><stop offset="1" stop-color="#070611" stop-opacity=".8"/></linearGradient></defs>${content}</svg>`,
  };
}
