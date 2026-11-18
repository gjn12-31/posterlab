import { z } from "zod";
import type { Format, Project } from "./model";
import { exportBlob } from "./render";
import { studioFetch } from "./studio-api";

const review = z.object({
  model: z.string().min(1),
  summary: z.string().min(1),
  priorities: z
    .array(
      z.object({
        name: z.string().min(1),
        evidence: z.string().min(1),
        suggestion: z.string().min(1),
      }),
    )
    .length(2),
});
export type CampaignReview = z.infer<typeof review>;

export async function reviewCampaign(project: Project, format: Format) {
  // Render the same file as "download", including user text positions, fonts and art.
  const bitmap = await createImageBitmap(
    await exportBlob(project, format, "png"),
  );
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const response = await studioFetch("/outreach/campaign-review", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      brief: project.current.brief,
      format,
      jpeg: canvas.toDataURL("image/jpeg", 0.83).split(",")[1],
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw Error(
      typeof data?.detail === "string" ? data.detail : "审片未完成，请重试。",
    );
  const checked = review.safeParse(data);
  if (!checked.success) throw Error("视觉模型未返回完整审片意见。");
  return checked.data;
}
