import { useEffect, useRef, useState } from "react";
import { ChevronDown, GitFork, Layers3 } from "lucide-react";
import LandingShowcase from "./LandingShowcase";
import StudioWorkbench from "./StudioWorkbench";
import PublishedKits from "./PublishedKits";
import LandingResources from "./LandingResources";
import "./desktop.css";
import "./showcase.css";
import "./landing-shell.css";

const navigation = [
  { id: "demo", label: "产品演示" },
  { id: "collection", label: "案例" },
  { id: "faq", label: "常见问题" },
] as const;

const sectionIds = ["desk", "demo", "workbench", "collection", "faq", "about"];

function ProductMenu() {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (menu.current?.open && !menu.current.contains(event.target as Node))
        menu.current.open = false;
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape" || !menu.current?.open) return;
      menu.current.open = false;
      menu.current.querySelector("summary")?.focus();
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return (
    <details
      className="lp-product"
      ref={menu}
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget as Node)
        )
          event.currentTarget.open = false;
      }}
    >
      <summary>
        产品 <ChevronDown size={14} aria-hidden="true" />
      </summary>
      <div
        className="lp-product-links"
        onClick={() => {
          if (menu.current) menu.current.open = false;
        }}
      >
        <a href="#papers/import">论文宣传</a>
        <a href="#campaign">活动宣传</a>
        <a href="#studio">海报设计室</a>
        <a href="#create">设计样张</a>
        <a href="#exhibitions">灵感档案</a>
        <a href="?mode=templates#gallery">我的作品</a>
      </div>
    </details>
  );
}

export default function StudioHome() {
  const [active, setActive] = useState("desk");
  useEffect(() => {
    document.title = "PosterLab · 论文与活动宣传工作室";
    const targets = sectionIds.flatMap((id) => {
      const section = document.getElementById(id);
      return section ? [section] : [];
    });
    let frame = 0;
    function update() {
      frame = 0;
      const threshold = Math.min(215, innerHeight * 0.3);
      const current = targets
        .filter((el) => el.getBoundingClientRect().top <= threshold)
        .at(-1);
      setActive(current?.id || "desk");
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    function openSection() {
      const [id, entry] = location.hash.slice(1).split("/");
      if (id === "collection" && entry)
        document.getElementById(id)?.scrollIntoView({ behavior: "instant" });
    }
    const id = location.hash.slice(1).split("/")[0];
    if (id)
      targets
        .find((el) => el.id === id)
        ?.scrollIntoView({ behavior: "instant" });
    update();
    window.addEventListener("hashchange", openSection);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", openSection);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);
  return (
    <div className="pl-home lp-home">
      <header className="lp-topbar">
        <div className="pl-shell lp-topbar-inner">
          <a className="lp-wordmark" href="#desk" aria-label="PosterLab 首页">
            <span className="lp-mark">
              <Layers3 aria-hidden="true" size={22} strokeWidth={1.9} />
            </span>
            PosterLab
          </a>
          <nav className="lp-links" aria-label="首页导航">
            <ProductMenu />
            {navigation.map(({ id, label }) => (
              <a
                key={id}
                href={"#" + id}
                aria-current={active === id ? "location" : undefined}
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="lp-account">
            <a
              className="lp-repo"
              href="https://github.com/gjn12-31/posterlab"
              aria-label="在 GitHub 查看 PosterLab"
            >
              <GitFork size={17} aria-hidden="true" />
              <span>GitHub</span>
            </a>
            <a className="lp-start" href="#workbench">
              进入工作台
            </a>
          </div>
        </div>
      </header>
      <main>
        <LandingShowcase />
        <StudioWorkbench />
        <PublishedKits />
      </main>
      <LandingResources />
    </div>
  );
}
