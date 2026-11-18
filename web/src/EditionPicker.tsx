import { useEffect, useId, useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { makeCover } from "./cover";
import { editionHref, editions, type Edition } from "./editions";
import { loadFonts, renderPoster } from "./render";
import "./edition-picker.css";

const sceneEditions: readonly Edition[] = [
  "coffee",
  "vinyl",
  "launch",
  "bloom",
  "course",
  "nature",
];

export default function EditionPicker() {
  const uid = useId();
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    let alive = true;
    loadFonts()
      .then(() => {
        if (alive) setFontsReady(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const posters = useMemo(
    () =>
      sceneEditions.map((id) => {
        const p = makeCover(id);
        p.id = "picker-" + uid.replace(/[^a-z0-9-]/gi, "") + "-" + id;
        return { id, svg: renderPoster(p, "portrait").svg };
      }),
    [uid, fontsReady],
  );
  return (
    <div className="ed-picker">
      {posters.map(({ id, svg }) => {
        const art = editions[id];
        return (
          <a
            key={id}
            className="ed-card"
            href={editionHref(id)}
            aria-label={"打开" + art.name + "编辑画布"}
          >
            <div
              className="ed-proof"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <strong>{art.name}</strong>
            <span>{art.category}</span>
            <span className="ed-action">
              打开画布 <ArrowUpRight size={15} />
            </span>
          </a>
        );
      })}
    </div>
  );
}
