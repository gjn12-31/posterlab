import type { Format, Theme } from "./model";

export const editionIds = [
  "afterglow",
  "bloom",
  "vinyl",
  "coffee",
  "launch",
  "course",
  "nature",
] as const;
export type Edition = (typeof editionIds)[number];
type ArtDirection = {
  name: string;
  category: string;
  title: string;
  wordmark: string;
  theme: Theme;
  color: string;
  mat: string;
  print?: {
    ink: string;
    credit: string;
    portraitY: number;
    landscapeY: number;
    face: "sans" | "serif";
  };
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
  launch: {
    category: "新品发布",
    name: "折面研究",
    title: "新作发布",
    wordmark: "Fold",
    theme: "orange",
    color: "#28221e",
    mat: "#f35334",
    print: {
      ink: "#28221e",
      credit: "#28221e",
      portraitY: 0.57,
      landscapeY: 0.57,
      face: "sans",
    },
  },
  course: {
    category: "课程讲座",
    name: "间奏讲堂",
    title: "看见设计的节奏",
    wordmark: "Interval",
    theme: "blue",
    color: "#f9efb5",
    mat: "#063c9e",
    print: {
      ink: "#fbf9eb",
      credit: "#172740",
      portraitY: 0.54,
      landscapeY: 0.54,
      face: "sans",
    },
  },
  nature: {
    category: "户外公益",
    name: "山野手记",
    title: "山野观察日",
    wordmark: "Field Notes",
    theme: "mint",
    color: "#efe3ad",
    mat: "#29513c",
    print: {
      ink: "#fff9e9",
      credit: "#314d3a",
      portraitY: 0.67,
      landscapeY: 0.64,
      face: "serif",
    },
  },
};
export function editionHref(
  id: Edition,
  format: Format = "portrait",
  title?: string,
) {
  const params = new URLSearchParams({ edition: id, format });
  if (title?.trim()) params.set("title", title.trim());
  return import.meta.env.BASE_URL + "?mode=templates#new?" + params;
}
export function isEdition(value: string | null): value is Edition {
  return editionIds.includes(value as Edition);
}
export const editionImage = (id: Edition) =>
  import.meta.env.BASE_URL + "editions/" + id + ".webp";
