import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  FolderOpen,
  Layers3,
  PanelsTopLeft,
  SwatchBook,
} from "lucide-react";
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
  const intro = useRef<HTMLElement>(null);
  const [active, setActive] = useState("desk");
  const [compact, setCompact] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    document.title = "PosterLab · 论文与活动宣传工作室";
    const hero = intro.current!;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const targets = sections.map(({ id }) => document.getElementById(id)!);
    let frame = 0;
    let lastY = window.scrollY;
    let highest = lastY;
    let lowest = lastY;
    function update() {
      frame = 0;
      const y = Math.max(0, window.scrollY);
      const height = hero.offsetHeight || 1;
      const progress = Math.min(1, y / height);
      hero.style.setProperty(
        "--scroll",
        reduced.matches ? "0" : progress.toFixed(3),
      );
      setCompact(y > Math.min(500, height * 0.62));
      if (reduced.matches || y < height + 180) setHidden(false);
      else if (y > lastY && y - lowest > 70) setHidden(true);
      else if (y < lastY && highest - y > 30) setHidden(false);
      if (y > lastY) highest = y;
      if (y < lastY) lowest = y;
      lastY = y;
      const current = targets
        .filter((el) => el.getBoundingClientRect().top <= innerHeight * 0.36)
        .at(-1);
      setActive(current?.id || "desk");
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    const destination = targets.find((el) => "#" + el.id === location.hash);
    if (destination) destination.scrollIntoView({ behavior: "instant" });
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    reduced.addEventListener("change", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      reduced.removeEventListener("change", schedule);
    };
  }, []);

  return (
    <div className="pl-home">
      <header
        className={
          "pl-masthead" +
          (compact ? " is-compact" : "") +
          (hidden ? " is-hidden" : "")
        }
      >
        <a
          className="pl-corner-brand"
          href="#desk"
          aria-label="PosterLab 首页"
          tabIndex={compact ? -1 : 0}
        >
          <Brand />
        </a>
        <nav className="pl-dock" aria-label="首页导航">
          <span className="pl-dock-mark" aria-hidden="true">
            <Layers3 size={23} />
          </span>
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
        <a
          className="pl-personal"
          href="?mode=templates#gallery"
          tabIndex={compact ? -1 : 0}
        >
          <FolderOpen size={16} /> 我的作品
        </a>
      </header>
      <main>
        <section
          className="pl-intro"
          id="desk"
          ref={intro}
          aria-labelledby="pl-purpose"
        >
          <div className="pl-intro-shell pl-shell">
            <div className="pl-intro-story">
              <h1 id="pl-purpose">
                <span lang="en">PosterLab</span>
                <strong>论文与活动宣传工作室</strong>
              </h1>
              <p>从一篇论文到图解长帖，从一场活动到整套宣传计划。</p>
              <div className="pl-hero-actions">
                <a className="pl-down" href="#workbench">
                  探索工作台 <ArrowDown size={17} />
                </a>
                <a href="#collection">
                  看成品 <ArrowUpRight size={17} />
                </a>
              </div>
            </div>
            <div
              className="pl-visual"
              aria-hidden="true"
              onPointerMove={(event) => {
                if (
                  event.pointerType !== "mouse" ||
                  matchMedia("(prefers-reduced-motion: reduce)").matches
                )
                  return;
                const node = event.currentTarget,
                  rect = node.getBoundingClientRect();
                node.style.setProperty(
                  "--tilt-x",
                  ((event.clientX - rect.left) / rect.width - 0.5).toFixed(2),
                );
                node.style.setProperty(
                  "--tilt-y",
                  ((event.clientY - rect.top) / rect.height - 0.5).toFixed(2),
                );
              }}
              onPointerLeave={(event) => {
                event.currentTarget.style.removeProperty("--tilt-x");
                event.currentTarget.style.removeProperty("--tilt-y");
              }}
            >
              <img
                src={import.meta.env.BASE_URL + "showcase/print-prism.webp"}
                width="1060"
                height="1060"
                fetchPriority="high"
                alt=""
                draggable={false}
              />
            </div>
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
