import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, Check, Expand, Pencil, X } from "lucide-react";
import {
  kits,
  kitBase as base,
  useKitFiles,
  type Kit,
  type PreviewFile,
} from "./published-kits";
import type { Format } from "./model";
import "./published-gallery.css";

const galleryArt = import.meta.env.BASE_URL + "showcase/gallery-";
function KitPreview({
  kit,
  index,
  select,
  files,
  close,
}: {
  kit: Kit;
  index: number;
  select: (index: number) => void;
  files: PreviewFile[];
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current!;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog
      className="pg-dialog"
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
      <div className="pg-formats">
        {kit.formats.map((f, i) => (
          <button key={f} aria-pressed={index === i} onClick={() => select(i)}>
            {f}
          </button>
        ))}
      </div>
      {files[index] ? (
        <div className="pg-dialog-body ds-kit-body">
          <img src={files[index].url} alt={kit.formats[index] + "配图"} />
          <div>
            <h3>发布文案</h3>
            <p>{files[index].text}</p>
          </div>
        </div>
      ) : (
        <p role="status">正在读取成品…</p>
      )}
      {kit.id === "ligo" && (
        <footer className="pg-credit">上方概念图由 Seedream 生成。Figure 1 摘自 B. P. Abbott 等（LIGO / Virgo），Phys. Rev. Lett. 116, 061102 (2016)，取自原文第 2 页。{" "}
          <a href="https://doi.org/10.1103/PhysRevLett.116.061102" target="_blank" rel="noreferrer">论文原文</a> ·{" "}
          <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">CC BY 3.0</a>
        </footer>
      )}
      {kit.id === "cyanotype" && (
        <footer className="pg-credit">示例活动 · DeepSeek 策划视觉方向，Seedream 生成蓝晒主视觉。文字与日期可在画布内编辑。</footer>
      )}
      {kit.id === "bookfair" && (
        <footer className="pg-credit">
          示例活动 · DeepSeek 撰写邀请，Seedream 4.5 生成主视觉，三种画幅在
          PosterLab 内排版。
        </footer>
      )}
      {kit.id === "ponder-live" && (
        <footer className="pg-credit">
          Kimi-K3.1-Pro 撰写四个平台的初稿。方法图依据论文图 2
          重绘，署名和引文经原文校订。{" "}
          <a
            href="https://proceedings.iclr.cc/paper_files/paper/2026/hash/94572a66c6b0710c5263f15d8ef6b463-Abstract-Conference.html"
            target="_blank"
            rel="noreferrer"
          >
            ICLR 2026 会议论文
          </a>
        </footer>
      )}
      {kit.id === "paper" && (
        <footer className="pg-credit">
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
      <a
        className="pg-download"
        href={base + kit.id + ".zip"}
        download={kit.title + "-宣传材料.zip"}
      >
        <ArrowDownToLine size={16} /> 下载整套
      </a>
    </dialog>
  );
}
function Proof({ kit, ready }: { kit: Kit; ready: boolean }) {
  const [index, select] = useState(0);
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const [editError, setEditError] = useState("");
  const pending = useRef(false);
  const mounted = useRef(true);
  const { files, projectFile, error, retry } = useKitFiles(kit, ready);
  useEffect(() => {
    mounted.current = true;
    function resume(event: PageTransitionEvent) {
      if (event.persisted) {
        pending.current = false;
        setOpening(false);
      }
    }
    window.addEventListener("pageshow", resume);
    return () => {
      mounted.current = false;
      window.removeEventListener("pageshow", resume);
    };
  }, []);
  async function editCopy() {
    if (!projectFile || pending.current) return;
    pending.current = true;
    setOpening(true);
    setEditError("");
    let failure = "暂时无法打开案例项目，请重试。";
    try {
      const [raw, { importProjectCopy }, { saveProject }] = await Promise.all([
        projectFile.async("string"),
        import("./model"),
        import("./storage"),
      ]);
      if (!mounted.current) return;
      const project = importProjectCopy(raw);
      const sizes: Format[] = ["portrait", "square", "landscape"];
      project.lastFormat = sizes[index];
      failure = "保存副本失败，请检查浏览器存储空间后重试。";
      await saveProject(project);
      if (mounted.current)
        location.assign(
          "?mode=templates#open/" + project.id + "/" + project.lastFormat,
        );
    } catch {
      if (mounted.current) {
        setEditError(failure);
        setOpening(false);
        pending.current = false;
      }
    }
  }
  const item = files[index];
  return (
    <div
      id="pl-kit-details"
      className={"pg-proof pg-proof-" + kit.id}
      role="region"
      aria-label={kit.label + "成品详情"}
    >
      <div className="pg-art">
        {item ? (
          <button
            className="pg-enlarge"
            onClick={() => setOpen(true)}
            aria-label={"预览" + kit.title}
          >
            <img src={item.url} alt={kit.formats[index] + "配图"} />
            <span>
              <Expand size={16} /> 放大预览
            </span>
          </button>
        ) : (
          <div className="pg-loading" role="status">
            {!error && <img src={galleryArt + kit.id + ".webp"} alt="" />}
            {error || "正在打开可放大的成品…"}
            {error && <button onClick={retry}>重试</button>}
          </div>
        )}
      </div>
      <div className="pg-editor">
        <div className="pg-formats" role="group" aria-label="选择预览画幅">
          {kit.formats.map((f, i) => (
            <button
              key={f}
              aria-pressed={index === i}
              onClick={() => select(i)}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="pg-copy">
          <h3>{kit.title}</h3>
          {item && (
            <p>
              {item.text.startsWith(kit.title + "\n")
                ? item.text.slice(kit.title.length + 1)
                : item.text}
            </p>
          )}
        </div>
        <div className="pg-actions">
          {"editable" in kit && (
            <button
              className="pg-edit"
              disabled={!projectFile || opening}
              onClick={editCopy}
            >
              <Pencil size={15} /> {opening ? "正在打开画布…" : "编辑这套海报"}
            </button>
          )}
          <button disabled={!item} onClick={() => setOpen(true)}>
            查看完整文案
          </button>
          <a
            href={base + kit.id + ".zip"}
            download={kit.title + "-宣传材料.zip"}
            aria-label={"下载" + kit.title + "示例 ZIP"}
          >
            <ArrowDownToLine size={15} /> 下载整套
          </a>
        </div>
        {editError && <p role="alert">{editError}</p>}
        {"editable" in kit && item && !projectFile && (
          <p role="alert">
            套装中缺少可编辑项目。<button onClick={retry}>重新读取</button>
          </p>
        )}
        {kit.id === "paper" && (
          <small className="pg-credit">
            图像由 EHT Collaboration 提供 ·{" "}
            <a
              href="https://www.eso.org/public/images/eso1907a/"
              target="_blank"
              rel="noreferrer"
            >
              CC BY 4.0
            </a>
          </small>
        )}
      </div>
      {open && (
        <KitPreview
          kit={kit}
          index={index}
          select={select}
          files={files}
          close={() => setOpen(false)}
        />
      )}
    </div>
  );
}
function gallerySelection() {
  if (location.hash === "#collection") return 0;
  return kits.findIndex((kit) => location.hash === "#collection/" + kit.id);
}
export default function PublishedKits() {
  const [selected, setSelected] = useState(() =>
    Math.max(0, gallerySelection()),
  );
  useEffect(() => {
    const selectFromUrl = () => {
      const index = gallerySelection();
      if (index >= 0) setSelected(index);
    };
    window.addEventListener("hashchange", selectFromUrl);
    return () => window.removeEventListener("hashchange", selectFromUrl);
  }, []);
  const [ready, setReady] = useState(false);
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setReady(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(section.current!);
    return () => observer.disconnect();
  }, []);
  return (
    <section
      ref={section}
      id="collection"
      className="pg-gallery pl-shell"
      aria-labelledby="pl-collection-title"
    >
      <h2 id="pl-collection-title" tabIndex={-1}>
        作品选集
      </h2>
      <div className="pg-cards" role="group" aria-label="选择成品案例">
        {kits.map((kit, i) => (
          <button
            type="button"
            key={kit.id}
            className="pg-card"
            aria-label={kit.label}
            aria-controls="pl-kit-details"
            aria-pressed={i === selected}
            onClick={() => {
              setSelected(i);
              history.replaceState(history.state, "", "#collection/" + kit.id);
              const details = document.getElementById("pl-kit-details");
              details?.scrollIntoView({
                block: "nearest",
                behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                  ? "instant"
                  : "smooth",
              });
            }}
          >
            <span className="pg-cover">
              <img
                src={galleryArt + kit.id + ".webp"}
                width={600}
                height={800}
                alt=""
                loading="lazy"
                decoding="async"
              />
              {selected === i && (
                <span className="pg-selected" aria-hidden="true">
                  <Check size={15} />
                </span>
              )}
            </span>
            <span className="pg-label">{kit.label}</span>
            <span className="pg-meta">
              {"editable" in kit
                ? "活动宣传 · 3 种画幅"
                : "论文宣传 · 4 个平台"}
            </span>
          </button>
        ))}
      </div>
      <Proof key={kits[selected].id} kit={kits[selected]} ready={ready} />
    </section>
  );
}
