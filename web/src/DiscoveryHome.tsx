import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Asterisk,
  Check,
  ImageOff,
  Images,
  Layers,
  Menu,
  Palette,
  Pause,
  Play,
  Search,
  Sparkles,
  WandSparkles,
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
import PrintProof from "./PrintProof";
import { editions, type Edition } from "./editions";
import { formats, type Format } from "./model";

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
const suggestions = ["周末咖啡市集", "独立音乐现场", "毕业艺术展"];
const templateColors: Record<string, string> = {
  复古未来: "orange",
  柔和梦境: "paper",
  大胆撞色: "violet",
  自然叙事: "mint",
};
const mats = ["#e8cfad", "#d6dfd4", "#dfb9ab", "#d5cada", "#bdcebf", "#e4d4a7"];
const templatesUrl = "?mode=templates";
function openTemplate(
  title: string,
  item?: Inspiration,
  edition?: Edition,
  format: Format = "portrait",
) {
  const params = new URLSearchParams({
    title: title.trim(),
    theme: item
      ? templateColors[item.category]
      : edition
        ? editions[edition].theme
        : "paper",
    format,
  });
  if (edition) params.set("edition", edition);
  location.assign(templatesUrl + "#new?" + params);
}
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
  onGuide,
  threads,
  jobs,
  blocked,
  demo,
  localTemplates,
  motion,
  onMotion,
}: Props) {
  const [aiBrief, setAiBrief] = useState(false);
  const [edition, setEdition] = useState<Edition>("bloom"),
    [format, setFormat] = useState<Format>("portrait");
  const local = !aiBrief || demo || localTemplates;
  const draftKey = local
    ? "posterlab.discovery.title"
    : "posterlab.discovery.draft";
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    try {
      return Object.fromEntries(
        ["posterlab.discovery.title", "posterlab.discovery.draft"].map(
          (key) => [key, localStorage.getItem(key) || ""],
        ),
      );
    } catch {
      return {};
    }
  });
  const prompt = drafts[draftKey] || "";
  const proofTitle = drafts["posterlab.discovery.title"] || "";
  const startProof = () =>
    openTemplate(
      proofTitle.trim() || editions[edition].title,
      undefined,
      edition,
      format,
    );
  const [draftWarning, setDraftWarning] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  function edit(value: string) {
    setDrafts((old) => ({ ...old, [draftKey]: value }));
    try {
      localStorage.setItem(draftKey, value);
      setDraftWarning(false);
    } catch {
      setDraftWarning(true);
    }
  }
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
    local ? openTemplate(prompt, item) : onCreate(inspirationPrompt(item));
  const navLinks = (
    <>
      <a href="#inspiration">灵感画廊</a>
      <a href={templatesUrl + "#gallery"}>模板作品</a>
      <a href="#recent">{demo ? "创作案例" : "最近对话"}</a>
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
        <section className="pl-shell pl-hero" aria-labelledby="hero-title">
          <div className="pl-intro">
            <p className="pl-kicker">
              <span /> POSTERLAB PRINT STUDIO
            </p>
            <h1 id="hero-title">
              让灵感，
              <br />
              <em>成为海报。</em>
            </h1>
            <p className="pl-lead">
              {local
                ? "写下标题，看看它在三种视觉风格里的样子。选中喜欢的一版，继续编辑并导出。"
                : "写下活动主题，让 AI 设计初稿，再逐版打磨。"}
            </p>
            {!demo && !localTemplates && (
              <div className="proof-mode" role="group" aria-label="创作方式">
                <button aria-pressed={local} onClick={() => setAiBrief(false)}>
                  模板试印
                </button>
                <button aria-pressed={!local} onClick={() => setAiBrief(true)}>
                  AI 简报
                </button>
              </div>
            )}
            <form
              className="pl-composer"
              onSubmit={(e) => {
                e.preventDefault();
                if (local) startProof();
                else if (!blocked) onCreate(prompt);
              }}
            >
              <label htmlFor="poster-idea">
                {local ? <Palette size={15} /> : <Sparkles size={15} />}{" "}
                {local ? "海报主题" : "创作简报"}
              </label>
              <textarea
                ref={field}
                id="poster-idea"
                rows={2}
                maxLength={local ? 180 : 5000}
                value={prompt}
                onChange={(e) => edit(e.target.value)}
                placeholder={
                  local
                    ? "输入海报标题，例如「周末咖啡市集」"
                    : "想做一张什么海报？写下主题、时间或风格…"
                }
              />
              <div className="pl-compose-foot">
                {local ? (
                  <span>
                    <Layers size={15} /> {editions[edition].name} ·{" "}
                    {formats[format].ratio}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="pl-guide"
                    disabled={blocked}
                    onClick={() => onGuide(prompt)}
                  >
                    <WandSparkles size={15} /> 完善想法
                  </button>
                )}
                <button
                  className="pl-primary"
                  disabled={!local && blocked}
                  type="submit"
                >
                  {local ? "开始排版" : "开始创作"}
                  <ArrowUpRight size={16} />
                </button>
              </div>
            </form>
            <div className="pl-suggestions">
              <span>试试</span>
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    edit(s);
                    if (local)
                      setEdition(
                        s === suggestions[0]
                          ? "coffee"
                          : s === suggestions[1]
                            ? "vinyl"
                            : "bloom",
                      );
                    field.current?.focus();
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
            {draftWarning && (
              <p role="status">草稿暂时无法保存，请复制后再离开。</p>
            )}
            {!local && blocked && (
              <p role="status">有任务等待完成，可在 AI 工作台查看。</p>
            )}
          </div>
          <PrintProof
            title={proofTitle}
            edition={edition}
            format={format}
            select={setEdition}
            resize={setFormat}
            start={startProof}
          />
        </section>
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
