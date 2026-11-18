import { invitation } from "./campaign-model";
import {
  formats,
  releaseStages,
  type Brief,
  type Format,
  type Project,
  type ReleaseStage,
} from "./model";

const defaults: Record<ReleaseStage, { name: string; format: Format }> = {
  announce: { name: "活动预告", format: "portrait" },
  prepare: { name: "行前提醒", format: "square" },
  arrive: { name: "当天到场", format: "square" },
};

function shiftedDate(isoDate: string, days: number) {
  if (!isoDate) return "";
  const date = new Date(isoDate + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const boundFields = ["title", "date", "time", "venue", "url"] as const;
const placeholders = {
  title: "活动名",
  date: "日期",
  time: "时间",
  venue: "地点",
  url: "网址",
} as const;

// Store repeated facts in a custom opening as field references so they follow a reschedule.
export function bindStageIntro(intro: string, brief: Brief) {
  const fields = boundFields
    .filter((f) => brief[f].length > 1)
    .sort((a, b) => brief[b].length - brief[a].length);
  if (!fields.length) return intro;
  const literals = fields.map((field) =>
    brief[field].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  return intro.replace(new RegExp(literals.join("|"), "g"), (value) => {
    const field = fields.find((key) => brief[key] === value)!;
    return "{{" + placeholders[field] + "}}";
  });
}
function expandIntro(text: string, brief: Brief) {
  return text.replace(
    /\{\{(活动名|日期|时间|地点|网址)\}\}/g,
    (_, name) =>
      brief[boundFields.find((field) => placeholders[field] === name)!],
  );
}

function defaultIntro(stage: ReleaseStage, brief: Brief, modelInvite?: string) {
  if (stage === "announce")
    return modelInvite || brief.description || "欢迎关注这场活动。";
  const online =
    /线上|在线|直播|腾讯会议|钉钉会议|Zoom|Teams|Google Meet|https?:\/\//i.test(
      brief.venue,
    );
  if (stage === "arrive") {
    if (brief.cta && !/报名|截止|预约|售票|预订|抢购/.test(brief.cta))
      return brief.cta;
    if (online) return "参会时请按通知中的方式进入会场。";
    return brief.venue
      ? "这张海报可以留作到场指引。"
      : "请留意主办方的到场安排。";
  }
  const preparation = brief.description
    .split(/[。！？\n]/)
    .map((s) => s.trim())
    .find((s) =>
      /(?:请带|请携带|自备|带上|需携带|记得带|准备好|凭.{0,6}入场)/.test(s),
    );
  if (preparation)
    return /[.!?]$/.test(preparation) ? preparation : preparation + "。";
  if (online) return "请提前确认参会方式和设备，保留活动信息以便进入会场。";
  if (brief.venue) return "请先查好前往活动地点的路线，把海报留在手边。";
  return "可以先收藏这份活动安排，出发前再核对一次。";
}

export function releasePlan(project: Project) {
  const { brief, campaignCopy, campaignPlan } = project.current;
  const when = [brief.date, brief.time].filter(Boolean).join(" ");
  return releaseStages.map((id) => {
    const preference = campaignPlan?.stages?.[id];
    const days =
      id === "announce"
        ? (campaignPlan?.announceDays ?? 7)
        : id === "prepare"
          ? 1
          : 0;
    const relative =
      days === 0 ? "活动当天" : days === 1 ? "活动前一天" : `活动前 ${days} 天`;
    const baseIntro = defaultIntro(id, brief, campaignCopy?.invitation);
    const intro =
      preference?.intro === undefined
        ? baseIntro
        : expandIntro(preference.intro, brief);
    const place = brief.venue && "地点：" + brief.venue;
    const time = when && "时间：" + when;
    const link = brief.url && "活动链接：" + brief.url;
    const start =
      id === "prepare"
        ? brief.date
          ? "明日提醒"
          : "行前提醒"
        : brief.date
          ? "今日活动"
          : "到场提醒";
    const copy =
      id === "announce"
        ? invitation({ ...brief, description: intro })
        : [
            start + "｜" + brief.title,
            ...(id === "prepare" ? [intro, time, place] : [place, time, intro]),
            link,
          ]
            .filter(Boolean)
            .join("\n");
    return {
      id,
      name: defaults[id].name,
      days,
      relative,
      date: shiftedDate(brief.date, -days),
      format: preference?.format ?? defaults[id].format,
      baseIntro,
      intro,
      copy,
    };
  });
}
export type ReleaseEntry = ReturnType<typeof releasePlan>[number];

function calendarText(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replace(/\r\n?|\n/g, "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
}

// RFC 5545 content lines are at most 75 octets, including the continuation space.
function foldCalendarLine(line: string) {
  const encoder = new TextEncoder();
  let width = 0,
    result = "";
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (width + size > 75) {
      result += "\r\n ";
      width = 1;
    }
    result += char;
    width += size;
  }
  return result;
}
export function releaseCalendar(
  project: Project,
  entries = releasePlan(project),
) {
  if (!entries.length || entries.some((entry) => !entry.date)) return "";
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PosterLab//Campaign Plan//ZH",
    "CALSCALE:GREGORIAN",
  ];
  for (const entry of entries) {
    const description = `配图：${formats[entry.format].name}.png\n\n${entry.copy}`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${encodeURIComponent(project.id)}.${entry.id}@posterlab.local`,
      "DTSTAMP:" + stamp,
      "DTSTART;VALUE=DATE:" + entry.date.replaceAll("-", ""),
      "DTEND;VALUE=DATE:" + shiftedDate(entry.date, 1).replaceAll("-", ""),
      "SUMMARY:" +
        calendarText(`发布${entry.name}｜${project.current.brief.title}`),
      "DESCRIPTION:" + calendarText(description),
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  return (
    [...lines, "END:VCALENDAR"].map(foldCalendarLine).join("\r\n") + "\r\n"
  );
}
