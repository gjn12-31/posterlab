import { useEffect, useRef } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  FileUp,
  LayoutTemplate,
} from "lucide-react";
import PublishedKits from "./PublishedKits";
import { CampaignNav } from "./CampaignNav";
import { editions, editionHref, editionImage, type Edition } from "./editions";
import "./desktop.css";

const picks: Edition[] = ["vinyl", "bloom", "coffee"];
export default function StudioHome() {
  const scene = useRef<HTMLElement>(null);
  useEffect(() => {
    document.title = "PosterLab · 宣传设计工作室";
    window.scrollTo(0, 0);
  }, []);
  return (
    <div className="campaign ds-home">
      <CampaignNav active="desk" />
      <main>
        <section
          ref={scene}
          className="ds-stage"
          onPointerMove={(e) => {
            if (
              e.pointerType !== "mouse" ||
              window.matchMedia("(prefers-reduced-motion: reduce)").matches
            )
              return;
            const r = e.currentTarget.getBoundingClientRect();
            e.currentTarget.style.setProperty(
              "--dx",
              ((e.clientX - r.left) / r.width) * 16 - 8 + "px",
            );
            e.currentTarget.style.setProperty(
              "--dy",
              ((e.clientY - r.top) / r.height) * 10 - 5 + "px",
            );
          }}
          onPointerLeave={() => {
            scene.current?.style.setProperty("--dx", "0px");
            scene.current?.style.setProperty("--dy", "0px");
          }}
        >
          <img
            className="ds-prism"
            src={import.meta.env.BASE_URL + "studio/prism.webp"}
            alt=""
            fetchPriority="high"
          />
          <div className="ds-hero-inner">
            <p className="ds-over">
              <i /> 宣传设计工作室
            </p>
            <h1>
              论文宣传<span> /</span>
              <br />
              活动海报<span>。</span>
            </h1>
            <p className="ds-summary">
              把研究原文和活动通知，做成可以直接发布的文案与配图。
            </p>
            <div className="ds-start">
              <a href="#papers/import">
                <FileUp size={18} />
                导入科研论文 <ArrowUpRight size={17} />
              </a>
              <a href="#campaign">
                <LayoutTemplate size={18} />
                制作活动海报 <ArrowUpRight size={17} />
              </a>
            </div>
          </div>
        </section>
        <PublishedKits />
        <section className="ds-gallery">
          <div className="ds-gallery-head">
            <div>
              <p className="ds-over">
                <i /> 可编辑设计
              </p>
              <h2>从一张样张开始</h2>
            </div>
            <a href="#create">
              全部设计样张 <ArrowRight size={16} />
            </a>
          </div>
          <div className="ds-examples">
            {picks.map((id) => (
              <a
                key={id}
                className={"ds-example ds-" + id}
                href={editionHref(id, "portrait")}
              >
                <div className="ds-example-img">
                  <img src={editionImage(id)} alt="" loading="lazy" />
                  <span>{editions[id].wordmark}</span>
                </div>
                <div>
                  <small>{editions[id].category}</small>
                  <strong>{editions[id].name}</strong>
                  <ArrowUpRight size={20} />
                </div>
              </a>
            ))}
          </div>
        </section>
      </main>
      <footer className="ds-footer">
        <b>PosterLab</b>
        <a href="#exhibitions">
          <BookOpen size={15} />
          浏览灵感档案 <ArrowUpRight size={14} />
        </a>
      </footer>
    </div>
  );
}
