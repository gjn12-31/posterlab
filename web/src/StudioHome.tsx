import { useEffect, useRef } from "react";
import { ArrowDown, ArrowUpRight, Layers3 } from "lucide-react";
import PublishedKits from "./PublishedKits";
import "./desktop.css";
import "./showcase.css";

const art = import.meta.env.BASE_URL + "showcase/";

function Brand() {
  return (
    <span className="pl-brand">
      <Layers3 aria-hidden="true" />
      PosterLab
    </span>
  );
}

const desks = [
  {
    name: "论文宣传",
    action: "导入论文 PDF",
    url: "#papers/import",
    summary: "一篇论文，四个平台的文案与配图。",
    theme: "research",
    images: ["ponder-portrait", "ponder-wide"],
  },
  {
    name: "活动宣传",
    action: "制作活动海报",
    url: "#campaign",
    summary: "一条活动通知，三种画幅的海报。",
    theme: "event",
    images: ["coffee-portrait", "coffee-square"],
  },
] as const;

export default function StudioHome() {
  const intro = useRef<HTMLElement>(null);
  const desk = useRef<HTMLElement>(null);
  useEffect(() => {
    document.title = "PosterLab · 论文与活动宣传设计工作室";
    const mast = intro.current!;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    function paintScroll() {
      frame = 0;
      if (motion.matches) {
        mast.style.removeProperty("--progress");
        return;
      }
      const height = mast.offsetHeight || 1;
      const progress = Math.min(
        1,
        Math.max(0, -mast.getBoundingClientRect().top / height),
      );
      mast.style.setProperty("--progress", progress.toFixed(4));
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(paintScroll);
    }
    // Hash routes mount lazily. Restore deep links once their target exists.
    if (location.hash === "#workbench")
      desk.current?.scrollIntoView({ behavior: "instant" });
    else if (location.hash === "#desk")
      window.scrollTo({ top: 0, behavior: "instant" });
    paintScroll();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    motion.addEventListener("change", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      motion.removeEventListener("change", schedule);
    };
  }, []);

  return (
    <div className="pl-home">
      <main>
        <section
          className="pl-intro"
          id="desk"
          ref={intro}
          aria-labelledby="pl-purpose"
        >
          <header className="pl-masthead">
            <Brand />
          </header>
          <div className="pl-visual" aria-hidden="true">
            <img
              src={art + "paper-sculpture.webp"}
              width="1536"
              height="1024"
              alt=""
              fetchPriority="high"
              draggable={false}
            />
          </div>
          <h1 id="pl-purpose">
            <span>把论文和活动</span>
            <span>做成文案与海报。</span>
          </h1>
          <a className="pl-down" href="#workbench">
            <span>
              <ArrowDown aria-hidden="true" />
            </span>{" "}
            下滑进入工作台
          </a>
        </section>

        <section
          className="pl-work pl-shell"
          id="workbench"
          ref={desk}
          aria-labelledby="pl-work-heading"
          tabIndex={-1}
        >
          <div className="pl-heading">
            <h2 id="pl-work-heading">工作台</h2>
            <nav aria-label="创作导航">
              <a href="#create">
                设计样张 <ArrowUpRight />
              </a>
              <a href="?mode=templates#gallery">
                我的作品 <ArrowUpRight />
              </a>
            </nav>
          </div>
          <div className="pl-desks">
            {desks.map(({ name, action, url, summary, theme, images }) => (
              <a
                key={theme}
                className={"pl-desk pl-" + theme}
                href={url}
                aria-label={action}
              >
                <div className="pl-stage" aria-hidden="true">
                  <img
                    className="pl-back"
                    src={art + images[1] + ".webp"}
                    alt=""
                    loading="lazy"
                  />
                  <img
                    className="pl-front"
                    src={art + images[0] + ".webp"}
                    alt=""
                    loading="lazy"
                  />
                </div>
                <div className="pl-desk-info">
                  <div>
                    <h3>{name}</h3>
                    <p>{summary}</p>
                  </div>
                  <span className="pl-open">
                    {action} <ArrowUpRight aria-hidden="true" />
                  </span>
                </div>
              </a>
            ))}
          </div>
        </section>
        <PublishedKits />
      </main>
      <footer className="pl-footer pl-shell">
        <a href="#desk" aria-label="回到首页">
          <Brand />
        </a>
        <a href="#exhibitions">
          浏览灵感档案 <ArrowUpRight />
        </a>
      </footer>
    </div>
  );
}
