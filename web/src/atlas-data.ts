import { museumObjects } from "./archive-objects";
import { inspirations, inspirationImage, JPL_SOURCE } from "./inspiration";

export type Artwork = {
  id: string;
  title: string;
  originalTitle: string;
  artist: string;
  year: string;
  medium: string;
  collection: string;
  sourceUrl: string;
  rightsUrl: string;
  colors: readonly string[];
  note: string;
  image: string;
  thumb: string;
  group: string;
  rights: string;
  focal?: string;
};
const base = import.meta.env.BASE_URL;
export const museum: Artwork[] = museumObjects.map((item) => ({
  ...item,
  image: base + "archive/" + item.id + ".webp",
  thumb: base + "archive/" + item.id + "-thumb.webp",
  group: "艺术馆藏",
  rights: "公共领域 / CC0 · 馆方开放政策",
}));
export const space: Artwork[] = inspirations.map((item) => ({
  id: item.id,
  title: item.title,
  originalTitle: item.subtitle,
  artist: item.designer,
  year: "Visions of the Future",
  medium: "旅行海报",
  collection: "NASA / JPL-Caltech",
  sourceUrl: JPL_SOURCE,
  rightsUrl: "https://www.jpl.nasa.gov/jpl-image-use-policy/",
  colors: item.colors,
  note: item.direction,
  image: inspirationImage(item.id),
  thumb: inspirationImage(item.id),
  group: "太空海报",
  rights: "NASA/JPL 图像使用说明",
}));
export const works = [...museum, ...space];
export const findWork = (id?: string) => works.find((w) => w.id === id);
export type Exhibition = {
  id: string;
  number: string;
  title: string;
  lines: string[];
  english: string;
  theme: string;
  intro: string;
  works: Artwork[];
  focal?: string;
};
export const workLink = (work: Artwork) => "#work/" + work.id;
export const compareLink = (a: Artwork, b: Artwork) =>
  "#compare/" + a.id + "/" + b.id;
