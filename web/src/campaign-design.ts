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
import {
  campaignBackground as firstEditionBackground,
  campaignText as firstEditionText,
  campaignPalettes,
} from "./campaign-design-v1";
export { campaignTag, campaignPalettes } from "./campaign-design-v1";

const stock: Record<Edition, { paper: string; ink: string; signal: string }> = {
  coffee: { paper: "#FFE9C1", ink: "#2E1B12", signal: "#F57B3D" },
  vinyl: { paper: "#E2DFFF", ink: "#241736", signal: "#9D86FF" },
  nature: { paper: "#EDF0CB", ink: "#213D2D", signal: "#A6C95A" },
  bloom: { paper: "#FFE8E1", ink: "#462222", signal: "#EB8B92" },
  course: { paper: "#E3EDFF", ink: "#1A2C49", signal: "#85A7F7" },
  launch: { paper: "#FFE2C8", ink: "#3D2117", signal: "#F9905D" },
  afterglow: { paper: "#E6E3FF", ink: "#252243", signal: "#ACA0EE" },
};
function inks(s: Snapshot) {
  const id = s.edition!;
  const palette =
    s.theme === editions[id].theme
      ? stock[id]
      : {
          paper: themes[s.theme].bg,
          ink: themes[s.theme].ink,
          signal: themes[s.theme].accent,
        };
  return s.brand.enabled ? { ...palette, signal: s.brand.accent } : palette;
}

function pressMark(
  s: Snapshot,
  cx: number,
  cy: number,
  radius: number,
  color: string,
) {
  const coffee = /咖啡|coffee/i.test(s.brief.title);
  const art = coffee
    ? '<g transform="rotate(30)"><ellipse cx="-.35" cy="-.13" rx=".39" ry=".67"/><path d="M-.39 -.77 C-.06 -.49 -.70 -.03 -.29 .52"/><ellipse cx=".39" cy=".15" rx=".36" ry=".60"/><path d="M.34 -.42 Q.57 -.22 .37 .12 T.46 .73"/></g>'
    : '<path d="M-.88 -.16 L.06 -.75 .87 -.30 -.09 .30 Z M-.86 .13 L-.09 .57 .85 -.01 M-.83 .42 L-.09 .84 .83 .28"/>';
  return `<g transform="translate(${cx} ${cy}) scale(${radius})" fill="none" stroke="${color}" stroke-width=".07" stroke-linecap="round" stroke-linejoin="round">${art}</g>`;
}
function photoFrame(s: Snapshot, f: Format, photo: string, namespace: string) {
  const { width: w, height: h } = formats[f];
  const { signal, ink } = inks(s);
  const square = f === "square";
  const x = w * (square ? 0.052 : 0.535),
    y = h * (square ? 0.37 : 0.055);
  const pw = w * (square ? 0.54 : 0.42),
    ph = h * (square ? 0.57 : 0.89);
  const shoulder = pw * (square ? 0.47 : 0.5);
  // Clip a single image so uploaded photography and embedded SVG exports share the same crop.
  const arch = `M${x} ${y + shoulder} Q${x} ${y} ${x + pw / 2} ${y} Q${x + pw} ${y} ${x + pw} ${y + shoulder}`;
  const clip = "campaign-arch-" + namespace;
  return `<defs><clipPath id="${clip}"><path d="${arch} V${y + ph} H${x} Z"/></clipPath></defs><image x="${x}" y="${y}" width="${pw}" height="${ph}" href="${escapeXml(photo)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clip})"/>
  <path d="${arch}" fill="none" stroke="${ink}" stroke-width="2"/>
  <rect x="${x}" y="${y + ph - 8}" width="${pw}" height="8" fill="${signal}"/>`;
}

export function campaignBackground(
  s: Snapshot,
  f: Format,
  photo: string,
  namespace: string,
) {
  if (s.campaignVersion !== 2) return firstEditionBackground(s, f, photo);
  const { width: w, height: h } = formats[f],
    { paper, ink, signal } = inks(s);
  const backdrop = `<rect width="${w}" height="${h}" fill="${paper}"/>`;
  if (f === "portrait") {
    const photoH = h * 0.772,
      fold = h * 0.028,
      x = w * 0.065,
      y = h * 0.105,
      id = "print-shade-" + namespace;
    return (
      backdrop +
      `<image width="${w}" height="${photoH}" href="${escapeXml(photo)}" preserveAspectRatio="xMidYMid slice"/>
    <defs><linearGradient id="${id}" x2="0%" y2="100%"><stop stop-color="#120E11" stop-opacity=".78"/><stop offset=".4" stop-color="#120E11" stop-opacity=".48"/><stop offset=".72" stop-color="#120E11" stop-opacity=".02"/></linearGradient></defs><rect width="${w}" height="${photoH}" fill="url(#${id})"/>
    <path d="M0 ${photoH} h${w * 0.69} l${fold} ${-fold} H${w} V${photoH + 2} H0 Z" fill="${paper}"/>
    <path d="M${x} ${y} H${w - x * 2}" stroke="#FFF0D9" stroke-opacity=".66" stroke-width="2"/>
    <rect x="${x}" y="${photoH + h * 0.032}" width="${w * 0.083}" height="8" fill="${signal}"/>
    ${pressMark(s, w * 0.907, h * 0.071, w * 0.038, "#FFF3DC")}`
    );
  }
  const sq = f === "square",
    x = w * (sq ? 0.052 : 0.047);
  const right = sq ? w * 0.877 : w * 0.482,
    top = h * (sq ? 0.099 : 0.169);
  return (
    backdrop +
    photoFrame(s, f, photo, namespace) +
    `<path d="M${x} ${top} H${right}" fill="none" stroke="${ink}" stroke-width="2"/>
    <rect x="${x}" y="${top - 3}" width="${w * 0.056}" height="6" fill="${signal}"/>
    ${pressMark(s, w * (sq ? 0.925 : 0.465), h * (sq ? 0.067 : 0.102), Math.min(w, h) * (sq ? 0.037 : 0.043), ink)}`
  );
}

type TextLayer = Parameters<typeof firstEditionText>[2];
function fittedHeading(
  text: TextLayer,
  key: "title" | "display",
  value: string,
  x: number,
  y: number,
  w: number,
  height: number,
  preferred: number,
  min: number,
  color: string,
) {
  const style = key === "title" ? "title" : "label";
  let size = preferred;
  while (
    size > min &&
    text(key, value, x, y, size, color, style, w, true) > height
  )
    size = Math.max(min, size * 0.91);
  return text(key, value, x, y, size, color, style, w);
}

export function campaignText(
  s: Snapshot,
  f: Format,
  text: TextLayer,
  issues: Issue[],
) {
  if (s.campaignVersion !== 2) return firstEditionText(s, f, text, issues);
  const { width: w, height: h } = formats[f],
    u = Math.min(w, h);
  const p = inks(s),
    portrait = f === "portrait",
    square = f === "square";
  const x = portrait ? 0.065 : square ? 0.052 : 0.047;
  const headerInk = portrait ? "#FFF5E2" : p.ink;
  const titleInk = s.brand.enabled && !portrait ? s.brand.accent : headerInk;
  const tagX = x + (s.logoId ? 65 / w : 0);
  const tagY = f === "landscape" ? 0.079 : 0.041;
  fittedHeading(
    text,
    "display",
    s.displayTitle ?? campaignPalettes[s.edition!].tag,
    tagX,
    tagY,
    w * (portrait ? 0.7 : square ? 0.74 : 0.35),
    0.06,
    u * 0.035,
    u * 0.017,
    headerInk,
  );
  const titleY = portrait ? 0.129 : square ? 0.127 : 0.235;
  const titleBox = portrait ? 0.305 : square ? 0.208 : 0.383;
  const titleW = w * (portrait ? 0.76 : square ? 0.9 : 0.435);
  if (
    fittedHeading(
      text,
      "title",
      s.brief.title,
      x,
      titleY,
      titleW,
      titleBox,
      u * (portrait ? 0.169 : square ? 0.14 : 0.158),
      u * 0.037,
      titleInk,
    ) > titleBox
  )
    issues.push({
      level: "error",
      field: "title",
      message: "标题放不下，请缩短或缩小字号",
    });

  function column(
    fields: Field[],
    left: number,
    top: number,
    maxW: number,
    bottom: number,
  ) {
    const keys = fields.filter((k) => s.brief[k]);
    const gap = 0.011;
    const sizes: Partial<Record<Field, number>> = {
      date: 0.046,
      time: 0.034,
      venue: 0.045,
      speaker: 0.03,
      cta: 0.032,
    };
    const span = (scale: number, measure: boolean) => {
      let y = top;
      for (const k of keys) {
        y += text(
          k,
          s.brief[k],
          left,
          y,
          u * (sizes[k] ?? 0.035) * scale,
          p.ink,
          "body",
          maxW,
          measure,
        );
        if (
          !measure &&
          y > bottom + 0.002 &&
          s.layerStyles?.[f]?.[k]?.y === undefined
        )
          issues.push({
            level: "error",
            field: k,
            message: labels[k] + "放不下，请缩短或移动该图层",
          });
        y += gap;
      }
      return y - gap;
    };
    let scale = 1;
    while (scale > 0.61 && span(scale, true) > bottom) scale *= 0.9;
    span(scale, false);
  }
  if (portrait) {
    const available = w * (s.brief.url ? 0.66 : 0.875);
    const hasSchedule = !!(s.brief.date || s.brief.time);
    const offset = hasSchedule ? available * 0.51 : 0;
    column(["date", "time"], x, 0.831, available * 0.47, 0.974);
    column(
      ["venue", "speaker", "cta"],
      x + offset / w,
      0.831,
      available - offset,
      0.974,
    );
  } else if (square) {
    column(
      ["date", "time", "venue", "speaker", "cta"],
      0.628,
      0.414,
      w * 0.324,
      s.brief.url ? 0.765 : 0.955,
    );
  } else {
    column(["date", "time"], x, 0.685, w * 0.207, 0.948);
    column(
      ["venue", "speaker", "cta"],
      s.brief.date || s.brief.time ? 0.281 : x,
      0.685,
      w * (s.brief.date || s.brief.time ? 0.204 : 0.435),
      0.948,
    );
  }
  if (s.creditLine)
    text(
      "credit",
      s.creditLine,
      x,
      portrait ? 0.725 : square ? 0.334 : 0.623,
      u * 0.022,
      headerInk,
      "body",
      titleW,
    );
  for (const [i, n] of (s.notes ?? []).entries())
    text(
      n.id,
      n.text,
      x,
      0.44 + i * 0.055,
      u * 0.043,
      portrait ? "#FFF5E2" : p.ink,
    );
}
