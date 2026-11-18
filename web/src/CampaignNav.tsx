import { FolderOpen, Layers2 } from "lucide-react";
import "./campaign.css";
export function CampaignNav({ active }: { active: "home" | "create" }) {
  return (
    <header className="cp-nav">
      <div className="cp-shell">
        <a className="cp-logo" href="#home" aria-label="PosterLab 活动宣传首页">
          <span>
            <Layers2 size={24} />
          </span>
          PosterLab
        </a>
        <nav aria-label="主导航">
          <a href="#home" aria-current={active === "home" ? "page" : undefined}>
            宣传制作台
          </a>
          <a
            href="#create"
            aria-current={active === "create" ? "page" : undefined}
          >
            设计样张
          </a>
        </nav>
        <a className="cp-projects" href="?mode=templates#gallery">
          <FolderOpen size={16} />
          我的作品
        </a>
      </div>
    </header>
  );
}
