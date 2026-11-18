import { studioFetch } from "./studio-api";
import type { Paper } from "./paper-model";

type ArtworkResult = Pick<
  Paper,
  "artwork" | "artworkNotice" | "artworkRetryKey"
>;

export async function generatePaperArtwork(
  paper: Paper,
  key: string,
): Promise<ArtworkResult> {
  try {
    const response = await studioFetch("/outreach/paper-artwork", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify({
        title: paper.title,
        abstract: (
          paper.sections?.abstract ||
          paper.sections?.introduction ||
          paper.body
        ).slice(0, 3500),
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data)
      return {
        artworkNotice:
          typeof data?.detail === "string"
            ? data.detail.slice(0, 700)
            : "图像服务暂时无法返回主视觉。",
        artworkRetryKey:
          response.headers.get("X-PosterLab-Reusable") === "1"
            ? key
            : undefined,
      };
    if (
      typeof data.data_url !== "string" ||
      !data.data_url.startsWith("data:image/webp;base64,") ||
      data.data_url.length > 11_000_000 ||
      typeof data.model !== "string" ||
      !data.model
    )
      throw Error("图像服务返回的图片无法读取。");
    return {
      artwork: { data: data.data_url, model: data.model },
      artworkNotice: undefined,
      artworkRetryKey: undefined,
    };
  } catch (error) {
    return {
      artworkNotice: (error instanceof Error
        ? error.message
        : "主视觉未能载入。"
      ).slice(0, 700),
      artworkRetryKey: key,
    };
  }
}
