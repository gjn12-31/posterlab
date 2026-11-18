import { FolderOpen, Layers3 } from "lucide-react";
import "./campaign.css";
import "./desktop.css";
export function CampaignNav({
  active,
  onPapers,
}: {
  onPapers?: () => void;
  active: "home" | "create" | "papers" | "desk";
}) {
  return (
    <header className="cp-nav pl-toolnav">
      <div className="cp-shell">
        <a className="cp-logo" href="#desk" aria-label="PosterLab 工作台首页">
          <span>
            <Layers3 size={24} />
          </span>
          PosterLab
        </a>
        <nav aria-label="主导航">
          <a
            href="#workbench"
            aria-current={active === "desk" ? "page" : undefined}
          >
            工作台
          </a>
          <a
            href="#campaign"
            aria-current={active === "home" ? "page" : undefined}
          >
            活动宣传
          </a>
          <a
            href="#papers"
            aria-current={active === "papers" ? "page" : undefined}
          >
            论文宣传
          </a>
          <a
            href="#create"
            aria-current={active === "create" ? "page" : undefined}
          >
            设计样张
          </a>
        </nav>
        {onPapers ? (
          <button
            className="cp-projects pr-library-link"
            title="我的论文"
            onClick={onPapers}
          >
            <FolderOpen size={16} />
            我的论文
          </button>
        ) : (
          <a className="cp-projects" href="?mode=templates#gallery">
            <FolderOpen size={16} />
            我的作品
          </a>
        )}
      </div>
    </header>
  );
}
