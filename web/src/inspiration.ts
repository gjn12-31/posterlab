export type Inspiration = {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  colors: string[];
  designer: string;
  direction: string;
};
export const inspirations: Inspiration[] = [
  {
    id: "grand_tour",
    title: "星际漫游",
    subtitle: "The Grand Tour",
    category: "复古未来",
    colors: ["#e85d42", "#eeb667", "#123f43"],
    designer: "Invisible Creature",
    direction:
      "复古未来主义旅行海报，用层叠的几何轨道和行星组织构图，深青绿、珊瑚橙与米黄色形成高对比；标题醒目，画面有强烈的远行感。",
  },
  {
    id: "venus",
    title: "云端漫步",
    subtitle: "Venus",
    category: "柔和梦境",
    colors: ["#e8b298", "#f6eee0", "#a6b1b0"],
    designer: "Jessie Kawata · Lois Kim",
    direction:
      "柔和梦境般的旅行海报，以奶油白、浅杏色和银灰色为主，云层叠出纵深，几何建筑悬浮其中，标题使用舒展且富有个性的字体。",
  },
  {
    id: "mars",
    title: "下一站，火星",
    subtitle: "Mars",
    category: "复古未来",
    colors: ["#bc503f", "#d6a35e", "#173342"],
    designer: "Invisible Creature",
    direction:
      "复古探险海报，用赭红山体、深色剪影和温暖金色强调宏大的空间尺度，使用清楚的前中后景、醒目大标题及精炼信息。",
  },
  {
    id: "jupiter",
    title: "风暴之上",
    subtitle: "Jupiter",
    category: "大胆撞色",
    colors: ["#ed7436", "#452a60", "#e5bf8b"],
    designer: "Stefan Bucher · Ron Miller",
    direction:
      "大胆的科幻海报，以橙色、紫色和深黑色形成张力，流动的巨大旋涡成为主视觉，字体与动态曲线共同构成富有冲击力的版面。",
  },
  {
    id: "kepler186f",
    title: "另一种春天",
    subtitle: "Kepler-186f",
    category: "自然叙事",
    colors: ["#b94233", "#326768", "#edcb93"],
    designer: "Joby Harris",
    direction:
      "富有想象力的自然叙事海报，红色植物、青绿色天空与奶油色信息形成反差，使用简化的平面插画、富有层次的远景和复古标题。",
  },
  {
    id: "titan",
    title: "远方的湖泊",
    subtitle: "Titan",
    category: "自然叙事",
    colors: ["#e2b449", "#674633", "#254d54"],
    designer: "Joby Harris",
    direction:
      "旅行探索风格，金黄天空与深青色湖泊形成鲜明层次，剪影和倒影带出宁静且陌生的风景，标题简洁有力，保留清晰的信息区域。",
  },
];
export const inspirationImage = (id: string) =>
  `${import.meta.env.BASE_URL}inspiration/${id}.webp`;
export function inspirationPrompt(item: Inspiration) {
  return `请设计一张原创海报。\n主题：【填写你的主题】\n标题：【填写标题】\n时间与地点：【按需填写】\n视觉方向：${item.direction}\n这是文字描述的风格参考，请根据我的主题重新创作构图、插画和文字，不复制参考海报的标题、标志或具体画面。未提供的信息请先询问。`;
}
export const JPL_SOURCE =
  "https://www.jpl.nasa.gov/galleries/visions-of-the-future/";
