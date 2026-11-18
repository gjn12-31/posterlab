import {
  formats,
  labels,
  themes,
  type Field,
  type Format,
  type Snapshot,
} from "./model";
import { editions, type Edition } from "./editions";
import type { Issue } from "./render";
import { escapeXml } from "./poster-text";
export const campaignPalettes: Record<
  Edition,
  { paper: string; ink: string; tag: string }
> = {
  coffee: { paper: "#FFD65C", ink: "#271F19", tag: "COFFEE MARKET" },
  vinyl: { paper: "#BABBFF", ink: "#18152A", tag: "LIVE MUSIC" },
  nature: { paper: "#E6EAA9", ink: "#20382C", tag: "OUTDOORS" },
  bloom: { paper: "#F3CED0", ink: "#39312B", tag: "ART EXHIBITION" },
  course: { paper: "#DDE9FF", ink: "#202B3D", tag: "WORKSHOP" },
  launch: { paper: "#FFB490", ink: "#382119", tag: "EVENT INVITATION" },
  afterglow: { paper: "#D9D4FA", ink: "#25223A", tag: "SPECIAL EVENT" },
};
export function campaignTag(title: string) {
  if (/咖啡/.test(title)) return "COFFEE EVENT";
  if (/音乐|乐队|演唱/.test(title)) return "LIVE MUSIC";
  if (/山野|徒步|露营|户外/.test(title)) return "OUTDOORS";
  if (/市集/.test(title)) return "LOCAL MARKET";
  if (/工作坊|课堂|课程/.test(title)) return "WORKSHOP";
  return "EVENT INVITATION";
}
function paperFor(s: Snapshot) {
  const id = s.edition!,
    palette = campaignPalettes[id];
  return s.theme === editions[id].theme
    ? palette
    : { ...palette, paper: themes[s.theme].bg, ink: themes[s.theme].ink };
}
type TextLayer = (
  key: string,
  value: string,
  x: number,
  y: number,
  size: number,
  color: string,
  style?: string,
  maxW?: number,
  measureOnly?: boolean,
) => number;
export function campaignBackground(s: Snapshot, f: Format, photo: string) {
  const { width: w, height: h } = formats[f],
    p = paperFor(s);
  const portrait = f === "portrait",
    square = f === "square";
  const x = portrait ? 0 : square ? w * 0.55 : w * 0.52,
    y = portrait ? h * 0.3 : 0,
    iw = w - x,
    ih = portrait ? h * 0.47 : h;
  return `<rect width="${w}" height="${h}" fill="${p.paper}"/><svg x="${x}" y="${y}" width="${iw}" height="${ih}" viewBox="0 0 ${iw} ${ih}"><image href="${escapeXml(photo)}" width="${iw}" height="${ih}" preserveAspectRatio="xMidYMid slice"/></svg>`;
}
export function campaignText(
  s: Snapshot,
  f: Format,
  text: TextLayer,
  issues: Issue[],
) {
  const { width: w, height: h } = formats[f],
    unit = Math.min(w, h),
    p = paperFor(s),
    portrait = f === "portrait",
    x = portrait ? 0.056 : 0.043;
  const maxW = portrait ? w * 0.89 : w * (f === "square" ? 0.462 : 0.429);
  const titleY = portrait ? 0.09 : 0.21,
    titleEnd = portrait ? 0.285 : 0.57,
    title = s.brief.title;
  let size = unit * (portrait ? 0.119 : f === "square" ? 0.092 : 0.12);
  while (
    size > unit * 0.036 &&
    text("title", title, x, titleY, size, p.ink, "title", maxW, true) >
      titleEnd - titleY
  )
    size *= 0.9;
  const color = s.brand.enabled ? s.brand.accent : p.ink;
  text(
    "display",
    s.displayTitle ?? p.tag,
    x,
    portrait ? 0.032 : 0.083,
    unit * 0.035,
    color,
    "label",
    maxW,
  );
  const titleSpan = text("title", title, x, titleY, size, color, "title", maxW);
  if (titleSpan > titleEnd - titleY)
    issues.push({
      level: "error",
      field: "title",
      message: "标题放不下，请缩短或缩小字号",
    });
  const facts: Field[] = ["date", "time", "venue", "speaker", "cta"];
  let y = portrait ? 0.795 : 0.63;
  const width = s.brief.url && portrait ? maxW * 0.78 : maxW;
  for (const k of facts) {
    if (!s.brief[k]) continue;
    const value = s.brief[k];
    y +=
      text(
        k,
        value,
        x,
        y,
        unit * (k === "date" ? 0.04 : 0.035),
        p.ink,
        "body",
        width,
      ) + 0.006;
    if (y > 1.002 && s.layerStyles?.[f]?.[k]?.y === undefined)
      issues.push({
        level: "error",
        field: k,
        message: labels[k] + "放不下，请缩短或移到其他位置",
      });
  }
  if (s.creditLine)
    text("credit", s.creditLine, x, 0.01, unit * 0.022, p.ink, "body", maxW);
  for (const [i, n] of (s.notes ?? []).entries())
    text(n.id, n.text, x, 0.34 + i * 0.055, unit * 0.043, "#ffffff");
}
