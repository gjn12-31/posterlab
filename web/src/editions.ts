import type { Theme } from "./model";

export const editionIds = ["afterglow", "bloom", "vinyl", "coffee"] as const;
export type Edition = (typeof editionIds)[number];
type ArtDirection = {
  name: string;
  category: string;
  title: string;
  wordmark: string;
  theme: Theme;
  color: string;
  mat: string;
};
export const editions: Record<Edition, ArtDirection> = {
  afterglow: {
    name: "深海微光",
    category: "数字艺术",
    title: "深海回响",
    wordmark: "Afterglow",
    theme: "violet",
    color: "#d3c7ff",
    mat: "#14162e",
  },
  bloom: {
    category: "艺术展览",
    name: "植物图鉴",
    title: "花间来信",
    wordmark: "Flora",
    theme: "paper",
    color: "#ff8253",
    mat: "#263a31",
  },
  vinyl: {
    category: "音乐现场",
    name: "黑胶声场",
    title: "午夜声场",
    wordmark: "Stereo",
    theme: "night",
    color: "#a4b8ff",
    mat: "#28244d",
  },
  coffee: {
    category: "生活市集",
    name: "暖调静物",
    title: "周末咖啡市集",
    wordmark: "Crema",
    theme: "orange",
    color: "#ffce8e",
    mat: "#663522",
  },
};
export function isEdition(value: string | null): value is Edition {
  return editionIds.includes(value as Edition);
}
export const editionImage = (id: Edition) =>
  import.meta.env.BASE_URL + "editions/" + id + ".webp";
