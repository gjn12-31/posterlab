import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Upload } from "lucide-react";
import type { Paper } from "./paper-model";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
type Point = { x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };
const full: Box = { x: 0, y: 0, w: 1, h: 1 };
export default function PaperFigure({
  file,
  apply,
}: {
  file?: File;
  apply: (figure: NonNullable<Paper["figure"]>) => void;
}) {
  const [input, setInput] = useState(file),
    [page, setPage] = useState(1),
    [count, setCount] = useState(0),
    [crop, setCrop] = useState<Box>(full),
    [credit, setCredit] = useState(""),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState("");
  const [pdf, setPdf] = useState<PDFDocumentProxy>(),
    [bitmap, setBitmap] = useState<ImageBitmap>(),
    canvas = useRef<HTMLCanvasElement>(null),
    anchor = useRef<Point | null>(null);
  useEffect(() => {
    setLoaded(false);
    setCrop(full);
    setPage(1);
    setCount(0);
    setPdf(undefined);
    setBitmap(undefined);
    setError("");
    setCredit("");
    if (!input) return;
    let live = true,
      task: PDFDocumentLoadingTask | undefined,
      img: ImageBitmap | undefined;
    (async () => {
      if (input.size > 40 * 1024 * 1024)
        throw Error("请选择 40 MB 以内的文件。");
      if (/\.pdf$/i.test(input.name)) {
        task = await (await import("./paper-pdf")).openPdf(input);
        if (!live) {
          await task.destroy();
          return;
        }
        const doc = await task.promise;
        if (live) {
          setPdf(doc);
          setCount(doc.numPages);
        }
      } else if (/^image\/(?:png|jpeg|webp)$/.test(input.type)) {
        img = await createImageBitmap(input);
        if (live) {
          setBitmap(img);
          setCredit(input.name);
        } else img.close();
      } else throw Error("请使用 PDF、PNG、JPEG 或 WebP。");
    })().catch((e) => {
      if (live) setError((e as Error).message);
    });
    return () => {
      live = false;
      task?.destroy().catch(() => {});
      img?.close();
    };
  }, [input]);
  useEffect(() => {
    let live = true,
      cancel: (() => void) | undefined;
    setLoaded(false);
    setCrop(full);
    setError("");
    anchor.current = null;
    if (!pdf && !bitmap) return;
    (async () => {
      // Render offscreen, so switching pages never replaces the current preview with a late result.
      const off = document.createElement("canvas");
      if (pdf) {
        const pg = await pdf.getPage(page);
        if (!live) return;
        const base = pg.getViewport({ scale: 1 }),
          viewport = pg.getViewport({
            scale: Math.min(2.5, 1800 / Math.max(base.width, base.height)),
          });
        off.width = Math.ceil(viewport.width);
        off.height = Math.ceil(viewport.height);
        const job = pg.render({ canvas: off, viewport });
        cancel = () => job.cancel();
        await job.promise;
        if (live)
          setCredit(
            (input?.name.replace(/\.pdf$/i, "") || "论文") +
              " · 第 " +
              page +
              " 页",
          );
      } else if (bitmap) {
        const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
        off.width = Math.max(1, Math.round(bitmap.width * scale));
        off.height = Math.max(1, Math.round(bitmap.height * scale));
        const ctx = off.getContext("2d")!;
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, off.width, off.height);
        ctx.drawImage(bitmap, 0, 0, off.width, off.height);
      }
      if (!live || !canvas.current) return;
      const out = canvas.current;
      out.width = off.width;
      out.height = off.height;
      out.getContext("2d")!.drawImage(off, 0, 0);
      setLoaded(true);
    })().catch((e) => {
      if (live) setError((e as Error).message);
    });
    return () => {
      live = false;
      cancel?.();
    };
  }, [pdf, page, bitmap]);
  function point(e: PointerEvent<HTMLDivElement>): Point {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  }
  function select(e: PointerEvent<HTMLDivElement>) {
    const a = anchor.current;
    if (!a) return;
    const b = point(e);
    setCrop({
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(a.x - b.x),
      h: Math.abs(a.y - b.y),
    });
  }
  function finish() {
    const src = canvas.current;
    if (!src) return;
    const out = document.createElement("canvas");
    const w = src.width * crop.w,
      h = src.height * crop.h;
    const scale = Math.min(1, 1500 / Math.max(w, h));
    out.width = Math.max(1, Math.round(w * scale));
    out.height = Math.max(1, Math.round(h * scale));
    out
      .getContext("2d")!
      .drawImage(
        src,
        src.width * crop.x,
        src.height * crop.y,
        w,
        h,
        0,
        0,
        out.width,
        out.height,
      );
    const data = out.toDataURL("image/jpeg", 0.87);
    if (data.length > 2400000) {
      setError("图片细节较多，请缩小选区。");
      return;
    }
    apply({ data, credit: credit.trim() || "论文配图" });
  }
  return (
    <>
      <p className="pr-help">
        选择论文页面，在图上拖出需要的区域。也可导入自己的图片，或直接使用整页。
      </p>
      <label className="pr-pickfigure">
        <Upload size={16} />
        选择 PDF 或图片
        <input
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          onChange={(e) => setInput(e.target.files?.[0])}
        />
      </label>
      {count > 0 && (
        <label>
          论文页码{" "}
          <select
            value={page}
            onChange={(e) => setPage(Number(e.target.value))}
          >
            {Array.from({ length: count }, (_, i) => (
              <option value={i + 1} key={i}>
                第 {i + 1} 页
              </option>
            ))}
          </select>
        </label>
      )}
      {input && (
        <>
          <div className="pr-cropwrap">
            <div
              className="pr-crop"
              hidden={!loaded}
              onPointerDown={(e) => {
                anchor.current = point(e);
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={select}
              onPointerUp={(e) => {
                select(e);
                anchor.current = null;
              }}
              onPointerCancel={() => {
                anchor.current = null;
                setCrop(full);
              }}
            >
              <canvas ref={canvas} />
              <span
                style={{
                  left: crop.x * 100 + "%",
                  top: crop.y * 100 + "%",
                  width: crop.w * 100 + "%",
                  height: crop.h * 100 + "%",
                }}
              />
            </div>
          </div>
          {!loaded && !error && <p role="status">正在读取页面…</p>}
        </>
      )}
      {loaded && (
        <>
          <button className="pr-reset" onClick={() => setCrop(full)}>
            重置为整页
          </button>
          <label>
            图片署名或来源
            <input
              maxLength={160}
              value={credit}
              onChange={(e) => setCredit(e.target.value)}
            />
          </label>
        </>
      )}
      {error && (
        <p role="alert" className="pr-error">
          {error}
        </p>
      )}
      <button
        className="pr-action"
        disabled={!loaded || crop.w < 0.015 || crop.h < 0.015}
        onClick={finish}
      >
        将选区用于四张配图
      </button>
    </>
  );
}
