export const clashbenchPath = "#papers/example/clashbench";
export const clashbenchCredit =
  "Yuejin Xie、Yu Li、Dadi Guo、Qingyu Liu、Yuqian Fu、Yanwei Fu、Yujiu Yang、Xia Hu、Dongrui Liu";
export const clashbenchSource = "https://arxiv.org/abs/2609.19892";

export async function openClashbenchCase(copy: boolean) {
  const res = await fetch(
    import.meta.env.BASE_URL + "kits/clashbench-project.json",
  );
  if (!res.ok) throw Error("暂时无法打开 ClashBench 案例。");
  const { readSavedPaper } = await import("./paper-model");
  const project = readSavedPaper(await res.json());
  return { ...project, id: copy ? crypto.randomUUID() : project.id };
}
