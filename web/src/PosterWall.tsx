import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  X,
} from "lucide-react";
import { editionHref } from "./editions";

const base = import.meta.env.BASE_URL + "showcase/";
const posters = [
  {
    image: "gallery-clashbench",
    title: "ClashBench · 共享资源冲突评测",
    kind: "论文宣传",
    href: "#collection/clashbench",
    credit: "Yuejin Xie 等 · 原论文图表裁取 · CC BY 4.0",
    source: "https://arxiv.org/abs/2609.19892",
  },
  {
    image: "gallery-bookfair",
    title: "秋夜设计书展",
    kind: "活动宣传",
    href: "#collection/bookfair",
  },
  {
    image: "vinyl",
    title: "黑胶唱片夜",
    kind: "音乐活动",
    href: editionHref("vinyl"),
  },
  {
    image: "gallery-cyanotype",
    title: "晒出一片海 · 蓝晒工作坊",
    kind: "活动宣传",
    href: "#collection/cyanotype",
  },
  {
    image: "wall-launch",
    title: "新作发布",
    kind: "新品发布",
    href: editionHref("launch"),
  },
  {
    image: "wall-nature",
    title: "山野观察日",
    kind: "户外活动",
    href: editionHref("nature"),
  },
  {
    image: "gallery-campaign",
    title: "街区咖啡日",
    kind: "活动宣传",
    href: "#collection/campaign",
  },
];

function WallPreview({
  index,
  change,
  close,
}: {
  index: number;
  change: (n: number) => void;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const poster = posters[index];
  const previous = () => change((index + posters.length - 1) % posters.length);
  const next = () => change((index + 1) % posters.length);
  useEffect(() => {
    const el = dialog.current!;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="wall-dialog"
      aria-labelledby="wall-title"
      onCancel={close}
      onClick={(e) => {
        if (e.target === dialog.current) close();
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          previous();
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          next();
        }
      }}
    >
      <div className="wall-dialog-sheet">
        <button
          type="button"
          className="wall-close"
          aria-label="关闭海报预览"
          onClick={close}
          autoFocus
        >
          <X size={20} />
        </button>
        <div className="wall-lightbox">
          <img
            src={base + poster.image + ".webp"}
            alt={poster.title + "海报"}
          />
        </div>
        <div className="wall-info">
          <div>
            <small>{poster.kind}</small>
            <h2 id="wall-title">{poster.title}</h2>
            {poster.credit && (
              <a
                className="wall-credit"
                href={poster.source}
                target="_blank"
                rel="noreferrer"
              >
                {poster.credit}
              </a>
            )}
          </div>
          <a
            className="wall-open"
            href={poster.href}
            onClick={() => {
              close();
              if (poster.href.startsWith("#collection/"))
                requestAnimationFrame(() => {
                  document
                    .getElementById("collection")
                    ?.scrollIntoView({ behavior: "instant" });
                  document
                    .getElementById("pl-collection-title")
                    ?.focus({ preventScroll: true });
                });
            }}
          >
            {poster.href.startsWith("#") ? "查看宣传套装" : "使用这张样稿"}{" "}
            <ArrowUpRight size={16} />
          </a>
        </div>
        <div className="wall-paging">
          <button type="button" aria-label="上一张海报" onClick={previous}>
            <ChevronLeft size={18} />
          </button>
          <span>
            {index + 1} / {posters.length}
          </span>
          <button type="button" aria-label="下一张海报" onClick={next}>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </dialog>
  );
}

export default function PosterWall() {
  const [open, setOpen] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  return (
    <>
      <div
        className="pl-visual"
        data-paused={paused || open !== null}
        role="group"
        aria-label="宣传作品海报墙"
      >
        {posters.map((p, i) => (
          <div className={"wall-mount wall-mount-" + i} key={p.image}>
            <button
              type="button"
              aria-label={"欣赏海报：" + p.title}
              onClick={() => setOpen(i)}
            >
              <img
                src={base + p.image + ".webp"}
                width={600}
                height={800}
                alt=""
                draggable={false}
                fetchPriority={i === 3 ? "high" : undefined}
              />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="wall-motion"
          aria-label={paused ? "播放海报浮动" : "暂停海报浮动"}
          title={paused ? "播放海报浮动" : "暂停海报浮动"}
          onClick={() => setPaused((p) => !p)}
        >
          {paused ? <Play size={14} /> : <Pause size={14} />}
        </button>
      </div>
      {open !== null && (
        <WallPreview
          index={open}
          change={setOpen}
          close={() => setOpen(null)}
        />
      )}
    </>
  );
}
