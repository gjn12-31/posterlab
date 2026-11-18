import { z } from "zod";

export const sourcePagesSchema = z
  .array(
    z.object({
      page: z.number().int().positive(),
      text: z.string().max(20000),
    }),
  )
  .max(128);

const findingSchema = z.object({
  text: z.string(),
  refs: z.array(
    z.object({ page: z.number().int().positive(), quote: z.string() }),
  ),
});
export const readingSchema = z.object({
  provider: z.string(),
  model: z.string(),
  methodFigureId: z.string().nullable(),
  resultTableId: z.string().nullable(),
  selectionNotes: z.object({ methodFigure: z.string().optional() }).optional(),
  reading: z.object({
    problem: findingSchema,
    method: findingSchema,
    result: findingSchema,
  }),
});
export const layoutSchema = z.object({
  provider: z.string(),
  model: z.string(),
  layout: z.object({
    title: z.string(),
    subtitle: z.string(),
    composition: z.enum(["method-first", "results-first", "balanced"]),
    accent: z.enum(["cobalt", "teal", "plum"]),
    blocks: z.array(
      z.object({
        role: z.enum(["problem", "method", "result"]),
        heading: z.string(),
        text: z.string(),
      }),
    ),
    caption: z.string(),
  }),
});
export const stages = [
  "source",
  "read",
  "layout",
  "copy",
  "art",
  "compile",
] as const;
export const stageLabels = {
  source: "定位原文图表",
  read: "研读论文",
  layout: "规划版式",
  art: "准备背景",
  copy: "撰写发布稿",
  compile: "生成可编辑图层",
} as const;
export type Stage = (typeof stages)[number];
const entrySchema = z.object({
  state: z.enum(["working", "done", "failed", "skipped"]),
  detail: z.string(),
  model: z.string().optional(),
  key: z.string().optional(),
});
export type ProcessEntry = z.infer<typeof entrySchema>;
export const paperProcessSchema = z.object({
  source: z.enum(["pdf", "text"]),
  live: z.boolean(),
  stages: z.partialRecord(z.enum(stages), entrySchema),
  analysis: readingSchema.optional(),
  plan: layoutSchema.optional(),
});
export type PaperProcess = z.infer<typeof paperProcessSchema>;
export type Reading = z.infer<typeof readingSchema>["reading"];
