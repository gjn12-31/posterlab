import { useState } from "react";
import { Link as LinkIcon, Unlink, ArrowUpRight } from "lucide-react";
import { works, findWork, workLink } from "./atlas-data";
import { Lens, ZoomTools, fullView, type View } from "./AtlasLens";
export default function AtlasCompare({ ids }: { ids: string[] }) {
  const first = findWork(ids[0]) ?? works[0],
    second =
      (findWork(ids[1])?.id !== first.id && findWork(ids[1])) ||
      works.find((w) => w.id !== first.id)!;
  const [linked, setLinked] = useState(true),
    [views, setViews] = useState<[View, View]>([fullView, fullView]);
  function change(i: number, v: View) {
    setViews((old) => (linked ? [v, v] : i === 0 ? [v, old[1]] : [old[0], v]));
  }
  function choose(i: number, id: string) {
    const other = i === 0 ? second : first;
    const next = i === 0 ? [id, other.id] : [other.id, id];
    location.hash = "compare/" + next.join("/");
  }
  return (
    <main className="at-inner at-compare">
      <div className="at-pagehead">
        <div>
          <span className="at-over">COMPARISON TABLE</span>
          <h1>双联对照台</h1>
          <p>各选一件作品，放大并拖动细节。联动开启时，两侧会一起移动。</p>
        </div>
        <button
          className="at-outline"
          aria-pressed={linked}
          onClick={() => {
            if (!linked) setViews([views[0], views[0]]);
            setLinked(!linked);
          }}
        >
          {linked ? <LinkIcon size={16} /> : <Unlink size={16} />}{" "}
          {linked ? "联动已开启" : "联动已关闭"}
        </button>
      </div>
      <div className="at-pair">
        {[first, second].map((w, i) => (
          <section key={i}>
            <div className="at-pair-head">
              <label>
                {i === 0 ? "左侧作品" : "右侧作品"}
                <select
                  aria-label={i === 0 ? "左侧作品" : "右侧作品"}
                  value={w.id}
                  onChange={(e) => choose(i, e.target.value)}
                >
                  {works
                    .filter((o) => o.id !== (i === 0 ? second : first).id)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.title}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <Lens work={w} view={views[i]} change={(v) => change(i, v)} />
            <div className="at-pair-controls">
              <ZoomTools view={views[i]} change={(v) => change(i, v)} />
            </div>
            <small>{w.medium}</small>
            <h2>{w.title}</h2>
            <p>
              {w.artist} · {w.year}
            </p>
            <div className="at-pair-palette">
              {w.colors.map((c, k) => (
                <span key={k} style={{ background: c }} title={c} />
              ))}
            </div>
            <p>{w.note}</p>
            <a className="at-link" href={workLink(w)}>
              查看档案 <ArrowUpRight size={14} />
            </a>
          </section>
        ))}
      </div>
    </main>
  );
}
