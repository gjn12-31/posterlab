import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  Columns2,
  Copy,
  Scan,
} from "lucide-react";
import { compareLink, works, type Artwork } from "./atlas-data";
import type { Crop } from "./atlas-crop";
import { Lightbox } from "./AtlasLens";
export function WorkDetail({
  work: w,
  saved,
  toggle,
  notify,
  back,
  save,
}: {
  save: (c: Crop) => void;
  work: Artwork;
  saved: boolean;
  toggle: () => void;
  notify: (s: string) => void;
  back: () => void;
}) {
  const [zoom, setZoom] = useState(false);
  const other =
    works.find((o) => o.id !== w.id && o.medium === w.medium) ??
    works.find((o) => o.id !== w.id)!;
  async function copy(color: string) {
    try {
      await navigator.clipboard.writeText(color);
      notify("已复制色值 " + color);
    } catch {
      notify("色值 " + color + "，可从下方文字中复制");
    }
  }
  return (
    <main className="at-inner at-detail">
      <button className="at-back" onClick={back}>
        <ArrowLeft size={15} /> 返回浏览
      </button>
      <div className="at-detail-grid">
        <figure className="at-original">
          <button aria-label={"放大" + w.title} onClick={() => setZoom(true)}>
            <img src={w.image} alt={w.title} />
            <span className="at-plate-link">
              <Scan size={15} /> 高清看图
            </span>
          </button>
          <figcaption>
            {w.collection}{" "}
            <a href={w.sourceUrl} target="_blank" rel="noreferrer">
              馆方来源 <ArrowUpRight size={13} />
            </a>
          </figcaption>
        </figure>
        <article>
          <span className="at-over at-red">作品档案 / {w.medium}</span>
          <h1>{w.title}</h1>
          <p className="at-original-title">{w.originalTitle}</p>
          <div className="at-actions">
            <button className="at-ink" aria-pressed={saved} onClick={toggle}>
              {saved ? <Check size={17} /> : <Bookmark size={17} />}{" "}
              {saved ? "已加入收藏" : "收藏作品"}
            </button>
            <a className="at-outline" href={compareLink(w, other)}>
              <Columns2 size={16} /> 并排对照
            </a>
          </div>
          <h2>怎么看这件作品</h2>
          <p className="at-reading">{w.note}</p>
          <dl>
            {[
              ["创作者", w.artist],
              ["年代 / 系列", w.year],
              ["媒介", w.medium],
              ["来源", w.collection],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <h2>
            画面配色 <small>点击复制色值</small>
          </h2>
          <div className="at-palette">
            {w.colors.map((c, i) => (
              <button
                key={i}
                aria-label={"复制色值 " + c}
                onClick={() => copy(c)}
              >
                <i style={{ background: c }} />
                <small>{c.toUpperCase()}</small>
              </button>
            ))}
          </div>
          <a
            className="at-link"
            href={w.rightsUrl}
            target="_blank"
            rel="noreferrer"
          >
            {w.rights} <ArrowUpRight size={14} />
          </a>
        </article>
      </div>
      {zoom && <Lightbox work={w} close={() => setZoom(false)} save={save} />}
    </main>
  );
}
