import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ArrowDownToLine,
  BookOpen,
  PenTool,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  Columns2,
  Search,
} from "lucide-react";
import {
  works,
  space,
  findWork,
  workLink,
  compareLink,
  type Artwork,
  type Exhibition,
} from "./atlas-data";
import { ExhibitHero, ExhibitionRoom } from "./AtlasExhibit";
import { WorkDetail } from "./AtlasDetail";
import AtlasCompare from "./AtlasCompare";
import { readFolio, saveFolio, exportFolio, type Folio } from "./atlas-folio";
import { cropImage, type Crop } from "./atlas-crop";
import "./atlas.css";
function subscribe(notify: () => void) {
  window.addEventListener("hashchange", notify);
  return () => window.removeEventListener("hashchange", notify);
}
const getHash = () => location.hash.slice(1) || "home";
const selectWorks = (ids: string[]) =>
  ids.map((id) => findWork(id)).filter((w): w is Artwork => !!w);
const exhibitions: Exhibition[] = [
  {
    id: "ukiyo",
    number: "01",
    title: "浮世绘的山与海",
    lines: ["浮世绘的", "山与海"],
    english: "Mountains & Tides",
    theme: "木版画",
    intro:
      "从神奈川的浪尖，到富士山的晨光。跟随葛饰北斋的两幅木版画，细看江户风景里的动与静。",
    works: selectWorks(["great-wave", "red-fuji"]),
    focal: "42% 43%",
  },
  {
    id: "voyage",
    number: "02",
    title: "宇宙旅行广告局",
    lines: ["宇宙旅行", "广告局"],
    english: "Tickets to Other Worlds",
    theme: "旅行海报",
    intro:
      "六张来自 NASA / JPL 的旅行海报，用二十世纪的广告语言想象未来的目的地。",
    works: space,
    focal: "50% 35%",
  },
  {
    id: "impressions",
    number: "03",
    title: "花叶的四种印记",
    lines: ["花叶的", "四种印记"],
    english: "Botanical Impressions",
    theme: "图案与自然",
    intro:
      "从蓝晒标本、花卉手稿到织物与绘画，观察一片叶子如何变成轮廓、纹样和色块。",
    works: selectWorks([
      "strawberry-thief",
      "tulip-study",
      "blue-fern",
      "flower-vase",
    ]),
  },
];
const homePicks = selectWorks([
  "may-milton",
  "blue-fern",
  "jupiter",
  "strawberry-thief",
]);
function Logo() {
  return (
    <a
      className="at-logo"
      href="#exhibitions"
      aria-label="PosterLab 图像档案馆首页"
    >
      <i className="at-mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </i>
      <b>PosterLab</b>
      <span>图像档案馆</span>
    </a>
  );
}
function ArtworkCard({
  w,
  saved,
  toggle,
}: {
  w: Artwork;
  saved: boolean;
  toggle: () => void;
}) {
  return (
    <article className="at-card">
      <div className="at-card-art">
        <a href={workLink(w)} aria-label={"查看" + w.title}>
          <img
            src={w.thumb}
            loading="lazy"
            alt={w.title}
            style={{ objectPosition: w.focal ?? "center 36%" }}
          />
        </a>
        <button
          className={"at-book" + (saved ? " active" : "")}
          aria-label={(saved ? "取消收藏" : "收藏") + w.title}
          aria-pressed={saved}
          onClick={toggle}
        >
          {saved ? <Check size={16} /> : <Bookmark size={16} />}
        </button>
      </div>
      <div className="at-card-meta">
        <span>{w.medium}</span>
        <i /> <span>{w.group}</span>
      </div>
      <h3>
        <a href={workLink(w)}>{w.title}</a>
      </h3>
      <small>{w.artist}</small>
    </article>
  );
}
type Filters = { category: string; query: string };
function ArchiveIndex({
  folio,
  toggle,
  filters,
  change,
  home = false,
}: {
  folio: Folio;
  toggle: (w: Artwork) => void;
  filters: Filters;
  change: (v: Filters) => void;
  home?: boolean;
}) {
  const { category, query } = home ? { category: "全部", query: "" } : filters;
  const choose = (c: string) => change({ ...filters, category: c }),
    search = (q: string) => change({ ...filters, query: q });
  const categories = ["全部", ...new Set(works.map((w) => w.group))];
  const source = home ? homePicks : works;
  const filtered = source.filter(
    (w) =>
      (category === "全部" || category === w.group) &&
      [w.title, w.originalTitle, w.artist, w.collection, w.medium, w.year]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  const visible = home ? filtered.slice(0, 4) : filtered;
  return (
    <section
      className={"at-index at-inner" + (home ? " at-index-home" : "")}
      aria-label="作品索引"
    >
      <div className={home ? "at-sectionhead" : "at-pagehead"}>
        <div>
          <span className="at-over">
            {home ? "SELECTED WORKS" : "COLLECTION INDEX"}
          </span>
          {home ? <h2>馆藏选读</h2> : <h1>作品索引</h1>}
          {!home && <p>按作品、作者或媒介查找，点开原图可放大细读。</p>}
        </div>
        {home ? (
          <a className="at-link" href="#index">
            浏览全部 {works.length} 件 <ArrowRight size={16} />
          </a>
        ) : (
          <label className="at-search">
            <Search size={15} />
            <input
              aria-label="搜索作品"
              type="search"
              placeholder="搜作品、作者或媒介"
              value={query}
              onChange={(e) => search(e.target.value)}
            />
          </label>
        )}
      </div>
      {!home && (
        <div className="at-filterrow">
          <div className="at-filters">
            {categories.map((c) => (
              <button
                key={c}
                aria-pressed={category === c}
                onClick={() => choose(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <span aria-live="polite">{filtered.length} 件</span>
        </div>
      )}
      <div className="at-grid">
        {visible.map((w) => (
          <ArtworkCard
            key={w.id}
            w={w}
            saved={Object.hasOwn(folio, w.id)}
            toggle={() => toggle(w)}
          />
        ))}
      </div>
      {!visible.length && (
        <div className="at-empty">
          <Search />
          <h2>没有匹配的作品</h2>
          <button
            className="at-outline"
            onClick={() => {
              change({ category: "全部", query: "" });
            }}
          >
            清除筛选
          </button>
        </div>
      )}
    </section>
  );
}
function SavedCrop({ work, crop }: { work: Artwork; crop: Crop }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let active = true;
    cropImage(work.image, crop)
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [work, crop]);
  return (
    <figure className="at-savedcrop">
      {src && <img src={src} alt={"收藏的" + work.title + "局部"} />}
      <figcaption>收藏的局部</figcaption>
    </figure>
  );
}
function Saved({
  folio,
  toggle,
  note,
  notify,
}: {
  folio: Folio;
  toggle: (w: Artwork) => void;
  note: (id: string, text: string) => void;
  notify: (s: string) => void;
}) {
  const items = Object.keys(folio)
    .map(findWork)
    .filter((w): w is Artwork => !!w);
  const [busy, setBusy] = useState(false);
  return (
    <main className="at-inner at-saved">
      <div className="at-pagehead">
        <div>
          <span className="at-over">PERSONAL COLLECTION</span>
          <h1>我的收藏</h1>
          <p>
            留下观看笔记，在高清看图中收藏局部，再把原作、局部与出处一起导出。收藏保存在这个浏览器。
          </p>
        </div>
        {!!items.length && (
          <button
            className="at-ink"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await exportFolio(items, folio);
                notify("图集已导出，打开 HTML 文件即可查看");
              } catch {
                notify("导出未完成，请重试");
              } finally {
                setBusy(false);
              }
            }}
          >
            <ArrowDownToLine size={16} />
            {busy ? "正在导出" : "导出图集"}
          </button>
        )}
      </div>
      {items.length > 0 ? (
        <>
          <div className="at-saved-head">
            <span>{items.length} 件作品</span>
            {items.length >= 2 && (
              <a className="at-link" href={compareLink(items[0], items[1])}>
                <Columns2 size={16} /> 对照收藏作品
              </a>
            )}
          </div>
          <div className="at-grid">
            {items.map((w) => (
              <div key={w.id}>
                <ArtworkCard w={w} saved toggle={() => toggle(w)} />
                {folio[w.id].crop && (
                  <SavedCrop work={w} crop={folio[w.id].crop!} />
                )}
                <label className="at-note">
                  观看笔记
                  <textarea
                    aria-label={w.title + "的笔记"}
                    maxLength={1200}
                    rows={2}
                    value={folio[w.id].note}
                    onChange={(e) => note(w.id, e.target.value)}
                    placeholder="记下想借鉴的细节…"
                  />
                </label>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="at-empty">
          <Bookmark size={32} />
          <h2>先挑一件想留住的作品</h2>
          <p>点作品上的书签，即可在这里写笔记或导出图集。</p>
          <a className="at-ink" href="#index">
            去作品索引 <ArrowRight size={16} />
          </a>
        </div>
      )}
    </main>
  );
}
export default function DiscoveryHome() {
  const hash = useSyncExternalStore(subscribe, getHash),
    [route, ...ids] = hash.split("/");
  const [filters, changeFilters] = useState<Filters>({
    category: "全部",
    query: "",
  });
  const [folio, setFolio] = useState<Folio>(readFolio),
    [hero, selectHero] = useState(0),
    [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef(hash),
    from = useRef("index"),
    main = useRef<HTMLDivElement>(null),
    positions = useRef(new Map<string, number>());
  useEffect(() => {
    const refresh = () => setFolio(readFolio());
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    if (hash !== last.current) {
      positions.current.set(last.current, window.scrollY);
      if (route === "work") from.current = last.current;
      last.current = hash;
      main.current?.focus({ preventScroll: true });
      window.scrollTo({
        top: positions.current.get(hash) ?? 0,
        behavior: "instant",
      });
    }
    document.title =
      ({
        work: findWork(ids[0])?.title,
        exhibit: exhibitions.find((s) => s.id === ids[0])?.title,
        saved: "我的收藏",
        compare: "双联对照台",
        index: "作品索引",
      }[route] ?? "图像档案馆") + " · PosterLab";
  }, [hash]);
  function notify(s: string) {
    if (timer.current) clearTimeout(timer.current);
    setMessage(s);
    timer.current = setTimeout(() => setMessage(""), 3300);
  }
  function persist(next: Folio) {
    setFolio(next);
    try {
      saveFolio(next);
      return true;
    } catch {
      notify("浏览器存储不可用，本次收藏可导出");
      return false;
    }
  }
  function saved(id: string) {
    return Object.hasOwn(folio, id);
  }
  function toggle(w: Artwork) {
    const next = { ...folio },
      wasSaved = saved(w.id);
    if (wasSaved) delete next[w.id];
    else next[w.id] = { note: "" };
    if (persist(next)) notify(wasSaved ? "已从收藏移除" : "已加入「我的收藏」");
  }
  function saveCrop(w: Artwork, crop: Crop) {
    if (persist({ ...folio, [w.id]: { note: folio[w.id]?.note ?? "", crop } }))
      notify("局部已保存到「我的收藏」");
  }
  const active = (id: string) =>
    route === id ||
    (id === "exhibitions" && route === "exhibit") ||
    (id === "index" && route === "work")
      ? ("page" as const)
      : undefined;
  const selectedWork = findWork(ids[0]),
    currentExhibit = exhibitions.find((e) => e.id === ids[0]);
  const currentShow = exhibitions[hero];
  const front =
    route === "home" ||
    !["index", "work", "exhibit", "compare", "saved"].includes(route);
  return (
    <div className="atlas">
      <a
        className="at-skip"
        href="#atlas-content"
        onClick={(e) => {
          e.preventDefault();
          main.current?.focus();
        }}
      >
        跳到内容
      </a>
      <header className="at-header">
        <div className="at-headinner">
          <Logo />
          <nav aria-label="主导航">
            <a href="#home">宣传制作台</a>
            <a href="#exhibitions" aria-current={active("exhibitions")}>
              展览现场
            </a>
            <a href="#index" aria-current={active("index")}>
              作品索引
            </a>
            <a href="#compare" aria-current={active("compare")}>
              双联对照
            </a>
            <a href="#create">设计样张</a>
          </nav>
          <a
            className="at-navsave"
            href="#saved"
            aria-current={active("saved")}
          >
            <Bookmark size={16} />
            <span>我的收藏</span>
            <small>{Object.keys(folio).length}</small>
          </a>
        </div>
      </header>
      <div id="atlas-content" className="at-content" tabIndex={-1} ref={main}>
        {front && (
          <main>
            <div className="at-inner">
              <ExhibitHero
                shows={exhibitions}
                index={hero}
                select={selectHero}
                save={saveCrop}
              />
            </div>
            <div className="at-explore">
              <div className="at-inner at-explore-inner">
                <a href={"#exhibit/" + currentShow.id}>
                  <span className="at-explore-icon">
                    <BookOpen size={23} />
                  </span>
                  <div>
                    <b>跟随策展看</b>
                    <small>按展览顺序读作品</small>
                  </div>
                  <ArrowUpRight size={17} />
                </a>
                <a href="#compare">
                  <span className="at-explore-icon">
                    <Columns2 size={23} />
                  </span>
                  <div>
                    <b>把两幅图放在一起</b>
                    <small>并排放大，比较细节</small>
                  </div>
                  <ArrowUpRight size={17} />
                </a>
                <a href="#create">
                  <span className="at-explore-icon">
                    <PenTool size={23} />
                  </span>
                  <div>
                    <b>动手做一张</b>
                    <small>从可编辑的设计开始</small>
                  </div>
                  <ArrowUpRight size={17} />
                </a>
              </div>
            </div>
            <ArchiveIndex
              home
              filters={filters}
              change={changeFilters}
              folio={folio}
              toggle={toggle}
            />
            <section className="at-inner at-more-exhibits">
              <div className="at-sectionhead">
                <div>
                  <span className="at-over">EXHIBITIONS</span>
                  <h2>继续看展</h2>
                </div>
              </div>
              <div>
                {exhibitions
                  .filter((e) => e.id !== currentShow.id)
                  .map((e) => (
                    <a key={e.id} href={"#exhibit/" + e.id}>
                      <img src={e.works[0].thumb} alt="" />
                      <div>
                        <small>
                          专题 {e.number} · {e.works.length} 件作品
                        </small>
                        <h3>{e.title}</h3>
                        <p>{e.intro}</p>
                      </div>
                      <ArrowRight size={20} />
                    </a>
                  ))}
              </div>
            </section>
          </main>
        )}
        {route === "index" && (
          <main>
            <ArchiveIndex
              filters={filters}
              change={changeFilters}
              folio={folio}
              toggle={toggle}
            />
          </main>
        )}
        {route === "saved" && (
          <Saved
            folio={folio}
            toggle={toggle}
            note={(id, text) =>
              persist({ ...folio, [id]: { ...folio[id], note: text } })
            }
            notify={notify}
          />
        )}
        {route === "compare" && <AtlasCompare key={hash} ids={ids} />}
        {route === "exhibit" && currentExhibit && (
          <ExhibitionRoom
            key={currentExhibit.id}
            show={currentExhibit}
            saved={saved}
            toggle={toggle}
            save={saveCrop}
          />
        )}
        {route === "work" && selectedWork && (
          <WorkDetail
            key={selectedWork.id}
            work={selectedWork}
            save={(c) => saveCrop(selectedWork, c)}
            saved={saved(selectedWork.id)}
            toggle={() => toggle(selectedWork)}
            notify={notify}
            back={() => {
              location.hash = from.current.startsWith("work/")
                ? "index"
                : from.current;
            }}
          />
        )}
        {((route === "work" && !selectedWork) ||
          (route === "exhibit" && !currentExhibit)) && (
          <main className="at-inner at-empty">
            <h1>没有找到这个档案</h1>
            <a className="at-outline" href="#index">
              浏览作品索引
            </a>
          </main>
        )}
      </div>
      <footer className="at-footer at-inner">
        <Logo />
        <span>作品署名及图像使用信息见各件档案</span>
        <a href="#index">
          浏览索引 <ArrowUpRight size={14} />
        </a>
      </footer>
      <div role="status" className={message ? "at-toast" : "at-sr"}>
        {message && (
          <>
            <Check size={15} />
            {message}
          </>
        )}
      </div>
    </div>
  );
}
