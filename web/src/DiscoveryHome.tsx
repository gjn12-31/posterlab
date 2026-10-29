import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Sparkles,
  Shuffle,
  X,
  Search,
  MoveUpRight,
  History,
  WandSparkles,
  ScanLine,
  Layers3,
  Pause,
  Play,
  ImageOff,
} from "lucide-react";
import {
  inspirations,
  inspirationImage,
  inspirationPrompt,
  JPL_SOURCE,
  type Inspiration,
} from "./inspiration";
import type { Conversation, Job } from "./chat-model";
import "./discovery.css";

type Props = {
  onCreate: (prompt: string) => void;
  onResume: () => void;
  onOpen: (thread: Conversation) => void;
  onGuide: (prompt: string) => void;
  threads: Conversation[];
  jobs: Job[];
  blocked: boolean;
  demo: boolean;
  motion: boolean;
  onMotion: () => void;
};
const suggestions = [
  "周末咖啡市集，温暖的杂志风",
  "独立音乐现场，大胆的复古撞色",
  "毕业艺术展，留白与实验字体",
];
function PosterImage({
  item,
  eager = false,
}: {
  item: Inspiration;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <span className="poster-unavailable">
      <ImageOff />
      <span>图片暂不可用</span>
      <small>仍可查看设计方向</small>
    </span>
  ) : (
    <img
      src={inspirationImage(item.id)}
      alt={`${item.subtitle} · ${item.title}海报`}
      loading={eager ? "eager" : "lazy"}
      width="800"
      height="1192"
      onError={() => setFailed(true)}
    />
  );
}
function PosterDetail({
  item,
  close,
  create,
  blocked,
}: {
  item: Inspiration;
  close: () => void;
  create: (text: string) => void;
  blocked: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="discovery-detail"
      aria-labelledby="inspiration-title"
      onCancel={close}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <button
        className="detail-close"
        onClick={close}
        aria-label="关闭海报详情"
      >
        <X size={22} />
      </button>
      <div className="detail-art">
        <PosterImage item={item} eager />
      </div>
      <div className="detail-copy">
        <span className="section-eyebrow">INSPIRATION / 灵感参考</span>
        <h2 id="inspiration-title">{item.title}</h2>
        <p className="detail-original">{item.subtitle}</p>
        <div className="swatches">
          {item.colors.map((c) => (
            <span key={c} style={{ background: c }} title={c} />
          ))}
          <small>{item.category}</small>
        </div>
        <h3>把视觉灵感，变成你的表达。</h3>
        <p>{item.direction}</p>
        <button
          className="warm-button"
          disabled={blocked}
          onClick={() => create(inspirationPrompt(item))}
        >
          用这个方向创作 <ArrowUpRight size={18} />
        </button>
        <small className="detail-note">
          带入可编辑的文字提示词，在工作台补充主题后生成。
        </small>
        <div className="art-credit">
          <b>{item.designer}</b>
          <span>Courtesy NASA/JPL-Caltech</span>
          <p>
            网络精选参考，非 PosterLab
            生成作品。图片展示不代表原作者或机构为本产品背书。
          </p>
          <a href={JPL_SOURCE} target="_blank" rel="noreferrer">
            查看原作与来源 <ArrowUpRight size={14} />
          </a>
        </div>
      </div>
    </dialog>
  );
}
export default function DiscoveryHome({
  onCreate,
  onResume,
  onOpen,
  onGuide,
  threads,
  jobs,
  blocked,
  demo,
  motion,
  onMotion,
}: Props) {
  const [prompt, setPrompt] = useState(() => {
    try {
      return localStorage.getItem("posterlab.discovery.draft") || "";
    } catch {
      return "";
    }
  });
  const [filter, setFilter] = useState("全部灵感"),
    [query, setQuery] = useState("");
  const [detail, setDetail] = useState<Inspiration | null>(null);
  const [draftWarning, setDraftWarning] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem("posterlab.discovery.draft", prompt);
      setDraftWarning(false);
    } catch {
      setDraftWarning(true);
    }
  }, [prompt]);
  const filtered = inspirations.filter(
    (p) =>
      (filter === "全部灵感" || p.category === filter) &&
      `${p.title} ${p.subtitle} ${p.category}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const recent = [...threads]
    .sort((a, b) => b.updated.localeCompare(a.updated))
    .slice(0, 4);
  const go = (value: string) => {
    if (!blocked) onCreate(value);
  };
  return (
    <div id="home" className={`discovery-page ${motion ? "" : "discovery-still"}`}>
      <a className="discovery-skip" href="#discover-main">
        跳到主要内容
      </a>
      <header className="discovery-nav">
        <a className="discovery-logo" href="#home">
          <span>✳</span> PosterLab<span className="logo-dot">AI</span>
        </a>
        <nav aria-label="首页导航">
          <a href="#inspiration">发现灵感</a>
          <a href="#how-it-works">如何创作</a>
          <a href="#recent">我的作品</a>
        </nav>
        <div className="nav-actions">
          <button
            className="discovery-motion"
            onClick={onMotion}
            aria-label={motion ? "关闭首页动效" : "开启首页动效"}
          >
            {motion ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button className="nav-studio" onClick={onResume}>
            {demo ? "体验演示" : "进入工作台"} <ArrowUpRight size={16} />
          </button>
        </div>
      </header>
      <main id="discover-main">
        <section className="discovery-hero" aria-labelledby="hero-title">
          <div className="hero-aura" aria-hidden="true" />
          <div className="hero-grain" aria-hidden="true" />
          <button
            className="floating-poster floating-left"
            onClick={() => setDetail(inspirations[0])}
            aria-label="查看星际漫游海报"
          >
            <PosterImage item={inspirations[0]} eager />
            <span>
              The Grand Tour <MoveUpRight size={18} />
            </span>
          </button>
          <button
            className="floating-poster floating-right"
            onClick={() => setDetail(inspirations[1])}
            aria-label="查看云端漫步海报"
          >
            <PosterImage item={inspirations[1]} eager />
            <span>
              Venus <MoveUpRight size={18} />
            </span>
          </button>
          <div className="hero-center">
            <p className="hero-kicker">
              <span /> YOUR IDEAS, BEAUTIFULLY SEEN.
            </p>
            <h1 id="hero-title">
              把脑海里的灵感，
              <br />
              <em>变成惊艳的海报。</em>
            </h1>
            <p className="hero-description">
              一句话开启创作。让 AI 设计，再一起打磨到喜欢。
            </p>
            <form
              className="discovery-composer"
              onSubmit={(e) => {
                e.preventDefault();
                go(prompt);
              }}
            >
              <textarea
                aria-label="描述你的海报创意"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                maxLength={5000}
                rows={2}
                placeholder="想做一张什么海报？比如，周末的咖啡与黑胶市集…"
              />
              <div>
                <button
                  type="button"
                  className="prompt-guide"
                  disabled={blocked}
                  onClick={() => onGuide(prompt)}
                >
                  <WandSparkles size={16} /> 帮我完善想法
                </button>
                <div className="compose-actions">
                  <button
                    type="button"
                    className="shuffle-prompt"
                    aria-label="换一个创意"
                    onClick={() =>
                      setPrompt(
                        suggestions[
                          (suggestions.indexOf(prompt) + 1) % suggestions.length
                        ],
                      )
                    }
                  >
                    <Shuffle size={17} />
                  </button>
                  <button
                    className="warm-button"
                    disabled={blocked}
                    type="submit"
                  >
                    开始创作 <ArrowUpRight size={18} />
                  </button>
                </div>
              </div>
            </form>
            <div className="hero-suggestions">
              {["咖啡市集", "音乐现场", "艺术展览"].map((label, i) => (
                <button key={label} onClick={() => setPrompt(suggestions[i])}>
                  {label} <span>↗</span>
                </button>
              ))}
            </div>
            <p className="hero-help">
              {blocked
                ? "有任务正在处理或等待恢复，可进入工作台继续查看。"
                : demo
                  ? "当前为展示版 · 进入工作台体验真实生成案例"
                  : "先确认创意与模型，再生成。每一版，都可以继续修改。"}
            </p>
            {draftWarning && (
              <p role="status">浏览器存储不可用，请在离开前复制你的创意。</p>
            )}
          </div>
          <div className="hero-bottom">
            <span>从想法到作品</span>
            <i />
            <span>自由选择模型</span>
            <i />
            <span>看图评测优化</span>
            <i />
            <span>多版本持续创作</span>
          </div>
        </section>
        <section className="discovery-gallery section-wrap" id="inspiration">
          <div className="section-heading">
            <div>
              <span className="section-eyebrow">THE INSPIRATION EDIT</span>
              <h2>
                好设计，会点亮下一个想法<span>✳</span>
              </h2>
              <p>从世界的想象力里，找到你的视觉方向。</p>
            </div>
            <span className="curated-label">精选海报 / VOL. 01</span>
          </div>
          <div className="gallery-controls">
            <div className="gallery-filters" aria-label="海报风格筛选">
              {["全部灵感", "复古未来", "柔和梦境", "大胆撞色", "自然叙事"].map(
                (label) => (
                  <button
                    key={label}
                    aria-pressed={filter === label}
                    onClick={() => setFilter(label)}
                  >
                    {label}
                  </button>
                ),
              )}
            </div>
            <label className="gallery-search">
              <Search size={16} />
              <input
                aria-label="搜索灵感海报"
                placeholder="搜索灵感…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
          <div className="poster-grid">
            {filtered.map((item, i) => (
              <article
                className="discovery-card"
                key={item.id}
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <button
                  className="poster-cover"
                  onClick={() => setDetail(item)}
                  aria-label={`查看${item.title}海报`}
                >
                  <PosterImage item={item} />
                  <span className="poster-badge">{item.category}</span>
                  <span className="poster-hover">
                    探索这个灵感 <ArrowUpRight size={20} />
                  </span>
                </button>
                <div className="poster-caption">
                  <div>
                    <h3>
                      <button onClick={() => setDetail(item)}>
                        {item.title}
                      </button>
                    </h3>
                    <p>{item.subtitle}</p>
                  </div>
                  <button
                    className="poster-remix"
                    disabled={blocked}
                    onClick={() => go(inspirationPrompt(item))}
                    aria-label={`用${item.title}的视觉方向创作`}
                  >
                    <ArrowUpRight size={19} />
                  </button>
                </div>
                <small className="poster-credit">
                  NASA/JPL-Caltech · 网络灵感
                </small>
              </article>
            ))}
          </div>
          {!filtered.length && (
            <div className="gallery-empty">
              <Search size={28} />
              <p>还没有匹配的灵感，试试其他关键词。</p>
              <button
                onClick={() => {
                  setFilter("全部灵感");
                  setQuery("");
                }}
              >
                查看全部海报
              </button>
            </div>
          )}
          <p className="gallery-attribution">
            Courtesy NASA/JPL-Caltech · 展示作品来自{" "}
            <a href={JPL_SOURCE} target="_blank" rel="noreferrer">
              Visions of the Future ↗
            </a>
            ，作为设计灵感参考，非本产品生成。
            <a
              href="https://www.jpl.nasa.gov/jpl-image-use-policy/"
              target="_blank"
              rel="noreferrer"
            >
              使用说明 ↗
            </a>
          </p>
        </section>
        <section className="creative-path section-wrap" id="how-it-works">
          <div className="section-heading">
            <div>
              <span className="section-eyebrow">MADE WITH YOU</span>
              <h2>你出想法，剩下的一起完成。</h2>
            </div>
            <button
              className="text-action"
              onClick={() => go("")}
              disabled={blocked}
            >
              开启我的第一张 <ArrowRight size={18} />
            </button>
          </div>
          <div className="path-grid">
            {[
              {
                n: "01",
                icon: WandSparkles,
                title: "不用先学会写提示词",
                text: "从一句话开始，也可以用需求助手梳理主题、信息与风格。",
              },
              {
                n: "02",
                icon: ScanLine,
                title: "好不好看，让评测说话",
                text: "从构图、色彩、文字等维度获得评分，把修改意见带进下一版。",
              },
              {
                n: "03",
                icon: Layers3,
                title: "灵感不止一个版本",
                text: "继续对话、自由改版，随时对比历史版本，下载喜欢的作品。",
              },
            ].map((item) => (
              <article key={item.n}>
                <div>
                  <item.icon size={24} />
                  <span>{item.n}</span>
                </div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="recent-section section-wrap" id="recent">
          <div className="section-heading">
            <div>
              <span className="section-eyebrow">YOUR CREATIVE SPACE</span>
              <h2>{demo ? "走进一次真实创作" : "接着上次的灵感。"}</h2>
            </div>
            <button className="text-action" onClick={onResume}>
              <History size={16} /> 打开工作台
            </button>
          </div>
          <div className="recent-grid">
            {recent.map((t) => {
              const job = [...t.messages]
                .reverse()
                .map((m) =>
                  jobs.find((j) => j.id === m.jobId && j.state === "complete"),
                )
                .find(Boolean);
              return (
                <button
                  className="recent-card"
                  key={t.id}
                  onClick={() => onOpen(t)}
                >
                  {job?.image_url ? (
                    <img src={job.image_url} alt="" loading="lazy" />
                  ) : (
                    <span className="recent-placeholder">
                      <Sparkles />
                    </span>
                  )}
                  <span>
                    <b>{t.title}</b>
                    <small>
                      {job ? "打开海报与创作对话" : "继续对话"}{" "}
                      <ArrowUpRight size={12} />
                    </small>
                  </span>
                  <ArrowUpRight size={18} />
                </button>
              );
            })}
          </div>
          {!recent.length && (
            <div className="recent-empty">
              <Sparkles size={24} />
              <div>
                <h3>第一张代表作，就从这里开始。</h3>
                <p>你的海报与创作对话会出现在这里。</p>
              </div>
              <button
                className="warm-button"
                disabled={blocked}
                onClick={() => go("")}
              >
                开始创作 <ArrowUpRight size={17} />
              </button>
            </div>
          )}
        </section>
      </main>
      <footer className="discovery-footer">
        <a href="#home" className="discovery-logo">
          <span>✳</span> PosterLab
        </a>
        <span>让每一个好想法，都有自己的画面。</span>
        <a href="#inspiration">继续发现 ↑</a>
      </footer>
      {detail && (
        <PosterDetail
          item={detail}
          close={() => setDetail(null)}
          create={go}
          blocked={blocked}
        />
      )}
    </div>
  );
}
