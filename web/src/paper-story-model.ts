import { z } from "zod";

// Older local drafts can still carry their author’s original cards.
const storyRoles = [
  "封面",
  "问题",
  "方法",
  "发现",
  "解读",
  "边界",
  "摘录",
] as const;
const storyCardSchema = z.object({
  id: z.string().min(1).max(100),
  role: z.enum(storyRoles),
  title: z.string().max(500),
  body: z.string().max(3000),
  // Keep the verbatim text even when the author later changes a platform's citations.
  quote: z.string().max(3000),
});
const storyLimit = 9;
export const storySchema = z.array(storyCardSchema).min(2).max(storyLimit);
