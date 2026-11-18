import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Asterisk,
  Check,
  ImageOff,
  Images,
  Menu,
  Pause,
  Play,
  Search,
  X,
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
import Showroom, { startCover } from "./Showroom";
import { type Edition } from "./editions";

type Props = {
  onCreate: (prompt: string) => void;
  onResume: () => void;
  onOpen: (thread: Conversation) => void;
  onGuide: (prompt: string) => void;
  threads: Conversation[];
  jobs: Job[];
  blocked: boolean;
  demo: boolean;
  localTemplates: boolean;
  motion: boolean;
  onMotion: () => void;
};
const categories = [
  "全部",
  ...new Set(inspirations.map((item) => item.category)),
];
const mats = ["#e8cfad", "#d6dfd4", "#dfb9ab", "#d5cada", "#bdcebf", "#e4d4a7"];
const templatesUrl = "?mode=templates";
function Mark() {
  return (
    <span className="pl-mark" aria-hidden="true">
      <Asterisk size={30} strokeWidth={3.2} />
    </span>
  );
}
function PosterImage({
  item,
  eager = false,
}: {
  item: Inspiration;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <span className="pl-image-missing">
      <ImageOff />
      图片暂不可用
    </span>
  ) : (
    <img
      src={inspirationImage(item.id)}
      alt={item.subtitle + " 海报"}
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
  use,
  local,
  blocked,
}: {
  item: Inspiration;
  close: () => void;
  use: () => void;
  local: boolean;
  blocked: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="pl-detail"
      aria-labelledby="pl-detail-title"
      onCancel={close}
      onClick={(event) => {
        if (event.target === ref.current) close();
      }}
    >
      <div
        className="pl-detail-art"
        style={{ background: mats[inspirations.indexOf(item)] }}
      >
        <PosterImage item={item} eager />
      </div>
      <div className="pl-detail-info">
        <button className="pl-close" aria-label="关闭详情" onClick={close}>
          <X size={20} />
        </button>
        <span className="pl-tag">{item.category}</span>
        <h2 id="pl-detail-title">{item.title}</h2>
        <p lang="en">{item.subtitle}</p>
        <div className="pl-palette">
          {item.colors.map((c) => (
            <span key={c} style={{ background: c }} title={c} />
          ))}
        </div>
        <h3>视觉方向</h3>
        <p>{item.direction}</p>
        <button
          className="pl-primary"
          disabled={blocked && !local}
          onClick={use}
        >
          {local ? "以相近配色新建模板" : "用这个方向创作"}
          <ArrowUpRight size={17} />
        </button>
        <footer>
          <b>{item.designer}</b>
          <span>Courtesy NASA/JPL-Caltech</span>
          <a href={JPL_SOURCE} target="_blank" rel="noreferrer">
            查看原作与署名 <ArrowUpRight size={13} />
          </a>
        </footer>
      </div>
    </dialog>
  );
}
export default function DiscoveryHome({
  onCreate,
  onResume,
  onOpen,
  threads,
  jobs,
  blocked,
  demo,
  localTemplates,
  motion,
  onMotion,
}: Props) {
  const local = demo || localTemplates;
  const [filter, setFilter] = useState("全部"),
    [search, setSearch] = useState("");
  const [detail, setDetail] = useState<Inspiration | null>(null),
    [menu, setMenu] = useState(false);
  const shown = inspirations.filter(
    (p) =>
      (filter === "全部" || p.category === filter) &&
      (p.title + " " + p.subtitle + " " + p.category)
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const recent = [...threads]
    .sort((a, b) => b.updated.localeCompare(a.updated))
    .slice(0, 4);
  const useArt = (item: Inspiration) =>
    local
      ? startCover(
          (
            {
              复古未来: "coffee",
              柔和梦境: "bloom",
              大胆撞色: "vinyl",
              自然叙事: "bloom",
            } as Record<string, Edition>
          )[item.category] || "afterglow",
          "portrait",
          item.title,
        )
      : onCreate(inspirationPrompt(item));
  const navLinks = (
    <>
      <a href="#templates">模板精选</a>
      <a href="#inspiration">灵感画廊</a>
      <a href={templatesUrl + "#gallery"}>我的作品</a>
    </>
  );
  return (
    <div className={"pl-home" + (motion ? "" : " pl-still")} id="home">
      <a href="#main-content" className="pl-skip">
        跳到主要内容
      </a>
      <header className="pl-header">
        <div className="pl-shell pl-nav">
          <a href="#home" className="pl-logo" aria-label="PosterLab 首页">
            <Mark />
            PosterLab
          </a>
          <nav aria-label="首页导航">{navLinks}</nav>
          <div className="pl-nav-end">
            <button
              className="pl-motion"
              aria-label={motion ? "关闭动效" : "开启动效"}
              aria-pressed={motion}
              onClick={onMotion}
            >
              {motion ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button className="pl-dark" onClick={onResume}>
              {demo ? "查看 AI 案例" : "AI 工作台"}
              <ArrowUpRight size={16} />
            </button>
            <button
              className="pl-menu"
              aria-label={menu ? "收起导航" : "展开导航"}
              aria-expanded={menu}
              aria-controls="pl-mobile-nav"
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X /> : <Menu />}
            </button>
          </div>
        </div>
        {menu && (
          <nav
            id="pl-mobile-nav"
            className="pl-mobile-nav"
            aria-label="移动导航"
            onClick={() => setMenu(false)}
          >
            {navLinks}
          </nav>
        )}
      </header>
      <main id="main-content">
        <Showroom />
        <section
          className="pl-gallery"
          id="inspiration"
          aria-labelledby="gallery-title"
        >
          <div className="pl-shell">
            <div className="pl-section-head">
              <div>
                <p className="pl-kicker">
                  <span /> INSPIRATION LIBRARY
                </p>
                <h2 id="gallery-title">灵感画廊</h2>
              </div>
              <label className="pl-search">
                <Search size={17} />
                <input
                  type="search"
                  aria-label="搜索灵感海报"
                  placeholder="搜索作品或风格"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            </div>
            <div className="pl-filters">
              <div role="group" aria-label="海报风格">
                {categories.map((f) => (
                  <button
                    key={f}
                    aria-pressed={f === filter}
                    onClick={() => setFilter(f)}
                  >
                    {f === filter && <Check size={13} />} {f}
                  </button>
                ))}
              </div>
              <small aria-live="polite">{shown.length} 件作品</small>
            </div>
            <div className="pl-grid">
              {shown.map((item) => (
                <article
                  key={item.id}
                  className="pl-card"
                  style={
                    {
                      "--mat": mats[inspirations.indexOf(item)],
                    } as CSSProperties
                  }
                >
                  <button
                    className="pl-card-art"
                    onClick={() => setDetail(item)}
                    aria-label={"查看" + item.title + "海报详情"}
                  >
                    <PosterImage item={item} />
                    <span className="pl-expand">
                      <ArrowUpRight size={17} />
                    </span>
                  </button>
                  <div className="pl-card-meta">
                    <div>
                      <button onClick={() => setDetail(item)}>
                        {item.title}
                      </button>
                      <p>{item.subtitle}</p>
                    </div>
                    <span className="pl-tag">{item.category}</span>
                  </div>
                </article>
              ))}
            </div>
            {!shown.length && (
              <div className="pl-empty">
                <Search />
                <h3>没有找到匹配的海报</h3>
                <button
                  className="pl-link"
                  onClick={() => {
                    setSearch("");
                    setFilter("全部");
                  }}
                >
                  清除筛选 <ArrowRight size={15} />
                </button>
              </div>
            )}
            <p className="pl-credit">
              精选参考作品来自 NASA/JPL-Caltech「Visions of the Future」系列。
              <a href={JPL_SOURCE} target="_blank" rel="noreferrer">
                原作与署名 ↗
              </a>{" "}
              <a
                href="https://www.jpl.nasa.gov/jpl-image-use-policy/"
                target="_blank"
                rel="noreferrer"
              >
                使用说明 ↗
              </a>
            </p>
          </div>
        </section>
        <section id="recent" className="pl-shell pl-recent">
          <div className="pl-section-head">
            <div>
              <p className="pl-kicker">
                <span /> WORKSPACE
              </p>
              <h2>{demo ? "AI 创作案例" : "最近的创作对话"}</h2>
            </div>
            <button className="pl-link" onClick={onResume}>
              进入工作台 <ArrowRight size={16} />
            </button>
          </div>
          {recent.length ? (
            <div className="pl-recent-grid">
              {recent.map((t) => {
                const job = [...t.messages]
                  .reverse()
                  .map((m) =>
                    jobs.find(
                      (j) => j.id === m.jobId && j.state === "complete",
                    ),
                  )
                  .find(Boolean);
                return (
                  <button key={t.id} onClick={() => onOpen(t)}>
                    {job?.image_url ? (
                      <img alt="" src={job.image_url} loading="lazy" />
                    ) : (
                      <Images />
                    )}
                    <span>
                      <b>{t.title}</b>
                      <small>{job ? "查看海报与版本" : "继续对话"}</small>
                    </span>
                    <ArrowUpRight size={17} />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="pl-empty">
              <Images />
              <h3>
                {demo ? "查看预先生成的 AI 海报" : "这里将保存你的创作对话"}
              </h3>
              <button className="pl-link" onClick={onResume}>
                {demo ? "打开案例工作台" : "打开 AI 工作台"}{" "}
                <ArrowRight size={15} />
              </button>
            </div>
          )}
        </section>
      </main>
      <footer className="pl-shell pl-footer">
        <a className="pl-logo" href="#home">
          <Mark />
          PosterLab
        </a>
        <a href="#home">
          回到顶部 <ArrowDown size={14} />
        </a>
      </footer>
      {detail && (
        <PosterDetail
          item={detail}
          close={() => setDetail(null)}
          use={() => useArt(detail)}
          blocked={blocked}
          local={local}
        />
      )}
    </div>
  );
}
