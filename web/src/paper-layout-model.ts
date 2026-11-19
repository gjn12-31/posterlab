import { z } from "zod";
import { backgroundCreditSchema } from "./background-library";

export const paperVisualSchema = z.object({
  id: z.string().min(1).max(100),
  kind: z.enum(["figure", "table"]),
  label: z.string().min(1).max(100),
  page: z.number().int().positive(),
  caption: z.string().max(1800),
  credit: z.string().min(1).max(160),
  width: z.number().positive(),
  height: z.number().positive(),
  data: z
    .string()
    .max(2400000)
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/),
});
export type PaperVisual = z.infer<typeof paperVisualSchema>;

const color = z.string().regex(/^#[\da-f]{6}$/i);
const box = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(160),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().positive().max(1),
  h: z.number().positive().max(1),
});
const text = box.extend({
  type: z.literal("text"),
  text: z.string().max(3200),
  color,
  bold: z.boolean(),
  size: z.number().min(7).max(250),
});
const image = box.extend({
  type: z.literal("image"),
  source: z.string().min(1).max(120),
});
export const posterLayoutSchema = z.object({
  origin: z.enum(["fallback", "planned"]).optional(),
  edited: z.boolean().optional(),
  language: z.literal("en").optional(),
  background: color,
  libraryBackground: z.object({
    credit: backgroundCreditSchema,
    data: z.string().max(2400000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/),
  }).optional(),
  accent: color,
  objects: z
    .array(z.discriminatedUnion("type", [text, image]))
    .min(1)
    .max(50),
});
export type PosterLayout = z.infer<typeof posterLayoutSchema>;
export type PosterObject = PosterLayout["objects"][number];
