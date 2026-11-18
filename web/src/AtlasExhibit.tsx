import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Scan,
} from "lucide-react";
import type { Crop, View } from "./atlas-crop";
import { Lightbox } from "./AtlasLens";
import { workLink, type Artwork, type Exhibition } from "./atlas-data";
export function ExhibitHero({
  shows,
  index,
  select,
  save,
}: {
  shows: Exhibition[];
  index: number;
  select: (i: number) => void;
  save: (w: Artwork, c: Crop) => void;
}) {
  const show = shows[index],
    art = show.works[0];
  const [spot, setSpot] = useState<{ name: string; view: View } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1, h: 1 });
  useLayoutEffect(() => {
    const el = frame.current!;
    const observer = new ResizeObserver(() =>
      setSize({ w: el.clientWidth, h: el.clientHeight }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const fit = Math.max(size.w / 2304, size.h / 1549),
    drawnWidth = 2304 * fit,
    drawnHeight = 1549 * fit;
  const tab = (d: number) => select((index + d + shows.length) % shows.length);
  return (
    <section className={"at-hero theme-" + show.id} aria-label="当期策展专题">
      <div className="at-hero-copy">
        <div className="at-over at-red">
          <i />
          线上特展 <span>/</span> EXHIBITION {show.number}
        </div>
        <h1>
          {show.lines.map((line, i) => (
            <span key={i}>{line}</span>
          ))}
        </h1>
        <p lang="en" className="at-hero-en">
          {show.english}
        </p>
        <p className="at-hero-intro">{show.intro}</p>
        <a className="at-ink" href={"#exhibit/" + show.id}>
          进入展览 <ArrowRight size={17} />
        </a>
        <div className="at-pager">
          <button aria-label="上一场展览" onClick={() => tab(-1)}>
            <ChevronLeft size={15} />
          </button>
          <span>
            {show.number}
            <em> / {String(shows.length).padStart(2, "0")}</em>
          </span>
          <button aria-label="下一场展览" onClick={() => tab(1)}>
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
      <figure className="at-feature-art">
        <div className="at-feature-frame" ref={frame}>
          <a href={workLink(art)} aria-label={"细读" + art.title}>
            <img
              key={art.id}
              fetchPriority="high"
              src={art.image}
              alt={art.title}
              style={{ objectPosition: show.focal ?? art.focal }}
            />
            <span className="at-plate-link">
              <Scan size={15} /> 细读原作
            </span>
          </a>
          {show.id === "ukiyo" && (
            <div className="at-hotspots" aria-label="策展人标注的局部">
              {[
                { name: "浪尖", x: 0.465, y: 0.255 },
                { name: "富士山", x: 0.635, y: 0.678 },
              ].map((h) => (
                <button
                  key={h.name}
                  className="at-hotspot"
                  style={{
                    left: (size.w - drawnWidth) * 0.42 + h.x * drawnWidth,
                    top: (size.h - drawnHeight) * 0.43 + h.y * drawnHeight,
                  }}
                  aria-label={"放大观察" + h.name}
                  onClick={() =>
                    setSpot({ name: h.name, view: { x: h.x, y: h.y, zoom: 3 } })
                  }
                >
                  <span>+</span>
                  <small>{h.name}</small>
                </button>
              ))}
            </div>
          )}
        </div>
        <figcaption>
          <span>
            <i /> {art.artist} <em>／</em> {art.title}
          </span>
          <span>{art.year}</span>
        </figcaption>
      </figure>
      {spot && (
        <Lightbox
          work={art}
          initial={spot.view}
          label={spot.name}
          close={() => setSpot(null)}
          save={(c) => save(art, c)}
        />
      )}
    </section>
  );
}
export function ExhibitionRoom({
  show,
  saved,
  toggle,
  save,
}: {
  show: Exhibition;
  saved: (id: string) => boolean;
  toggle: (w: Artwork) => void;
  save: (w: Artwork, c: Crop) => void;
}) {
  const [index, select] = useState(0),
    [playing, play] = useState(false),
    [zoom, setZoom] = useState(false);
  const w = show.works[index];
  function step(n: number) {
    play(false);
    select((index + n + show.works.length) % show.works.length);
  }
  useEffect(() => {
    if (!playing || zoom) return;
    const timer = setTimeout(() => {
      if (index + 1 >= show.works.length) play(false);
      else select(index + 1);
    }, 8000);
    return () => clearTimeout(timer);
  }, [playing, index, show, zoom]);
  return (
    <main className="at-room at-inner">
      <a className="at-back" href="#home">
        <ArrowLeft size={15} /> 返回展览现场
      </a>
      <div className="at-pagehead">
        <div>
          <span className="at-over at-red">
            EXHIBITION {show.number} / {show.works.length} 件作品
          </span>
          <h1>{show.title}</h1>
          <p>{show.intro}</p>
        </div>
        <button
          className="at-outline"
          aria-pressed={playing}
          onClick={() => {
            if (!playing && index === show.works.length - 1) select(0);
            play(!playing);
          }}
        >
          {playing ? <Pause size={15} /> : <Play size={15} />}{" "}
          {playing ? "暂停轮播" : "自动看展"}
        </button>
      </div>
      <div className="at-room-stage">
        <div className="at-room-img">
          <button
            aria-label={"放大" + w.title}
            onClick={() => {
              play(false);
              setZoom(true);
            }}
          >
            <img src={w.image} alt={w.title} />
            <span className="at-plate-link">
              <Scan size={15} /> 放大
            </span>
          </button>
        </div>
        <aside>
          <span className="at-over">
            展品 {String(index + 1).padStart(2, "0")} /{" "}
            {String(show.works.length).padStart(2, "0")}
          </span>
          <h2>{w.title}</h2>
          <p className="at-room-en">{w.originalTitle}</p>
          <p>{w.note}</p>
          <small>
            {w.artist}
            <br />
            {w.medium} · {w.collection}
          </small>
          <div className="at-actions">
            <a className="at-ink" href={workLink(w)}>
              作品档案 <ArrowUpRight size={16} />
            </a>
            <button
              className="at-outline"
              aria-pressed={saved(w.id)}
              onClick={() => toggle(w)}
            >
              {saved(w.id) ? <Check size={15} /> : <Bookmark size={15} />}{" "}
              {saved(w.id) ? "已收藏" : "收藏"}
            </button>
          </div>
          <div className="at-room-nav">
            <button onClick={() => step(-1)}>
              <ArrowLeft size={16} /> 上一件
            </button>
            <button onClick={() => step(1)}>
              下一件 <ArrowRight size={16} />
            </button>
          </div>
        </aside>
      </div>
      <div className="at-filmstrip" aria-label="展品目录">
        {show.works.map((o, i) => (
          <button
            key={o.id}
            className={i === index ? "current" : ""}
            onClick={() => {
              select(i);
              play(false);
            }}
            aria-pressed={i === index}
          >
            <img src={o.thumb} alt="" />
            <span>{o.title}</span>
          </button>
        ))}
      </div>
      {zoom && (
        <Lightbox
          work={w}
          close={() => setZoom(false)}
          save={(c) => save(w, c)}
        />
      )}
    </main>
  );
}
