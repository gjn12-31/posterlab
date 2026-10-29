import { z } from "zod";
export const fields = [
  "title",
  "speaker",
  "date",
  "time",
  "venue",
  "description",
  "cta",
  "url",
] as const;
export type Field = (typeof fields)[number];
export const labels: Record<Field, string> = {
  title: "活动标题",
  speaker: "主讲人 / 主办方",
  date: "活动日期",
  time: "活动时间",
  venue: "活动地点",
  description: "活动介绍",
  cta: "行动号召",
  url: "报名链接",
};
export const themes = {
  violet: {
    name: "液态银紫",
    tag: "未来 · 实验",
    bg: "#d7c9f5",
    ink: "#26163d",
    accent: "#7560b3",
    soft: "#baaae3",
  },
  mint: {
    name: "自然回响",
    tag: "有机 · 松弛",
    bg: "#d6ebda",
    ink: "#193d30",
    accent: "#507c60",
    soft: "#acd0b6",
  },
  orange: {
    name: "大胆发生",
    tag: "锐利 · 张力",
    bg: "#ff915f",
    ink: "#2d1c36",
    accent: "#69394e",
    soft: "#ffc4a6",
  },
  paper: {
    name: "暖纸人文",
    tag: "编辑 · 温度",
    bg: "#f2e6d5",
    ink: "#56372f",
    accent: "#a85b46",
    soft: "#dcc5a8",
  },
  blue: {
    name: "蓝调学术",
    tag: "秩序 · 理性",
    bg: "#dce7fb",
    ink: "#163b79",
    accent: "#4974b7",
    soft: "#b1c7ed",
  },
  night: {
    name: "午夜电波",
    tag: "深邃 · 光感",
    bg: "#141b30",
    ink: "#edf4ff",
    accent: "#91bcdf",
    soft: "#283e60",
  },
} as const;
export type Theme = keyof typeof themes;
export const formats = {
  portrait: { name: "竖版海报", width: 1080, height: 1440, ratio: "3:4" },
  square: { name: "社交方图", width: 1080, height: 1080, ratio: "1:1" },
  landscape: { name: "横版封面", width: 1920, height: 1080, ratio: "16:9" },
} as const;
export type Format = keyof typeof formats;
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const url = z
  .string()
  .max(1000)
  .refine(
    (v) =>
      !v ||
      (/^https?:\/\//i.test(v) &&
        (() => {
          try {
            new URL(v);
            return true;
          } catch {
            return false;
          }
        })()),
    "报名链接须为 http 或 https 地址",
  );
export const briefSchema = z.object({
  title: z.string().max(180),
  speaker: z.string().max(120),
  date: z
    .string()
    .max(10)
    .refine(
      (v) =>
        !v ||
        (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
          !Number.isNaN(Date.parse(v)) &&
          new Date(v).toISOString().slice(0, 10) === v),
      "日期格式须为 YYYY-MM-DD",
    ),
  time: z.string().max(80),
  venue: z.string().max(220),
  description: z.string().max(1200),
  cta: z.string().max(80),
  url,
});
export type Brief = z.infer<typeof briefSchema>;
export const brandSchema = z.object({
  name: z.string().max(80),
  accent: hex,
  enabled: z.boolean(),
});
export type Brand = z.infer<typeof brandSchema>;
const id = z.string().min(1).max(100);
export const snapshotSchema = z.object({
  id,
  created: z.string(),
  label: z.string().max(100),
  brief: briefSchema,
  locked: z.array(z.enum(fields)).max(8),
  theme: z.enum(["violet", "mint", "orange", "paper", "blue", "night"]),
  titleScale: z.number().min(0.65).max(1.4),
  align: z.enum(["left", "center"]),
  brand: brandSchema,
  heroId: id.optional(),
  logoId: id.optional(),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
const assetSchema = z.object({
  id,
  name: z.string().max(200),
  data: z
    .string()
    .max(6_000_000)
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/),
  width: z.number().int().positive().max(4096),
  height: z.number().int().positive().max(4096),
  license: z.string().max(200),
});
export type Asset = z.infer<typeof assetSchema>;
export const projectSchema = z
  .object({
    schemaVersion: z.literal("2.0"),
    id,
    created: z.string(),
    updated: z.string(),
    current: snapshotSchema,
    history: z.array(snapshotSchema).max(20),
    assets: z.record(z.string(), assetSchema),
    lastExport: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (Object.keys(v.assets).length > 20)
      ctx.addIssue({ code: "custom", message: "最多导入20项图片素材" });
    for (const snap of [v.current, ...v.history])
      for (const assetId of [snap.heroId, snap.logoId])
        if (assetId && !v.assets[assetId])
          ctx.addIssue({ code: "custom", message: "项目引用了缺失图片" });
  });
export type Project = z.infer<typeof projectSchema>;
export const now = () => new Date().toISOString();
export function createProject(partial: Partial<Brief> = {}): Project {
  const time = now();
  return {
    schemaVersion: "2.0",
    id: crypto.randomUUID(),
    created: time,
    updated: time,
    current: {
      id: crypto.randomUUID(),
      created: time,
      label: "开始创作",
      brief: {
        title: "让想象，\n发生。",
        speaker: "PosterLab 创意社区",
        date: "2026-11-08",
        time: "14:00–16:00",
        venue: "创意空间 · 一层展厅",
        description:
          "一次关于设计与想象力的开放对话。与创作者一起，探索表达的新可能。",
        cta: "欢迎每一个好奇的你",
        url: "",
        ...partial,
      },
      theme: "violet",
      locked: ["date", "time", "venue", "speaker", "url"],
      titleScale: 1,
      align: "left",
      brand: {
        name: "POSTERLAB / CREATIVE COMMUNITY",
        accent: "#7560b3",
        enabled: false,
      },
    },
    history: [],
    assets: {},
  };
}
export function parseProject(raw: string) {
  if (raw.length > 25_000_000) throw Error("项目超过25MB，请减少素材后重试");
  return projectSchema.parse(JSON.parse(raw));
}
export type Suggestion = {
  fields: Partial<Brief>;
  theme?: Theme;
  titleScale?: number;
  reason: string;
  source: "local" | "stepfun";
};
export function applySuggestion(
  project: Project,
  suggestion: Suggestion,
): Project {
  const c = structuredClone(project.current);
  for (const [k, v] of Object.entries(suggestion.fields)) {
    if (!fields.includes(k as Field) || c.locked.includes(k as Field)) continue;
    c.brief[k as Field] = String(v);
  }
  if (suggestion.theme && suggestion.theme in themes)
    c.theme = suggestion.theme;
  if (suggestion.titleScale)
    c.titleScale = Math.max(0.65, Math.min(1.4, suggestion.titleScale));
  briefSchema.parse(c.brief);
  return { ...project, current: c, updated: now() };
}
export function checkpoint(p: Project, label: string): Project {
  const time = now();
  return {
    ...p,
    updated: time,
    current: {
      ...structuredClone(p.current),
      id: crypto.randomUUID(),
      created: time,
      label,
    },
    history: [
      { ...structuredClone(p.current), label, created: time },
      ...p.history,
    ].slice(0, 20),
  };
}
export function parseBrief(text: string): Partial<Brief> {
  const result: Partial<Brief> = {};
  const aliases: Record<string, Field> = {
    标题: "title",
    活动标题: "title",
    主题: "title",
    主讲人: "speaker",
    主办方: "speaker",
    嘉宾: "speaker",
    日期: "date",
    活动日期: "date",
    时间: "time",
    活动时间: "time",
    地点: "venue",
    活动地点: "venue",
    简介: "description",
    介绍: "description",
    活动介绍: "description",
    报名链接: "url",
    链接: "url",
    行动号召: "cta",
  };
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([^：:]{1,8})[：:]\s*(.*)$/);
    if (m && aliases[m[1]]) result[aliases[m[1]]] = m[2].trim();
  }
  if (!result.date) {
    const m = text.match(/(20\d{2})[-年/](\d{1,2})[-月/](\d{1,2})日?/);
    if (m)
      result.date = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  return result;
}
export function localSuggestion(command: string, p: Project): Suggestion {
  const s: Suggestion = {
    fields: {},
    reason: "本地规则仅调整明确支持的排版属性，保留活动内容。",
    source: "local",
  };
  if (/放大|醒目|更大/.test(command))
    s.titleScale = Math.min(1.4, p.current.titleScale + 0.15);
  if (/缩小|更小/.test(command))
    s.titleScale = Math.max(0.65, p.current.titleScale - 0.15);
  if (/自然|绿色/.test(command)) s.theme = "mint";
  else if (/学术|蓝色/.test(command)) s.theme = "blue";
  else if (/大胆|橙色/.test(command)) s.theme = "orange";
  else if (/夜|深色/.test(command)) s.theme = "night";
  else if (/人文|暖色/.test(command)) s.theme = "paper";
  else if (/未来|紫色/.test(command)) s.theme = "violet";
  if (!s.theme && !s.titleScale)
    throw Error(
      "本地支持“标题更醒目”“缩小标题”或切换风格。自由改写请连接 AI 服务。",
    );
  return s;
}
export function migrateLegacy(data: unknown): Project[] {
  if (!Array.isArray(data)) return [];
  return data.slice(0, 30).flatMap((w) => {
    try {
      const base = createProject(w.fields);
      base.current.theme =
        w.theme === "sage" ? "mint" : w.theme in themes ? w.theme : "paper";
      base.id = "legacy-" + String(w.id).slice(0, 80);
      base.current.label = "从旧版导入";
      return [projectSchema.parse(base)];
    } catch {
      return [];
    }
  });
}
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" && !quoted) {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw Error("CSV 引号未闭合");
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  const header =
    rows.shift()?.map((x) => x.trim().replace(/^\uFEFF/, "")) || [];
  if (!header.includes("title") && !header.includes("标题"))
    throw Error("CSV 需要 title 或 标题 列");
  if (rows.length > 30) throw Error("每次最多导入30个活动");
  return rows
    .filter((r) => r.some(Boolean))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] || ""])));
}
