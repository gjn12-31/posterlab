import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { editionIds, editions, editionImage, type Edition } from "./editions";
import { makeCover } from "./cover";
import { renderPoster, loadFonts } from "./render";
import { formats, type Format } from "./model";
import "./showroom.css";

export function startCover(id: Edition, format: Format, title?: string) {
  const params = new URLSearchParams({
    edition: id,
    format,
    title: title?.trim() || editions[id].title,
  });
  location.assign("?mode=templates#new?" + params);
}
const description: Record<Edition, string> = {
  afterglow: "在暗流与微光之间，捕捉水母的一瞬。",
  bloom: "让花瓣的褶皱与色彩，成为展览的开场。",
  vinyl: "让唱针落下，用深蓝与霓虹点亮午夜。",
  coffee: "以暖光和一杯咖啡，邀请人们在周末相遇。",
};
const cardOrder: Edition[] = ["bloom", "vinyl", "coffee", "afterglow"];
export default function Showroom() {
  const [index, setIndex] = useState(0);
  const [tryTitle, setTryTitle] = useState(false);
  const [title, setTitle] = useState(() => {
    try {
      return localStorage.getItem("posterlab.discovery.title") ?? "";
    } catch {
      return "";
    }
  });
  const [format, setFormat] = useState<Format>("portrait");
  const [loaded, setLoaded] = useState(false);
  const id = editionIds[index],
    art = editions[id];
  useEffect(() => {
    let active = true;
    loadFonts()
      .then(() => {
        if (active) setLoaded(true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const cards = useMemo(
    () =>
      cardOrder.map((id) => {
        const p = makeCover(id, tryTitle ? title : undefined);
        p.id = "gallery-" + id;
        return renderPoster(p, tryTitle ? format : "portrait").svg;
      }),
    [title, tryTitle, format, loaded],
  );
  function cycle(delta: number) {
    setIndex((n) => (n + delta + editionIds.length) % editionIds.length);
  }
  return (
    <>
      <section
        className={"sr-feature sr-" + id}
        aria-label="本期精选模板"
        style={{ "--tone": art.color } as CSSProperties}
      >
        <img
          className="sr-feature-photo"
          key={id}
          src={editionImage(id)}
          fetchPriority="high"
          alt=""
        />
        <div className="sr-veil" />
        <div className="sr-feature-inner">
          <div className="sr-edition">
            <i /> 本期精选 <span /> FEATURED EDITION
          </div>
          <div className="sr-copy" aria-live="polite">
            <h1 lang="en">{art.wordmark}</h1>
            <h2>
              {art.title}
              <span>{art.category}</span>
            </h2>
            <p>{description[id]}</p>
            <div className="sr-actions">
              <button onClick={() => startCover(id, "landscape")}>
                使用这张模板 <ArrowUpRight size={19} />
              </button>
              <a href="#templates">
                浏览模板 <ArrowDown size={15} />
              </a>
            </div>
          </div>
          <div className="sr-switch" aria-label="切换精选作品">
            <span className="sr-index">
              {String(index + 1).padStart(2, "0")}
              <small> / 04</small>
            </span>
            <button onClick={() => cycle(-1)} aria-label="上一张精选模板">
              <ChevronLeft />
            </button>
            <button onClick={() => cycle(1)} aria-label="下一张精选模板">
              <ChevronRight />
            </button>
          </div>
        </div>
      </section>
      <section
        className="sr-library"
        id="templates"
        aria-labelledby="sr-library-title"
      >
        <div className="pl-shell">
          <div className="sr-library-head">
            <div>
              <p className="sr-eyebrow">EDITABLE COLLECTION</p>
              <h2 id="sr-library-title">模板精选</h2>
            </div>
            <button
              className="sr-try"
              aria-expanded={tryTitle}
              onClick={() => setTryTitle((v) => !v)}
            >
              {tryTitle ? <X size={15} /> : <SlidersHorizontal size={15} />}{" "}
              试排我的标题
            </button>
          </div>
          {tryTitle && (
            <div className="sr-proof">
              <label>
                海报标题
                <input
                  autoFocus
                  maxLength={180}
                  placeholder="输入标题，同时看四种设计"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    try {
                      localStorage.setItem(
                        "posterlab.discovery.title",
                        e.target.value,
                      );
                    } catch {}
                  }}
                />
              </label>
              <label>
                画幅
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as Format)}
                >
                  {(Object.keys(formats) as Format[]).map((f) => (
                    <option key={f} value={f}>
                      {formats[f].name} · {formats[f].ratio}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <div className="sr-cards">
            {cardOrder.map((id, i) => (
              <button
                key={id}
                className="sr-card"
                aria-label={"使用" + editions[id].name + "模板"}
                onClick={() =>
                  startCover(
                    id,
                    tryTitle ? format : "portrait",
                    tryTitle ? title : undefined,
                  )
                }
              >
                <div
                  className="sr-card-mat"
                  style={{ background: editions[id].mat }}
                >
                  <div
                    className="sr-card-sheet"
                    dangerouslySetInnerHTML={{ __html: cards[i] }}
                  />
                </div>
                <div className="sr-card-caption">
                  <div>
                    <b>{editions[id].name}</b>
                    <small>
                      {editions[id].category} ·{" "}
                      {formats[tryTitle ? format : "portrait"].ratio}
                    </small>
                  </div>
                  <ArrowRight size={18} />
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
