import type { Theme } from "./model";

export const editionIds = ["bloom", "vinyl", "coffee"] as const;
export type Edition = (typeof editionIds)[number];
type ArtDirection = {
  name: string;
  title: string;
  wordmark: string;
  theme: Theme;
  color: string;
  mat: string;
};
export const editions: Record<Edition, ArtDirection> = {
  bloom: {
    name: "植物图鉴",
    title: "花间来信",
    wordmark: "Flora",
    theme: "paper",
    color: "#ff8253",
    mat: "#263a31",
  },
  vinyl: {
    name: "黑胶声场",
    title: "午夜声场",
    wordmark: "Stereo",
    theme: "night",
    color: "#a4b8ff",
    mat: "#28244d",
  },
  coffee: {
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
