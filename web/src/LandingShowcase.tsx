import { useEffect, useState, type CSSProperties } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  FileText,
  Image as ImageIcon,
  Pause,
  Play,
  RotateCcw,
  ScanText,
} from "lucide-react";
import PosterWall from "./PosterWall";
import { clashbenchPath } from "./clashbench-case";
import { kits, useKitFiles } from "./published-kits";
import { useDemoPlayback } from "./useDemoPlayback";
import "./landing-showcase.css";

const base = import.meta.env.BASE_URL;
const cases = {
  paper: {
    label: "论文案例",
    kit: "clashbench",
    source: "论文 PDF",
    title: "ClashBench: Conflicts Leading Agents to Seize and Harm",
    byline: "Yuejin Xie et al. · arXiv:2609.19892",
    excerpt:
      "As agent systems become more widely used, multiple agent sessions increasingly run alongside pre-existing user tasks in the same environment, sharing resources with limited capacity or mutually exclusive states.",
    headline: "ClashBench 原论文方法图与实验表",
    formats: ["小红书", "X", "公众号"],
    steps: ["读取论文", "选取证据", "排版配图", "四平台成稿"],
    captions: [
      "从摘要、引言和原始图表开始。",
      "分别检查新任务是否完成、旧任务是否健康。",
      "把原文中的对照保留在宣传图里。",
      "同一项发现，分别写给四个平台的读者。",
    ],
    preview: "gallery-clashbench",
    link: "#collection/clashbench",
  },
  event: {
    label: "活动案例",
    kit: "bookfair",
    source: "活动通知",
    title: "秋夜设计书展",
    byline: "2026.10.24　18:00–21:00",
    excerpt:
      "翻阅独立设计刊物，比较不同纸张的纹理，近看裸脊线装与锁线胶装的样本。",
    headline: "秋夜设计书展",
    formats: ["竖版海报", "社交方图", "横版封面"],
    steps: ["导入通知", "确认安排", "设计主视觉", "三画幅出图"],
    captions: [
      "一份包含时间、地点和活动内容的通知。",
      "从通知里提取海报必须带上的信息。",
      "用书页与装订纹理表现现场主题。",
      "分别适配群聊、社交动态与活动页。",
    ],
    preview: "gallery-bookfair",
    link: "#collection/bookfair",
  },
} as const;
type CaseKey = keyof typeof cases;
const icons = [FileText, ScanText, ImageIcon, Check];

function DemoFilm({ selected }: { selected: CaseKey }) {
  const current = cases[selected];
  const paper = selected === "paper";
  const { viewport, index, cycle, playing, running, select, toggle, replay } =
    useDemoPlayback(4, 4200);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!viewport.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setReady(true);
          obs.disconnect();
        }
      },
      { rootMargin: "160px" },
    );
    obs.observe(viewport.current);
    return () => obs.disconnect();
  }, [viewport]);
  const { files, error, retry } = useKitFiles(
    kits.find((kit) => kit.id === current.kit)!,
    ready,
  );
  const [figure, setFigure] = useState("");
  useEffect(() => {
    if (!ready || !paper) return;
    const controller = new AbortController();
    fetch(base + "kits/clashbench-project.json", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((project) => {
        const image = project?.visuals?.find(
          (v: { label: string }) => v.label === "Figure 2",
        )?.data;
        if (typeof image === "string" && image.startsWith("data:image/"))
          setFigure(image);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [ready, paper]);
  const cover = base + "showcase/" + current.preview + ".webp";
  const images = paper ? [0, 1, 3] : [0, 1, 2];
  return (
    <div
      className={"ls-film ls-film-" + selected}
      ref={viewport}
      data-running={running}
    >
      <div className="film-screen">
        <div className="film-caption" key={selected + "-copy-" + index}>
          <span className="film-time">
            <i /> {String(index + 1).padStart(2, "0")} / 04
          </span>
          <h3>{current.steps[index]}</h3>
          <p>{paper && index === 3 && files[0]?.text
            ? files[0].text.split("\n", 1)[0]
            : current.captions[index]}</p>
          <a href={current.link}>
            查看整套成品 <ArrowUpRight size={15} />
          </a>
        </div>
        <div
          className="film-art"
          key={selected + index + "-" + cycle}
          data-step={index}
        >
          {index === 0 ? (
            <article className="film-page">
              <small>
                {paper ? <FileText size={14} /> : <CalendarDays size={14} />}{" "}
                {current.source}
              </small>
              <h4 lang={paper ? "en" : "zh-CN"}>{current.title}</h4>
              <span>{current.byline}</span>
              <b>{paper ? "Abstract" : "活动安排"}</b>
              <p>{current.excerpt}</p>
              {!paper && <p>纸间书房 · 二层展厅</p>}
            </article>
          ) : index === 1 ? (
            <article className="film-evidence">
              <small>
                <ScanText size={15} />
                {paper ? "Figure 2 · 第 4 页" : "秋夜设计书展 · 已核对"}
              </small>
              {paper && figure ? (
                <img src={figure} alt="ClashBench 原论文图 2：构建与验证流程" />
              ) : null}
              {paper ? (
                <p>
                  两项检查 <strong>新任务完成 / 原任务健康</strong>
                </p>
              ) : (
                <dl>
                  <dt>日期</dt>
                  <dd>10 月 24 日</dd>
                  <dt>时段</dt>
                  <dd>18:00–21:00</dd>
                  <dt>地点</dt>
                  <dd>纸间书房 · 二层展厅</dd>
                </dl>
              )}
            </article>
          ) : index === 2 ? (
            <div className="film-proof">
              <img src={cover} alt={current.headline + "宣传海报"} />
              <span>
                <Check size={14} /> {paper ? "小红书配图" : "竖版海报"}
              </span>
            </div>
          ) : (
            <div className="film-suite" aria-busy={!files.length && !error}>
              {error && !paper && (
                <div className="film-retry" role="status">
                  {error}{" "}
                  <button type="button" onClick={retry}>
                    重新加载
                  </button>
                </div>
              )}
              {images.map((file, slot) => {
                const url =
                  files[file]?.url ||
                  (paper
                    ? base +
                      "kits/clashbench-" +
                      ["red", "x", "wechat"][slot] +
                      ".webp"
                    : "");
                return url ? (
                  <figure key={file}>
                    <img
                      src={url}
                      alt={current.formats[slot] + "实际发布成品"}
                    />
                    <figcaption>{current.formats[slot]}</figcaption>
                  </figure>
                ) : (
                  <figure key={file} className="film-loading">
                    {current.formats[slot]}
                  </figure>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <div className="film-transport">
        <div className="film-controls">
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? "暂停流程演示" : "播放流程演示"}
          >
            {playing ? <Pause size={17} /> : <Play size={17} />}
          </button>
          <button type="button" onClick={replay} aria-label="从头回放演示">
            <RotateCcw size={16} />
          </button>
        </div>
        <div className="film-frames" role="group" aria-label="选择演示步骤">
          {current.steps.map((step, n) => {
            const Icon = icons[n];
            return (
              <button
                key={step}
                type="button"
                aria-pressed={index === n}
                onClick={() => select(n)}
              >
                <span
                  className={"film-frame-thumbnail thumb-" + n}
                  aria-hidden="true"
                >
                  {n === 0 ? (
                    <Icon size={18} />
                  ) : n === 1 && figure ? (
                    <img src={figure} alt="" />
                  ) : n === 1 ? (
                    <Icon size={18} />
                  ) : (
                    <img
                      src={n === 3 ? files[1]?.url || cover : cover}
                      alt=""
                    />
                  )}
                </span>
                <span>{step}</span>
                {n === index && (
                  <i
                    key={cycle + "-" + n}
                    style={{ "--length": "4.2s" } as CSSProperties}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function LandingShowcase() {
  const [selected, select] = useState<CaseKey>("paper");
  return (
    <>
      <section className="ls-intro" id="desk" aria-labelledby="ls-hero-title">
        <div className="pl-shell ls-hero-grid">
          <div className="ls-pitch">
            <h1 id="ls-hero-title">
              从一份原稿，
              <br />
              <em>到多平台发布。</em>
            </h1>
            <p>
              把论文或活动通知变成一套宣传材料。文案按平台写，海报可以接着改。
            </p>
            <div className="ls-hero-links">
              <a className="ls-primary" href="#workbench">
                进入工作台 <ArrowRight size={17} />
              </a>
              <a className="ls-secondary" href="#demo">
                看生成演示 <ArrowDown size={16} />
              </a>
            </div>
          </div>
          <PosterWall />
        </div>
      </section>
      <section className="ls-demo" id="demo" aria-labelledby="ls-demo-title">
        <div className="pl-shell">
          <div className="ls-demo-head">
            <h2 id="ls-demo-title">从原稿到成品</h2>
            <div className="ls-demo-switch" role="group" aria-label="演示案例">
              {(Object.keys(cases) as CaseKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={selected === key}
                  onClick={() => select(key)}
                >
                  {cases[key].label}
                </button>
              ))}
            </div>
          </div>
          <DemoFilm key={selected} selected={selected} />
          {selected === "paper" && (
            <a className="film-edit" href={clashbenchPath}>
              在工作台编辑这个案例 <ArrowRight size={14} />
            </a>
          )}
        </div>
      </section>
    </>
  );
}
