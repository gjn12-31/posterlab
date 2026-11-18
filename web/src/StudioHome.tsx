import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  FileUp,
  LayoutTemplate,
  Pause,
  Play,
} from "lucide-react";
import { CampaignNav } from "./CampaignNav";
import PublishedKits, { CasePreview } from "./PublishedKits";
import { editions, editionHref, editionImage, type Edition } from "./editions";
import "./showcase.css";

const cases = [
  {
    id: "m87",
    type: "论文传播",
    title: ["黑洞的阴影，", "如何被看见？"],
    label: "M87 黑洞观测",
    copy: "同一篇黑洞研究，在小红书怎样开场，在 X 怎样分帖？打开成品，对照四个平台的文案与配图。",
    cta: "看四个平台的成品",
    credit: "EHT Collaboration · CC BY 4.0",
    color: "#ff975e",
    kit: "paper",
  },
  {
    id: "coffee",
    type: "活动宣传",
    title: ["街区咖啡日，", "开张。"],
    label: "街区咖啡日",
    copy: "同一张活动通知，分别排成竖版海报、社交方图和横幅，再配一封可以直接转发的邀请。",
    cta: "看三种画幅",
    credit: "PosterLab · 活动设计样例",
    color: "#ffc788",
    kit: "campaign",
  },
  {
    id: "vinyl",
    type: "可编辑设计",
    title: ["午夜声场，", "正在转动。"],
    label: "午夜声场",
    copy: "用一张唱片做主视觉。在画布上拖动标题、更换照片，把这张演出海报改成你的现场。",
    cta: "打开这张画布",
    credit: "PosterLab · 黑胶声场样张",
    color: "#c1a8ff",
    kit: null,
  },
] as const;
const picks: Edition[] = [
  "afterglow",
  "bloom",
  "vinyl",
  "nature",
  "launch",
  "course",
  "coffee",
];
const base = import.meta.env.BASE_URL + "showcase/";
export default function StudioHome() {
  const [active, setActive] = useState(0),
    [running, setRunning] = useState(true),
    [pageVisible, setPageVisible] = useState(!document.hidden),
    [reduced, setReduced] = useState(false),
    [preview, setPreview] = useState<"paper" | "campaign" | null>(null);
  const rail = useRef<HTMLDivElement>(null),
    hero = useRef<HTMLElement>(null),
    gesture = useRef<number | null>(null);
  const [ends, setEnds] = useState({ left: true, right: false });
  const c = cases[active];
  useEffect(() => {
    document.title = "PosterLab · 论文与活动宣传工作室";
    window.scrollTo(0, 0);
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(mq.matches);
    change();
    mq.addEventListener("change", change);
    return () => mq.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    const update = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    if (!running || !pageVisible || reduced || preview) return;
    const t = setTimeout(() => {
      if (!document.hidden) setActive((i) => (i + 1) % cases.length);
    }, 10500);
    return () => clearTimeout(t);
  }, [running, pageVisible, reduced, active, preview]);
  useEffect(() => {
    const h = hero.current;
    if (!h || reduced) return;
    let frame = 0;
    const onScroll = () => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          h.style.setProperty(
            "--travel",
            Math.min(55, window.scrollY * 0.11) + "px",
          );
        });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      h.style.removeProperty("--travel");
    };
  }, [reduced]);
  function choose(i: number) {
    setRunning(false);
    setActive((i + cases.length) % cases.length);
  }
  function updateEnds() {
    const el = rail.current;
    if (el)
      setEnds({
        left: el.scrollLeft < 4,
        right: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4,
      });
  }
  useEffect(() => {
    if (!rail.current) return;
    const observer = new ResizeObserver(updateEnds);
    observer.observe(rail.current);
    return () => observer.disconnect();
  }, []);
  function slideRail(direction: number) {
    const el = rail.current;
    if (el)
      el.scrollBy({
        left: direction * el.clientWidth * 0.78,
        behavior: reduced ? "instant" : "smooth",
      });
  }
  return (
    <div className="campaign folio">
      <CampaignNav active="desk" />
      <main>
        <section
          ref={hero}
          className="folio-hero"
          aria-label="精选宣传案例"
          aria-roledescription="轮播"
          style={{ "--case-color": c.color } as React.CSSProperties}
          onFocusCapture={(e) => {
            if (
              e.target.matches(":focus-visible") &&
              !e.currentTarget.contains(e.relatedTarget)
            )
              setRunning(false);
          }}
          onTouchStart={(e) => {
            gesture.current = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            if (gesture.current !== null) {
              const delta = e.changedTouches[0].clientX - gesture.current;
              if (Math.abs(delta) > 80) choose(active + (delta < 0 ? 1 : -1));
              gesture.current = null;
            }
          }}
        >
          <div className="folio-plates" aria-hidden="true">
            {cases.map((v, i) => (
              <img
                key={v.id}
                className={active === i ? "is-current" : ""}
                src={base + v.id + ".webp"}
                alt=""
                fetchPriority={i === 0 ? "high" : "low"}
                draggable={false}
              />
            ))}
          </div>
          <div className="folio-veil" />
          <div className="folio-shell folio-inside">
            <div className="folio-topline">
              <span>
                <i />
                精选案例
              </span>
              <span>{c.type}</span>
            </div>
            <div key={c.id} className="folio-feature">
              <h1>
                {c.title[0]}
                <br />
                {c.title[1]}
              </h1>
              <p>{c.copy}</p>
              {c.kit ? (
                <button
                  className="folio-feature-action"
                  onClick={() => {
                    setRunning(false);
                    setPreview(c.kit);
                  }}
                >
                  {c.cta}
                  <ArrowUpRight size={18} />
                </button>
              ) : (
                <a className="folio-feature-action" href={editionHref("vinyl")}>
                  {c.cta}
                  <ArrowUpRight size={18} />
                </a>
              )}
              <a
                className="folio-same"
                href={active === 0 ? "#papers/import" : "#campaign"}
              >
                {active === 0 ? "用我的论文创作" : "用我的活动创作"}
                <ArrowRight size={16} />
              </a>
            </div>
            <div className="folio-meta">
              <span>{c.credit}</span>
              <div className="folio-controls">
                <button
                  onClick={() => choose(active - 1)}
                  aria-label="上一个案例"
                >
                  <ArrowLeft />
                </button>
                <button
                  onClick={() => choose(active + 1)}
                  aria-label="下一个案例"
                >
                  <ArrowRight />
                </button>
                {!reduced && (
                  <button
                    aria-label={running ? "暂停轮播" : "播放轮播"}
                    onClick={() => setRunning(!running)}
                  >
                    {running ? <Pause /> : <Play />}
                  </button>
                )}
              </div>
            </div>
            <div className="folio-filmstrip" aria-label="选择案例">
              {cases.map((v, i) => (
                <button
                  key={v.id}
                  aria-pressed={active === i}
                  onClick={() => choose(i)}
                >
                  <img src={base + v.id + ".webp"} alt="" />
                  <span>
                    <small>{v.type}</small>
                    <b>{v.label}</b>
                  </span>
                  <ArrowUpRight size={16} />
                </button>
              ))}
            </div>
          </div>
        </section>
        <section className="folio-start">
          <div className="folio-shell folio-startgrid">
            <div>
              <h2>开始创作</h2>
              <span>
                选择你的起点 <ArrowDown size={12} />
              </span>
            </div>
            <a href="#papers/import">
              <span className="folio-glyph">
                <FileUp />
              </span>
              <div>
                <h3>导入科研论文</h3>
                <p>PDF → 四个平台的发布文案与配图</p>
              </div>
              <ArrowUpRight />
            </a>
            <a href="#campaign">
              <span className="folio-glyph">
                <LayoutTemplate />
              </span>
              <div>
                <h3>制作活动海报</h3>
                <p>活动通知 → 三种画幅与邀请文案</p>
              </div>
              <ArrowUpRight />
            </a>
          </div>
        </section>
        <PublishedKits />
        <section className="folio-editions folio-shell">
          <div className="folio-sectionhead">
            <div>
              <span>可编辑设计</span>
              <h2>从样张进入画布</h2>
            </div>
            <div className="folio-rail-tools">
              <button
                disabled={ends.left}
                onClick={() => slideRail(-1)}
                aria-label="向前浏览样张"
              >
                <ArrowLeft />
              </button>
              <button
                disabled={ends.right}
                onClick={() => slideRail(1)}
                aria-label="向后浏览样张"
              >
                <ArrowRight />
              </button>
            </div>
          </div>
          <div className="folio-rail" ref={rail} onScroll={updateEnds}>
            {picks.map((id) => (
              <a key={id} href={editionHref(id)}>
                <div
                  className="folio-mat"
                  style={{ background: editions[id].mat }}
                >
                  <img src={editionImage(id)} alt="" loading="lazy" />
                  <em>{editions[id].wordmark}</em>
                </div>
                <div>
                  <small>{editions[id].category}</small>
                  <strong>{editions[id].name}</strong>
                  <ArrowUpRight size={17} />
                </div>
              </a>
            ))}
          </div>
          <a className="folio-all" href="#create">
            全部设计样张 <ArrowRight size={15} />
          </a>
        </section>
      </main>
      <footer className="folio-footer">
        <strong>
          PosterLab
          <ArrowDownLeft size={30} />
        </strong>
        <a href="#exhibitions">
          <BookOpen size={16} />
          浏览灵感档案 <ArrowUpRight size={14} />
        </a>
      </footer>
      {preview && <CasePreview id={preview} close={() => setPreview(null)} />}
    </div>
  );
}
