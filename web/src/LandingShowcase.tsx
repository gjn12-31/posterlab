import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowDown, ArrowLeftRight, ArrowRight, ArrowUpRight, BookOpenText,
  FileText, GalleryHorizontalEnd, MoveHorizontal,
} from "lucide-react";
import PosterWall from "./PosterWall";
import paperCopy from "./paper-example-copy.json";
import "./landing-showcase.css";

const assets = import.meta.env.BASE_URL + "showcase/";
const cases = {
  paper: {
    label: "论文案例",
    source: "论文 PDF",
    title: "First M87 Event Horizon Telescope Results. I. The Shadow of the Supermassive Black Hole",
    author: "Event Horizon Telescope Collaboration · 2019",
    excerpt: "We have resolved the central compact radio source as an asymmetric bright emission ring with a diameter of 42 ± 3 μas, which is circular and encompasses a central depression in brightness with a flux ratio ≳10:1.",
    poster: "gallery-paper.webp",
    posterTitle: "M87 中心的亮环有多大？",
    channel: "小红书发布稿",
    copy: paperCopy.red.split("\n\n")[1],
    suite: "小红书、X、朋友圈、公众号",
    url: "#collection/paper",
  },
  event: {
    label: "活动案例",
    source: "活动简报",
    title: "秋夜设计书展",
    author: "2026.10.24　18:00–21:00",
    excerpt: "翻阅独立设计刊物，比较不同纸张的纹理，近看裸脊线装与锁线胶装的样本。",
    poster: "gallery-bookfair.webp",
    posterTitle: "秋夜设计书展",
    channel: "活动邀请",
    copy: "秋夜翻阅独立设计刊物，比较不同纸张的纹理，近看裸脊线装与锁线胶装的样本。欢迎现场翻阅。",
    suite: "竖版海报、社交方图、横版封面",
    url: "#collection/bookfair",
  },
} as const;
type CaseKey = keyof typeof cases;

function Comparison() {
  const [selected, select] = useState<CaseKey>("paper");
  const [split, setSplit] = useState(44);
  const stage = useRef<HTMLDivElement>(null);
  const manual = useRef(false);
  const current = cases[selected];
  const paper = selected === "paper";

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    function followScroll() {
      frame = 0;
      if (manual.current || reduced.matches || !element) return;
      const { top, height } = element.getBoundingClientRect();
      if (top > innerHeight || top + height < 0) return;
      const progress = Math.min(1, Math.max(0, (innerHeight - top) / (innerHeight + height / 2)));
      setSplit(Math.round(58 - progress * 30));
    }
    function schedule() {
      if (!frame && !manual.current && !reduced.matches) frame = requestAnimationFrame(followScroll);
    }
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  function move(value: number) {
    manual.current = true;
    setSplit(value);
  }

  return (
    <section className="ls-demo" id="demo" aria-labelledby="ls-demo-title">
      <div className="pl-shell">
        <div className="ls-demo-head">
          <div>
            <h2 id="ls-demo-title">从原稿到成品</h2>
            <p>拖动分界线，对照输入的材料和最终发布稿。</p>
          </div>
          <div className="ls-demo-switch" role="group" aria-label="演示案例">
            {(Object.keys(cases) as CaseKey[]).map((key) => (
              <button key={key} type="button" aria-pressed={selected === key}
                onClick={() => { select(key); move(44); }}>
                {cases[key].label}
              </button>
            ))}
          </div>
        </div>
        <div className="ls-compare" ref={stage} style={{
          "--split": split + "%",
          "--source-shift": Math.max(0, split - 60) * .6 + "%",
          "--output-left": Math.min(45, 17 + split) + "%",
          "--output-right": Math.max(3, 17 - split * .5) + "%",
        } as CSSProperties}>
          <div className="ls-output-plane" aria-hidden={split === 100}>
            <div className="ls-print-bundle">
              <img className="ls-product-sheet" src={assets + current.poster} alt={current.posterTitle + "宣传海报"} loading="lazy" />
              <article className="ls-social">
                <div className="ls-social-channel"><BookOpenText size={15} />{current.channel}</div>
                <h3>{current.posterTitle}</h3>
                <p>{current.copy}</p>
                {!paper && <p className="ls-event-address">10.24 · 纸间书房</p>}
              </article>
            </div>
          </div>
          <div className="ls-input-plane" aria-hidden={split === 0}>
            <article className="ls-manuscript" lang={paper ? "en" : "zh-CN"}>
              <div className="ls-document-title" lang="zh-CN"><FileText size={14} />{current.source}</div>
              <h3>{current.title}</h3>
              <p className="ls-manuscript-meta">{current.author}</p>
              <h4>{paper ? "Abstract" : "活动安排"}</h4>
              <p className="ls-original">{current.excerpt}</p>
              {!paper && <p className="ls-event-address">地点　纸间书房 · 二层展厅</p>}
            </article>
          </div>
          <div className="ls-divider" aria-hidden="true"><span><ArrowLeftRight size={20} /></span></div>
          <input className="ls-range" type="range" min="0" max="100" step="1" value={split}
            onChange={(e) => move(Number(e.currentTarget.value))}
            aria-label="对照原稿和发布成品" aria-valuetext={`原稿占 ${split}%，成品占 ${100 - split}%`} />
        </div>
        <div className="ls-demo-foot">
          <div className="ls-view-mode" role="group" aria-label="对照视图">
            <button aria-pressed={split === 100} type="button" onClick={() => move(100)}>原稿</button>
            <button aria-pressed={split > 0 && split < 100} type="button" onClick={() => move(44)}><MoveHorizontal size={14} />对照</button>
            <button aria-pressed={split === 0} type="button" onClick={() => move(0)}>成品</button>
          </div>
          <div className="ls-suite">
            <span>{current.suite}</span>
            <a className="ls-more" href={current.url} aria-label={"查看完整案例：" + current.posterTitle}>查看整套成品 <ArrowUpRight size={15} /></a>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function LandingShowcase() {
  return (
    <>
      <section className="ls-intro" id="desk" aria-labelledby="ls-hero-title">
        <div className="pl-shell ls-hero-grid">
          <div className="ls-pitch">
            <h1 id="ls-hero-title">从一份原稿，<br /><em>到多平台发布。</em></h1>
            <p>上传论文，或写下活动安排。把一份材料做成适合不同平台的宣传文案与可编辑海报。</p>
            <div className="ls-hero-links">
              <a className="ls-primary" href="#workbench">进入工作台 <ArrowRight size={17} /></a>
              <a className="ls-secondary" href="#demo">看生成演示 <ArrowDown size={16} /></a>
            </div>
          </div>
          <figure className="ls-showcase">
            <div className="ls-print-stage">
              <PosterWall />
            </div>
            <figcaption><span><GalleryHorizontalEnd size={15} /> 海报选集</span><span>点击海报查看作品 <ArrowUpRight size={13} /></span></figcaption>
          </figure>
        </div>
      </section>
      <Comparison />
    </>
  );
}
