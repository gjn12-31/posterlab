import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  FolderOpen,
  Layers3,
  PanelsTopLeft,
  SwatchBook,
} from "lucide-react";
import PosterWall from "./PosterWall";
import PublishedKits from "./PublishedKits";
import StudioWorkbench from "./StudioWorkbench";
import "./desktop.css";
import "./showcase.css";

const sections = [
  { id: "desk", label: "概览" },
  { id: "workbench", label: "工作台" },
  { id: "collection", label: "作品选集" },
] as const;

function Brand() {
  return (
    <span className="pl-brand">
      <Layers3 aria-hidden="true" />
      PosterLab
    </span>
  );
}

export default function StudioHome() {
  const [active, setActive] = useState("desk");
  useEffect(() => {
    document.title = "PosterLab · 论文与活动宣传工作室";
    const targets = sections.map(({ id }) => document.getElementById(id)!);
    let frame = 0;
    function update() {
      frame = 0;
      const current = targets
        .filter(
          (el) =>
            el.getBoundingClientRect().top <= Math.min(220, innerHeight * 0.35),
        )
        .at(-1);
      setActive(current?.id || "desk");
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    function jumpToCase() {
      if (location.hash.startsWith("#collection/"))
        document
          .getElementById("collection")
          ?.scrollIntoView({ behavior: "instant" });
    }
    const id = location.hash.slice(1).split("/")[0];
    if (id)
      targets
        .find((el) => el.id === id)
        ?.scrollIntoView({ behavior: "instant" });
    update();
    window.addEventListener("hashchange", jumpToCase);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", jumpToCase);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return (
    <div className="pl-home">
      <header className="pl-masthead">
        <div className="pl-shell pl-bar">
          <a
            className="pl-corner-brand"
            href="#desk"
            aria-label="PosterLab 首页"
          >
            <Brand />
          </a>
          <nav className="pl-dock" aria-label="首页导航">
            {sections.map((s) => (
              <a
                key={s.id}
                href={"#" + s.id}
                aria-current={active === s.id ? "location" : undefined}
              >
                {s.label}
              </a>
            ))}
          </nav>
          <a className="pl-personal" href="?mode=templates#gallery">
            <FolderOpen size={16} /> 我的作品
          </a>
        </div>
      </header>
      <main>
        <section className="pl-intro" id="desk" aria-labelledby="pl-purpose">
          <div className="pl-intro-shell pl-shell">
            <div className="pl-intro-story">
              <h1 id="pl-purpose">
                <span className="pl-name" lang="en">
                  Poster<span>Lab</span>
                </span>
                <strong>论文与活动宣传工作室</strong>
              </h1>
              <p>把论文和活动通知做成适合各平台的文案与海报。</p>
              <div className="pl-hero-actions">
                <a className="pl-down" href="#workbench">
                  探索工作台 <ArrowDown size={17} />
                </a>
                <a href="#collection">
                  看成品 <ArrowUpRight size={17} />
                </a>
              </div>
            </div>
            <PosterWall />
          </div>
        </section>
        <StudioWorkbench />
        <PublishedKits />
      </main>
      <footer className="pl-footer pl-shell">
        <a href="#desk" aria-label="回到首页">
          <Brand />
        </a>
        <nav aria-label="更多设计工具">
          <a href="#studio">
            <PanelsTopLeft size={16} />
            海报设计室
          </a>
          <a href="#create">
            <SwatchBook size={16} />
            设计样张
          </a>
          <a href="?mode=templates#gallery">
            <FolderOpen size={16} />
            我的作品
          </a>
          <a href="#exhibitions">
            灵感档案 <ArrowUpRight size={15} />
          </a>
        </nav>
      </footer>
    </div>
  );
}
