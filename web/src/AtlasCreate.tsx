import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  FolderOpen,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { editionIds, editions, editionHref, type Edition } from "./editions";
import { makeCover } from "./cover";
import { renderPoster, loadFonts } from "./render";
import { formats, type Format } from "./model";
import { STATIC_DEMO } from "./studio-api";
import { CampaignNav } from "./CampaignNav";
import "./atlas.css";
export default function AtlasCreate() {
  const [title, setTitle] = useState(() => {
    try {
      return localStorage.getItem("posterlab.discovery.title") ?? "";
    } catch {
      return "";
    }
  });
  const [format, setFormat] = useState<Format>("portrait"),
    [custom, setCustom] = useState(false),
    [fonts, setFonts] = useState(false);
  useEffect(() => {
    document.title = "设计样张 · PosterLab";
    window.scrollTo(0, 0);
    let current = true;
    loadFonts()
      .then(() => {
        if (current) setFonts(true);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, []);
  const previews = useMemo(
    () =>
      editionIds.map((id) => {
        const p = makeCover(id, custom ? title : undefined);
        p.id = "create-" + id;
        return renderPoster(p, format).svg;
      }),
    [format, custom, title, fonts],
  );
  function href(id: Edition) {
    return editionHref(id, format, custom ? title : undefined);
  }
  return (
    <>
      <div className="campaign cp-navwrap">
        <CampaignNav active="create" />
      </div>
      <div className="atlas">
        <main className="at-inner at-create">
          <div className="at-pagehead">
            <div>
              <h1>设计样张</h1>
              <p>
                点开一张样张就能改字、拖动图层和导出。也可以先用自己的标题试排。
              </p>
            </div>
            <a className="at-outline" href="?mode=templates#gallery">
              <FolderOpen size={16} /> 已保存的创作
            </a>
          </div>
          <div className="at-createbar">
            <button
              className="at-soft"
              aria-expanded={custom}
              onClick={() => setCustom(!custom)}
            >
              <SlidersHorizontal size={15} />
              试排我的标题
            </button>
            <div className="at-filters" aria-label="创作画幅">
              {(Object.keys(formats) as Format[]).map((f) => (
                <button
                  key={f}
                  aria-pressed={format === f}
                  onClick={() => setFormat(f)}
                >
                  {formats[f].ratio}
                </button>
              ))}
            </div>
          </div>
          {custom && (
            <label className="at-title-input">
              海报标题
              <input
                autoFocus
                maxLength={180}
                placeholder="输入一次，预览全部样张"
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
          )}
          <div className="at-creategrid">
            {editionIds.map((id, i) => (
              <a
                className="at-createcard"
                href={href(id)}
                key={id}
                aria-label={"编辑" + editions[id].name}
              >
                <div
                  className="at-proofmat"
                  style={{ background: editions[id].mat }}
                >
                  <div
                    className="at-proof"
                    dangerouslySetInnerHTML={{ __html: previews[i] }}
                  />
                </div>
                <small>{editions[id].category}</small>
                <h2>{editions[id].name}</h2>
                <span>
                  打开画布 <ArrowUpRight size={15} />
                </span>
              </a>
            ))}
          </div>
          <div className="at-aux">
            <Sparkles size={19} />
            <div>
              <b>{STATIC_DEMO ? "AI 创作案例" : "AI 辅助创作"}</b>
              <p>
                {STATIC_DEMO
                  ? "查看已生成的海报、版本和设计记录。"
                  : "已有设计需求时，可以把简报带入对话，生成或修改作品。编辑器内也可以单独润色文字。"}
              </p>
            </div>
            <a className="at-outline" href="#studio">
              {STATIC_DEMO ? "查看案例" : "打开 AI 工作台"}
              <ArrowRight size={15} />
            </a>
          </div>
        </main>
      </div>
    </>
  );
}
