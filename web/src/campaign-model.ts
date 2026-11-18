import { workspaceKey } from "./workspace";
import {
  briefSchema,
  campaignPlanSchema,
  type Brief,
  type CampaignPlan,
} from "./model";
import { isEdition, type Edition } from "./editions";

export const campaigns = [
  {
    edition: "coffee",
    label: "咖啡市集",
    notice:
      "周末咖啡市集\n2026年12月12日 10:00–17:00，地点：梧桐里广场。\n和街区咖啡师一起尝手冲、逛摊位。免费入场。",
  },
  {
    edition: "vinyl",
    label: "音乐现场",
    notice:
      "天台日落音乐会\n2026年12月19日 18:30，地点：南岸天台。\n三组独立乐队轮流登台，一起听到天黑。",
  },
  {
    edition: "nature",
    label: "周末户外",
    notice:
      "山野徒步集合\n2026年12月20日 08:30，地点：北山步道入口。\n带上水和轻便雨具，沿山脊走一段冬日小径。",
  },
] as const;
export const blankBrief: Brief = {
  title: "",
  speaker: "",
  date: "",
  time: "",
  venue: "",
  description: "",
  cta: "",
  url: "",
};
const fieldNames: Record<string, keyof Brief> = {
  活动标题: "title",
  标题: "title",
  主题: "title",
  活动名称: "title",
  主办方: "speaker",
  主讲人: "speaker",
  日期: "date",
  活动日期: "date",
  时间: "time",
  活动时间: "time",
  活动地点: "venue",
  地点: "venue",
  地址: "venue",
  简介: "description",
  介绍: "description",
  活动介绍: "description",
  报名链接: "url",
  链接: "url",
  行动号召: "cta",
};
const datePattern =
  /(?:20\d{2}[-/.年])?\d{1,2}月\d{1,2}[日号]?|20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}/;
const writtenClock =
  /(?:(?:上午|下午|早上|晚上|中午|傍晚)\s*)?[零一二两三四五六七八九十]{1,3}[点时](?:半|[一二三四五六七八九十]{1,3}分)?/;
const clock =
  /(?:(?:上午|下午|早上|晚上|中午|傍晚)\s*)?\d{1,2}(?:[:：]\d{2}|点(?:半|\d{1,2}分?)?|时(?:\d{1,2}分?)?)(?:\s*(?:至|到|[-~～—–])\s*(?:上午|下午|晚上)?\d{1,2}(?:[:：]\d{2}|点(?:半|\d{1,2}分?)?|时)?)?/;
const trim = (s: string) =>
  s.replace(/^[\s，,。；;、｜|]+|[\s，,。；;、｜|]+$/g, "");
export function parseNotice(raw: string): Brief {
  const text = raw.trim();
  if (!text) throw Error("先写下活动名称，或粘贴一段通知。");
  const b = { ...blankBrief },
    rest: string[] = [];
  const labels = Object.keys(fieldNames)
    .sort((a, b) => b.length - a.length)
    .join("|");
  const normalized = text.replace(
    new RegExp("([，,；;。]|\\s)+(?=(?:" + labels + ")[：:])", "g"),
    "\n",
  );
  for (const line of normalized.split(/\n+/).map(trim).filter(Boolean)) {
    const marked = line.match(/^([^：:]{1,6})[：:]\s*(.*)$/);
    if (marked && fieldNames[marked[1]]) {
      const f = fieldNames[marked[1]];
      if (f === "description") b[f] = trim(marked[2]);
      else {
        const [value, ...details] = marked[2].split(/[。！]/);
        if (b[f]) rest.push(marked[1] + "：" + b[f]);
        b[f] = trim(value);
        if (details.length) rest.push(trim(details.join("。")));
      }
    } else rest.push(line);
  }
  let free = rest.join("\n");
  if (!b.title) {
    const quoted = free
      .split("\n")[0]
      .match(/[《「【]([^》」】\n]{1,100})[》」】]/);
    if (quoted) {
      b.title = quoted[1];
      free = free.replace(quoted[0], "");
    } else {
      const first = free.split(/\n|[，,。；;！!]/)[0]?.trim() ?? "";
      const beforeDate = first.split(datePattern)[0].trim();
      const named = free.match(
        /(?:举办|举行|开展|组织|办)(?:一场|一次)?[「《]?([^，,。；;！!\n」》]{2,55})/,
      );
      if (
        named &&
        (datePattern.test(first) ||
          /^(本周|这周|下周|周[一二三四五六日末]|明天|今天|我们|将于|诚邀)/.test(
            first,
          ))
      ) {
        b.title = trim(named[1]);
        free = free.replace(named[0], named[0].slice(0, -named[1].length));
      } else if (beforeDate) {
        b.title = beforeDate;
        free = free.slice(b.title.length);
      }
    }
  }
  if (!b.url) {
    const match = free.match(/https?:\/\/[^\s，。；、）)]+/i);
    if (match) {
      b.url = match[0];
      free = free.replace(b.url, "");
    }
  }
  // A booking window belongs in the description. Its date is not the event date.
  const bookingNotes: string[] = [];
  free = free.replace(
    /(?:^|(?<=[\n，,。；;！!]))[ \t]*(?:(?:报名|预约|售票|购票)(?:截止|截至|时间|日期|开启|开始|结束|开放)|截止报名)[^\n，,。；;！!]*/gm,
    (match) => {
      bookingNotes.push(trim(match));
      return "";
    },
  );
  const timeText = [b.date, b.time, free].filter(Boolean).join(" ");
  const dateMatch = timeText.match(datePattern)?.[0] ?? "";
  const relative =
    timeText.match(
      /(?:本周|这周|下周|周|星期)[一二三四五六日天末]|明天|今天|后天/,
    )?.[0] ?? "";
  const exact = dateMatch.match(/^(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  const short = dateMatch.match(/^(\d{1,2})月(\d{1,2})/);
  const date = exact
    ? `${exact[1]}-${exact[2].padStart(2, "0")}-${exact[3].padStart(2, "0")}`
    : "";
  const checkDate = short
    ? `2000-${short[1].padStart(2, "0")}-${short[2].padStart(2, "0")}`
    : date;
  if (!briefSchema.shape.date.safeParse(checkDate).success)
    throw Error("通知里的日期无效，请核对后重新生成。");
  // Keep date ranges as supplied. The date field represents a single calendar day.
  const range =
    dateMatch &&
    timeText
      .slice(timeText.indexOf(dateMatch) + dateMatch.length)
      .match(
        /^\s*(?:至|到|[-~～—–])\s*(?:(?:20\d{2}[-/.年])?\d{1,2}[-/.月])?\d{1,2}(?:日|号)?/,
      );
  const matchedDate = dateMatch + (range?.[0] ?? "") || relative;
  const stripDate = (s: string) =>
    matchedDate ? trim(s.replace(matchedDate, "")) : s;
  const otherSchedule = [stripDate(b.date), stripDate(b.time)].filter(Boolean);
  b.date = range ? "" : date;
  free = stripDate(free);
  const timeMatch = (free.match(clock) || free.match(writtenClock))?.[0] ?? "";
  if (timeMatch) free = free.replace(timeMatch, "");
  b.time = [b.date ? "" : matchedDate, ...otherSchedule, timeMatch]
    .filter((v, i, all) => v && all.indexOf(v) === i)
    .join(" ");
  if (!b.venue) {
    const venue = free.match(
      /(?:集合地(?:点)?[：:]?|(?:将)?在|位于)\s*([^\n，,。；;！!]{1,80}?)(?:举办|举行|集合|开场|见面|开讲|开演|[\n，,。；;！!]|$)/,
    );
    if (venue) {
      b.venue = trim(venue[1]);
      free = free.replace(venue[0], "\n");
    } else {
      const place = free
        .split(/[，,。；;！!\n]/)
        .map(trim)
        .find(
          (part) =>
            part.length <= 35 &&
            /广场|公园|书店|剧场|礼堂|展厅|会议室|步道入口|活动中心/.test(
              part,
            ) &&
            /(广场|公园|书店|剧场|礼堂|展厅|会议室|入口|活动中心)$/.test(part),
        );
      if (place) {
        b.venue = place;
        free = free.replace(place, "");
      }
    }
  }
  free = free
    .replace(
      /(?:我们)?(?:将于|将)?\s*(?:举办|举行|开展|组织|办)(?:一场|一次)?(?=[\s，,。；;！!]|$)/g,
      "",
    )
    .replace(/^(?:我们)?(?:将于|将)(?=[\s，,。；;！!]|$)/, "");
  if (!b.title) throw Error("请把活动名称写在第一行，再生成宣传图。");
  b.description = [
    b.description,
    ...free.split(/\n+/).map(trim),
    ...bookingNotes,
  ]
    .filter(Boolean)
    .join("\n");
  const parsed = briefSchema.safeParse(b);
  if (!parsed.success)
    throw Error("请检查活动信息的长度、日期或报名链接，调整通知后再生成。");
  return parsed.data;
}
export function chooseEdition(text: string): Edition {
  if (/咖啡|饮品|市集|餐饮/.test(text)) return "coffee";
  if (/音乐|演出|乐队|黑胶/.test(text)) return "vinyl";
  if (/户外|徒步|露营|山野/.test(text)) return "nature";
  if (/课程|讲座|课堂|培训/.test(text)) return "course";
  if (/花|展览|植物/.test(text)) return "bloom";
  return "launch";
}
export function invitation(b: Brief, lead?: string) {
  const introduction = lead || b.description;
  const sentences = (text: string) =>
    text
      .split(/[。！？.!?\n]+/u)
      .map((s) => s.trim())
      .filter(Boolean);
  const cta = sentences(b.cta);
  const opening = sentences(introduction);
  const repeatsClosing =
    cta.length > 0 &&
    cta.length <= opening.length &&
    cta.every((part, i) => part === opening[opening.length - cta.length + i]);
  return [
    b.title,
    introduction,
    [b.date, b.time].filter(Boolean).join(" "),
    b.venue && "地点：" + b.venue,
    b.speaker && "主办 / 嘉宾：" + b.speaker,
    repeatsClosing ? "" : b.cta,
    b.url,
  ]
    .filter(Boolean)
    .join("\n");
}
type Schedule = Pick<Brief, "date" | "time" | "venue">;
export type Draft = {
  workingId: string;
  plan?: CampaignPlan;
  concept?: {
    edition?: Edition;
    invitation: string;
    art_direction?: string;
    model: string;
    tag: string;
    reason: string;
  };
  projectId?: string;
  previous?: Schedule;
  raw: string;
  applied: string;
  edition: Edition;
  brief: Brief;
};
export const draftKey = workspaceKey("posterlab.campaign.v1");
export function readCampaign(): Draft {
  try {
    const s = JSON.parse(localStorage.getItem(draftKey) ?? "null");
    if (
      s &&
      typeof s.raw === "string" &&
      typeof s.applied === "string" &&
      isEdition(s.edition) &&
      briefSchema.safeParse(s.brief).success
    ) {
      if (
        !briefSchema
          .pick({ date: true, time: true, venue: true })
          .safeParse(s.previous).success
      )
        delete s.previous;
      if (typeof s.projectId !== "string") delete s.projectId;
      if (
        s.concept &&
        !["invitation", "model", "tag", "reason"].every(
          (k) => typeof s.concept[k] === "string",
        )
      )
        delete s.concept;
      if (
        typeof s.workingId !== "string" ||
        !/^[a-zA-Z0-9-]{1,100}$/.test(s.workingId)
      )
        s.workingId = s.projectId || crypto.randomUUID();
      const plan = campaignPlanSchema.safeParse(s.plan);
      s.plan = plan.success ? plan.data : undefined;
      return s;
    }
  } catch {}
  const sample = campaigns[0];
  return {
    workingId: crypto.randomUUID(),
    raw: sample.notice,
    applied: sample.notice,
    edition: sample.edition,
    brief: parseNotice(sample.notice),
  };
}

export function noticeFromBrief(b: Brief) {
  const keys: Record<keyof Brief, string> = {
    title: "标题",
    date: "日期",
    time: "时间",
    venue: "地点",
    speaker: "主办方",
    description: "介绍",
    cta: "行动号召",
    url: "报名链接",
  };
  return (Object.keys(keys) as (keyof Brief)[])
    .filter((k) => b[k])
    .map((k) => keys[k] + "：" + b[k])
    .join("\n");
}
export function changeNotice(old: Schedule, now: Brief) {
  const when = (s: Schedule) => [s.date, s.time].filter(Boolean).join(" ");
  const lines = [now.title + " · 活动安排更新"];
  if (when(old) !== when(now))
    lines.push(
      "时间：" + (when(old) || "待定") + " → " + (when(now) || "待定"),
    );
  if (old.venue !== now.venue)
    lines.push(
      "地点：" + (old.venue || "待定") + " → " + (now.venue || "待定"),
    );
  return lines.length > 1 ? [...lines, "请以最新安排为准。"].join("\n") : "";
}
