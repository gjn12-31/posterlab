import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, Expand, X } from "lucide-react";
const kits = [
  {
    id: "paper",
    title: "M87 中心的亮环有多大？",
    detail: "论文宣传 · 四个平台的配图与文案",
    formats: ["小红书", "X", "朋友圈", "公众号"],
    image: (f: string) => f + "/配图.png",
    copy: (f: string) => f + "/发布文案.txt",
  },
  {
    id: "campaign",
    title: "街区咖啡日",
    detail: "活动宣传 · 三种画幅与邀请文案",
    formats: ["竖版海报", "社交方图", "横版封面"],
    image: (f: string) => f + ".png",
    copy: () => "发布文案.txt",
  },
];
type Kit = (typeof kits)[number];
const base = import.meta.env.BASE_URL + "kits/";
function KitPreview({ kit, close }: { kit: Kit; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, select] = useState(0),
    [error, setError] = useState(""),
    [files, setFiles] = useState<{ url: string; text: string }[]>([]);
  useEffect(() => {
    const el = dialog.current!;
    el.showModal();
    return () => el.close();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const urls: string[] = [];
    async function load() {
      const [res, { default: JSZip }] = await Promise.all([
        fetch(base + kit.id + ".zip", { signal: controller.signal }),
        import("jszip"),
      ]);
      if (!res.ok) throw Error();
      const zip = await JSZip.loadAsync(await res.arrayBuffer());
      const data = await Promise.all(
        kit.formats.map(async (f) => {
          const [image, text] = await Promise.all([
            zip.file(kit.image(f))!.async("uint8array"),
            zip.file(kit.copy(f))!.async("string"),
          ]);
          return {
            blob: new Blob([new Uint8Array(image)], { type: "image/png" }),
            text,
          };
        }),
      );
      if (controller.signal.aborted) return;
      setFiles(
        data.map(({ blob, text }) => {
          const url = URL.createObjectURL(blob);
          urls.push(url);
          return { url, text };
        }),
      );
    }
    load().catch(() => {
      if (!controller.signal.aborted)
        setError("样例暂时无法打开，请关闭后重试。");
    });
    return () => {
      controller.abort();
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [kit]);
  return (
    <dialog
      className="ds-kit-dialog"
      aria-label={kit.title}
      ref={dialog}
      onCancel={close}
    >
      <header>
        <h2>{kit.title}</h2>
        <button onClick={close} aria-label="关闭成品预览">
          <X />
        </button>
      </header>
      <div className="ds-kit-formats">
        {kit.formats.map((f, i) => (
          <button key={f} aria-pressed={index === i} onClick={() => select(i)}>
            {f}
          </button>
        ))}
      </div>
      {files[index] ? (
        <div className="ds-kit-body">
          <img src={files[index].url} alt={kit.formats[index] + "配图"} />
          <div>
            <h3>发布文案</h3>
            <p>{files[index].text}</p>
          </div>
        </div>
      ) : (
        <p role="status">{error || "正在读取成品…"}</p>
      )}
      {kit.id === "paper" && (
        <footer className="ds-kit-credit">
          本文案经原句校订。图像由 EHT Collaboration 提供，配图经过裁切。{" "}
          <a
            href="https://www.eso.org/public/images/eso1907a/"
            target="_blank"
            rel="noreferrer"
          >
            图像出处
          </a>{" "}
          ·{" "}
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noreferrer"
          >
            CC BY 4.0
          </a>
        </footer>
      )}
    </dialog>
  );
}
export default function PublishedKits() {
  const [preview, setPreview] = useState<Kit | null>(null);
  return (
    <section className="ds-gallery ds-kit-section">
      <div className="ds-gallery-head">
        <h2>看看发布成品</h2>
      </div>
      <div className="ds-kits">
        {kits.map((k) => (
          <article key={k.id}>
            <button
              className="ds-kit-pic"
              onClick={() => setPreview(k)}
              aria-label={"预览" + k.title}
            >
              <img src={base + k.id + ".webp"} loading="lazy" alt="" />
              <span>
                <Expand size={14} /> 预览成品
              </span>
            </button>
            <div className="ds-kit-caption">
              <div>
                <small>{k.detail}</small>
                <h3>{k.title}</h3>
              </div>
              <a
                href={base + k.id + ".zip"}
                download={k.title + "-宣传材料.zip"}
                aria-label={"下载" + k.title + "示例 ZIP"}
              >
                <ArrowDownToLine size={16} /> 示例 ZIP
              </a>
            </div>
          </article>
        ))}
      </div>
      {preview && <KitPreview kit={preview} close={() => setPreview(null)} />}
    </section>
  );
}
