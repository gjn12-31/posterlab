import { useEffect, useState } from "react";
import type JSZip from "jszip";
const paperFormats = {
  formats: ["小红书", "X", "朋友圈", "公众号"],
  image: (f: string) => f + "/配图.png",
  copy: (f: string) => f + "/发布文案.txt",
};
const campaignFormats = {
  editable: true,
  formats: ["竖版海报", "社交方图", "横版封面"],
  image: (f: string) => f + ".png",
  copy: () => "发布文案.txt",
};
export const kits = [
  {
    id: "bookfair",
    label: "秋夜设计书展",
    title: "秋夜设计书展",
    ...campaignFormats,
  },
  {
    id: "ponder-live",
    label: "PonderLM",
    title: "把思考藏进一次预测里",
    ...paperFormats,
  },
  {
    id: "paper",
    label: "M87 黑洞观测",
    title: "M87 中心的亮环有多大？",
    ...paperFormats,
  },
  {
    id: "campaign",
    label: "街区咖啡日",
    title: "街区咖啡日",
    ...campaignFormats,
  },
];
export type PreviewFile = { url: string; text: string };
export type Kit = (typeof kits)[number];
export const kitBase = import.meta.env.BASE_URL + "kits/";
async function readKit(kit: Kit) {
  const [res, { default: JSZip }] = await Promise.all([
    fetch(kitBase + kit.id + ".zip"),
    import("jszip"),
  ]);
  if (!res.ok) throw Error("案例下载失败");
  const zip = await JSZip.loadAsync(await res.arrayBuffer());
  const files = await Promise.all(
    kit.formats.map(async (f) => {
      const [image, text] = await Promise.all([
        zip.file(kit.image(f))!.async("arraybuffer"),
        zip.file(kit.copy(f))!.async("string"),
      ]);
      return { blob: new Blob([image], { type: "image/png" }), text };
    }),
  );
  return { files, project: zip.file("project.posterlab.json") };
}

// Both the interactive workbench and gallery can show the same bundled case.
const cases = new Map<string, ReturnType<typeof readKit>>();
function sharedKit(kit: Kit) {
  let pending = cases.get(kit.id);
  if (!pending) {
    pending = readKit(kit).catch((error) => {
      cases.delete(kit.id);
      throw error;
    });
    cases.set(kit.id, pending);
  }
  return pending;
}

export function useKitFiles(kit: Kit, ready: boolean) {
  const [files, setFiles] = useState<PreviewFile[]>([]);
  const [projectFile, setProjectFile] = useState<JSZip.JSZipObject | null>(
    null,
  );
  const [error, setError] = useState("");
  const [attempt, retry] = useState(0);
  useEffect(() => {
    if (!ready) return;
    setError("");
    setFiles([]);
    setProjectFile(null);
    let active = true;
    const urls: string[] = [];
    async function load() {
      const { files: data, project } = await sharedKit(kit);
      if (!active) return;
      setProjectFile(project);
      setFiles(
        data.map(({ blob, text }) => {
          const url = URL.createObjectURL(blob);
          urls.push(url);
          return { url, text };
        }),
      );
    }
    load().catch(() => {
      if (active) setError("暂时无法读取成品。");
    });
    return () => {
      active = false;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [kit, ready, attempt]);
  return { files, projectFile, error, retry: () => retry((x) => x + 1) };
}
