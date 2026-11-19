import { z } from "zod";

const publicLink = z
  .string()
  .max(2048)
  .refine((value) => !value || /^https?:\/\//i.test(value));
export const backgroundCreditSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,120}$/i),
  name: z.string().min(1).max(250),
  source: z.string().min(1).max(500),
  source_title: z.string().max(500).optional(),
  source_url: publicLink,
  license: z.string().min(1).max(250),
  license_url: publicLink,
});
export type BackgroundCredit = z.infer<typeof backgroundCreditSchema>;
const catalogEntry = backgroundCreditSchema.extend({
  kind: z.literal("background"),
  tags: z.string().optional(),
  preview: z.string().regex(/^\/library\/[\w.-]+\.(?:png|jpe?g|webp)$/i),
  path: z.string().regex(/^assets\/[\w.-]+\.(?:png|jpe?g|webp)$/i),
});
export type LibraryBackground = z.infer<typeof catalogEntry>;
let catalog: Promise<LibraryBackground[]> | undefined;

export function listBackgrounds() {
  const base = import.meta.env.BASE_URL;
  catalog ??= fetch(base + "library/catalog.json")
    .then(async (response) => {
      if (!response.ok) throw Error("暂时无法加载背景图库。");
      const rows: unknown = await response.json();
      if (!Array.isArray(rows)) throw Error("背景图库格式无效。");
      return rows.flatMap((row) => {
        const parsed = catalogEntry.safeParse(row);
        return parsed.success ? [parsed.data] : [];
      });
    })
    .catch((error) => {
      catalog = undefined;
      throw error;
    });
  return catalog;
}
export function previewUrl(row: LibraryBackground) {
  return import.meta.env.BASE_URL + row.preview.slice(1);
}
export async function backgroundFile(row: LibraryBackground) {
  const file = row.path.slice("assets/".length);
  const res = await fetch(import.meta.env.BASE_URL + "library/" + file);
  if (!res.ok) throw Error("原图暂时无法加载，请重试。");
  const blob = await res.blob();
  const type = file.endsWith(".png")
    ? "image/png"
    : /\.jpe?g$/i.test(file)
      ? "image/jpeg"
      : "image/webp";
  return new File([blob], row.name, { type });
}
export const creditText = (c: BackgroundCredit) =>
  [c.name, c.source_title, c.source, c.license, c.source_url, c.license_url]
    .filter(Boolean)
    .join("\n");

export async function paperBackdrop(
  file: File,
  width: number,
  height: number,
  color: string,
) {
  const image = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1400 / Math.max(width, height));
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const cover = Math.max(
      canvas.width / image.width,
      canvas.height / image.height,
    );
    const w = image.width * cover,
      h = image.height * cover;
    ctx.globalAlpha = 0.18;
    ctx.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    return canvas.toDataURL("image/jpeg", 0.86);
  } finally {
    image.close();
  }
}
