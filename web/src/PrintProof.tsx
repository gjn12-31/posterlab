import { useMemo, useRef, useEffect, useState } from "react";
import { Maximize2, X, ArrowUpRight } from "lucide-react";
import { createProject, formats, type Format } from "./model";
import { editionIds, editions, editionImage, type Edition } from "./editions";
import { loadFonts, renderPoster } from "./render";

type Props = {
  title: string;
  edition: Edition;
  format: Format;
  select: (id: Edition) => void;
  resize: (format: Format) => void;
  start: () => void;
};
export default function PrintProof({
  title,
  edition,
  format,
  select,
  resize,
  start,
}: Props) {
  const [zoom, setZoom] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const art = editions[edition];
  const [fontRevision, setFontRevision] = useState(0);
  useEffect(() => {
    let current = true;
    const content =
      title || editionIds.map((id) => editions[id].title).join("");
    loadFonts(content)
      .then(() => {
        if (current) setFontRevision((v) => v + 1);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [title]);
  const proofs = useMemo(() => {
    return editionIds.map((id) => {
      const project = createProject({
        title: title.trim() || editions[id].title,
        date: "",
        time: "",
        venue: "",
        speaker: "",
        description: "",
        cta: "",
      });
      project.id = "proof-" + id;
      project.current.edition = id;
      project.current.theme = editions[id].theme;
      return renderPoster(project, id === edition ? format : "portrait").svg;
    });
  }, [title, edition, format, fontRevision]);
  const index = editionIds.indexOf(edition);
  const proof = proofs[index];
  useEffect(() => {
    if (zoom) dialog.current?.showModal();
  }, [zoom]);
  const print = (
    <div
      className="proof-print"
      style={{
        aspectRatio: formats[format].width + "/" + formats[format].height,
      }}
      dangerouslySetInnerHTML={{ __html: proof }}
    />
  );
  return (
    <section className="proof-desk" aria-label="实时海报试印台">
      <div className="proof-stage" style={{ backgroundColor: art.mat }}>
        <img
          className="proof-backdrop"
          key={edition}
          alt=""
          src={editionImage(edition)}
        />
        <div className="proof-stage-head">
          <span>
            <i /> 实时试印
          </span>
          <button aria-label="放大试印稿" onClick={() => setZoom(true)}>
            <Maximize2 size={15} />
          </button>
        </div>
        {format === "portrait" &&
          [-1, 1].map((side) => {
            const i = (index + side + editionIds.length) % editionIds.length;
            return (
              <button
                key={editionIds[i]}
                className={
                  "proof-wing " + (side < 0 ? "wing-left" : "wing-right")
                }
                onClick={() => select(editionIds[i])}
                aria-label={"试印" + editions[editionIds[i]].name}
              >
                <span dangerouslySetInnerHTML={{ __html: proofs[i] }} />
              </button>
            );
          })}
        <div
          className={"proof-mount proof-" + format}
          key={edition + "-" + format}
        >
          {print}
        </div>
        <div className="proof-stage-foot">
          <span>{art.name}</span>
          <span>
            {formats[format].width} × {formats[format].height}
          </span>
        </div>
      </div>
      <div className="proof-toolbar">
        <div role="group" aria-label="主视觉系列">
          {editionIds.map((id) => (
            <button
              key={id}
              aria-label={editions[id].name}
              aria-pressed={edition === id}
              title={editions[id].name}
              onClick={() => select(id)}
            >
              <img alt="" src={editionImage(id)} />
            </button>
          ))}
        </div>
        <div className="proof-formats" role="group" aria-label="试印画幅">
          {(Object.keys(formats) as Format[]).map((f) => (
            <button
              key={f}
              aria-label={formats[f].name}
              aria-pressed={format === f}
              onClick={() => resize(f)}
            >
              {formats[f].ratio}
            </button>
          ))}
        </div>
      </div>
      {zoom && (
        <dialog
          ref={dialog}
          className="proof-dialog"
          aria-label="试印稿大图"
          onCancel={() => setZoom(false)}
          onClick={(e) => {
            if (e.target === dialog.current) setZoom(false);
          }}
        >
          <div className="proof-dialog-head">
            <b>{title.trim() || art.title}</b>
            <button aria-label="关闭大图" onClick={() => setZoom(false)}>
              <X size={18} />
            </button>
          </div>
          <div className="proof-lightbox">{print}</div>
          <button className="pl-primary" onClick={start}>
            编辑这张海报 <ArrowUpRight size={16} />
          </button>
        </dialog>
      )}
    </section>
  );
}
