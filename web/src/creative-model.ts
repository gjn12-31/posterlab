import { z } from "zod";
export type Asset = {
  id: string;
  name: string;
  kind: "icon" | "background";
  tags: string;
  tone?: string;
  source: string;
  source_url: string;
  license: string;
  license_url: string;
  preview: string;
};
export type Brand = {
  name: string;
  color: string;
  voice: string;
  audience: string;
  enabled: boolean;
};
export const emptyBrand: Brand = {
  name: "",
  color: "",
  voice: "",
  audience: "",
  enabled: false,
};
export const scenes = [
  {
    id: "coffee",
    name: "咖啡与市集",
    tag: "生活方式",
    title: "慢一点，喝杯咖啡",
    line: "WEEKEND / MARKET",
    style: "paper",
    color: "#d98957",
    background: "paper",
    direction: "暖色纸张质感、大字号编辑排版、轻松自然、有呼吸感",
    fields: ["日期", "地点", "亮点", "行动号召"],
  },
  {
    id: "music",
    name: "音乐与演出",
    tag: "文化活动",
    title: "今晚，让声音发光",
    line: "AFTER / HOURS",
    style: "night",
    color: "#a9f679",
    background: "noir",
    direction: "深色舞台、酸性绿光、强烈字体层级、富有节奏的构图",
    fields: ["日期", "时间", "地点", "演出阵容"],
  },
  {
    id: "launch",
    name: "新品与促销",
    tag: "品牌营销",
    title: "新鲜事，正式登场",
    line: "THE / NEW EDIT",
    style: "orange",
    color: "#ff744f",
    background: "coral",
    direction: "大胆撞色、大标题、清晰产品卖点与行动号召，不添加未提供的折扣",
    fields: ["产品名称", "卖点", "价格", "行动号召"],
  },
  {
    id: "exhibit",
    name: "展览与艺术",
    tag: "艺术策展",
    title: "看见，另一种可能",
    line: "NEW / PERSPECTIVE",
    style: "blue",
    color: "#5363f5",
    background: "cobalt",
    direction: "瑞士网格、实验性字体排版、抽象几何、信息清晰而有艺术张力",
    fields: ["日期", "地点", "主办方", "简介"],
  },
  {
    id: "course",
    name: "课程与分享",
    tag: "教育成长",
    title: "把好奇，变成能力",
    line: "LEARN / SOMETHING",
    style: "violet",
    color: "#a18cf7",
    background: "aurora",
    direction: "通透未来光场、简洁知识结构、明确主题与报名入口",
    fields: ["讲师", "日期", "地点", "行动号召"],
  },
  {
    id: "nature",
    name: "户外与公益",
    tag: "自然人文",
    title: "走进绿色的周末",
    line: "BACK / TO NATURE",
    style: "mint",
    color: "#95b39c",
    background: "botanical",
    direction: "柔和植物色、自然有机形状、宽松留白、温暖有人情味",
    fields: ["日期", "集合地点", "活动内容", "行动号召"],
  },
];
export const refinementDimensions = [
  {
    label: "构图布局",
    choices: ["居中聚焦", "左对齐网格", "非对称构图", "上下分区"],
  },
  {
    label: "留白间距",
    choices: ["整体间距更大", "四周安全边距更宽", "信息更紧凑", "增加行距"],
  },
  {
    label: "信息层级",
    choices: ["放大主标题", "突出日期地点", "弱化次要信息", "突出行动号召"],
  },
  {
    label: "字体气质",
    choices: ["干净现代", "杂志编辑感", "粗体有力量", "轻盈精致"],
  },
  {
    label: "配色色系",
    choices: [
      "蓝紫冷色",
      "橙红暖色",
      "自然绿色",
      "黑白极简",
      "奶油低饱和",
      "霓虹高对比",
    ],
  },
  {
    label: "背景表现",
    choices: ["更干净", "柔和渐变", "纸张质感", "增强空间层次"],
  },
  {
    label: "图形装饰",
    choices: ["减少装饰", "更多几何图形", "细线条点缀", "增强视觉焦点"],
  },
  {
    label: "阅读体验",
    choices: ["提高文字对比度", "小字更大", "适合手机阅读", "避免过多字体变化"],
  },
  {
    label: "情绪氛围",
    choices: ["高级克制", "活泼年轻", "温暖亲切", "科技未来"],
  },
];
export function scenePrompt(
  scene: (typeof scenes)[number],
  fields: Record<string, string>,
  direction: string,
) {
  return (
    `请生成一张${scene.name}海报。\n` +
    Object.entries(fields)
      .filter(([, v]) => v.trim())
      .map(([k, v]) => `${k}：${v.trim()}`)
      .join("\n") +
    `\n视觉方向：${direction}\n只使用我填写的事实，未填写的信息省略，不编造时间、价格或联系方式。`
  );
}
export function refinePrompt(
  values: Record<string, string>,
  note: string,
  format: string,
  mode: "polish" | "redesign" | "reimagine" = "redesign",
) {
  const lines = Object.entries(values)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}：${v}`);
  if (format) lines.push("画布尺寸：" + format);
  if (note.trim()) lines.push("补充意见：" + note.trim());
  if (!lines.length) return "";
  return (
    "请在当前画布版本上生成一个优化版本。\n修改幅度：" +
    {
      polish: "精细调整，只改指定细节",
      redesign: "明显改版，允许重构布局、字体、主视觉与配色，不要只微调数值",
      reimagine: "全新方案，保留事实，重新设计艺术方向和构图，不沿用旧版结构",
    }[mode] +
    "\n" +
    lines.join("\n") +
    "\n保留未明确要求修改的标题、日期、地点、价格、联系方式和其他事实；保留原版供对比。"
  );
}
export function brandContext(brand: Brand) {
  if (!brand.enabled) return "";
  const values = [
    ["品牌", brand.name],
    ["品牌色", brand.color],
    ["语气", brand.voice],
    ["受众", brand.audience],
  ].filter(([, v]) => v.trim());
  return values.length
    ? "\n\n品牌偏好（本次明确要求优先）：\n" +
        values.map(([k, v]) => `${k}：${v}`).join("\n")
    : "";
}
export function toggleAsset(ids: string[], asset: Asset, assets: Asset[]) {
  if (ids.includes(asset.id)) return ids.filter((id) => id !== asset.id);
  const next =
    asset.kind === "background"
      ? ids.filter(
          (id) => assets.find((a) => a.id === id)?.kind !== "background",
        )
      : [...ids];
  if (next.length >= 6)
    throw Error("最多选择 6 项素材（含 1 张背景），请先取消一项。");
  return [...next, asset.id];
}
const turnSchema = z.object({
  id: z.string().max(120),
  role: z.enum(["user", "assistant"]),
  content: z.string().max(12000),
  jobId: z
    .string()
    .regex(/^[a-f0-9]{32}$/)
    .optional(),
});
const conversationSchema = z.object({
  id: z.string().max(120),
  title: z.string().max(200),
  created: z.string().datetime({ offset: true }),
  updated: z.string().datetime({ offset: true }),
  messages: z.array(turnSchema).max(10000),
});
export function parseBackup(text: string) {
  if (text.length > 10_000_000) throw Error("备份不能超过 10 MB。");
  return z
    .object({
      version: z.literal(1),
      conversations: z.array(conversationSchema).max(3000),
    })
    .parse(JSON.parse(text)).conversations;
}
