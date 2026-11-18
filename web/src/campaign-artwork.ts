import { checkpoint, type Project } from "./model";
import { readAsset } from "./render";

export type ArtworkRequest = {
  storageKey: string;
  digest: string;
  key: string;
};

export async function prepareArtworkRequest(
  projectId: string | undefined,
  body: string,
  current: ArtworkRequest | null,
): Promise<ArtworkRequest> {
  // Before a draft is first saved it occupies the tab's single draft slot.
  const storageKey = "posterlab:campaign-artwork:" + (projectId || "draft");
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(body),
  );
  const digest = Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  if (current?.storageKey === storageKey && current.digest === digest)
    return current;
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
    if (
      saved?.digest === digest &&
      typeof saved.key === "string" &&
      /^[\w-]{8,100}$/.test(saved.key)
    )
      return { storageKey, digest, key: saved.key };
  } catch {
    /* In-memory retries still work when storage is unavailable. */
  }
  const key = crypto.randomUUID();
  try {
    sessionStorage.setItem(storageKey, JSON.stringify({ digest, key }));
  } catch {
    /* The current page retains the request until it finishes. */
  }
  return { storageKey, digest, key };
}

export function clearArtworkRequest(request: ArtworkRequest) {
  try {
    const saved = JSON.parse(
      sessionStorage.getItem(request.storageKey) || "null",
    );
    if (saved?.key === request.key)
      sessionStorage.removeItem(request.storageKey);
  } catch {
    /* The caller also clears its in-memory copy. */
  }
}

async function samplePrintPalette(blob: Blob, assetId: string) {
  const image = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, 0, 0, 32, 32);
  image.close();
  const data = ctx.getImageData(0, 0, 32, 32).data;
  const buckets = new Map<
    number,
    { count: number; rgb: number[]; score: number }
  >();
  for (let i = 0; i < data.length; i += 4) {
    const rgb = [data[i], data[i + 1], data[i + 2]];
    const chroma = Math.max(...rgb) - Math.min(...rgb);
    if (chroma < 18 || Math.max(...rgb) < 36) continue;
    const key = (rgb[0] >> 6) * 16 + (rgb[1] >> 6) * 4 + (rgb[2] >> 6);
    const bucket = buckets.get(key) ?? { count: 0, rgb: [0, 0, 0], score: 0 };
    bucket.count++;
    bucket.score += chroma;
    rgb.forEach((channel, index) => {
      bucket.rgb[index] += channel;
    });
    buckets.set(key, bucket);
  }
  const dominant = [...buckets.values()].sort((a, b) => b.score - a.score)[0];
  const rgb = dominant
    ? dominant.rgb.map((channel) => channel / dominant.count)
    : [77, 85, 89];
  const tint = (weight: number, base: number) =>
    "#" +
    rgb
      .map((channel) =>
        Math.round(channel * weight + base * (1 - weight))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("");
  return {
    assetId,
    paper: tint(0.12, 250),
    ink: tint(0.32, 15),
    signal: tint(0.85, 80),
  };
}

export async function applyCampaignArtwork(
  project: Project,
  dataUrl: string,
): Promise<Project> {
  if (Object.keys(project.assets).length >= 20)
    throw Error("当前项目已达到 20 个素材的上限。");
  if (
    !/^data:image\/(png|jpeg|webp);base64,/.test(dataUrl) ||
    dataUrl.length > 11_000_000
  )
    throw Error("模型返回的图片无法作为主视觉导入。");
  const blob = await (await fetch(dataUrl)).blob();
  const file = new File([blob], "活动主视觉", { type: blob.type });
  const asset = await readAsset(file);
  const next = checkpoint(project, "生成活动主视觉");
  next.assets = {
    ...project.assets,
    [asset.id]: { ...asset, license: "AI 生成的活动主视觉" },
  };
  next.current.heroId = asset.id;
  next.current.campaignVersion = 3;
  next.current.artworkPalette = await samplePrintPalette(blob, asset.id);
  return next;
}
