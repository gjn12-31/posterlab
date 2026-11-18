export type Crop = { x: number; y: number; w: number; h: number };
export type View = { zoom: number; x: number; y: number };
export const fullView: View = { zoom: 1, x: 0.5, y: 0.5 };
export function validCrop(value: unknown): value is Crop {
  if (!value || typeof value !== "object") return false;
  const c = value as Crop;
  return (
    [c.x, c.y, c.w, c.h].every(Number.isFinite) &&
    c.x >= 0 &&
    c.y >= 0 &&
    c.w > 0 &&
    c.h > 0 &&
    c.x + c.w <= 1.00001 &&
    c.y + c.h <= 1.00001
  );
}
export async function cropImage(url: string, crop: Crop) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const sw = crop.w * img.naturalWidth,
    sh = crop.h * img.naturalHeight;
  const scale = Math.min(1, 720 / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("浏览器无法生成局部图像");
  ctx.drawImage(
    img,
    crop.x * img.naturalWidth,
    crop.y * img.naturalHeight,
    sw,
    sh,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas.toDataURL("image/webp", 0.87);
}
