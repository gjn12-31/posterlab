import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ExternalLink,
  Images,
  LoaderCircle,
  Search,
  X,
} from "lucide-react";
import {
  backgroundFile,
  listBackgrounds,
  previewUrl,
  type BackgroundCredit,
  type LibraryBackground,
} from "./background-library";
import "./background-library.css";

type Props = {
  selected?: BackgroundCredit;
  disabled?: boolean;
  scope: string;
  apply: (row: LibraryBackground, file: File) => Promise<void>;
  clear: () => Promise<void>;
};
export default function BackgroundLibrary({
  selected,
  disabled,
  scope,
  apply,
  clear,
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="bl-trigger"
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Images size={16} />
        背景图库
      </button>
      {open &&
        createPortal(
          <Picker
            selected={selected}
            scope={scope}
            apply={apply}
            clear={clear}
            close={() => setOpen(false)}
          />,
          document.body,
        )}
    </>
  );
}

function Picker({
  selected,
  scope,
  apply,
  clear,
  close,
}: Props & { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [items, setItems] = useState<LibraryBackground[]>([]);
  const [chosen, choose] = useState(selected?.id || "");
  const [query, search] = useState(""),
    [attempt, retry] = useState(0);
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const applying = useRef(false);
  useEffect(() => {
    const el = dialog.current!;
    el.showModal();
    return () => el.close();
  }, []);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    listBackgrounds()
      .then((rows) => {
        if (alive) {
          setItems(rows);
          choose((prior) =>
            rows.some((r) => r.id === prior) ? prior : rows[0]?.id || "",
          );
        }
      })
      .catch((e: Error) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [attempt]);
  const shown = items.filter((row) =>
    [row.name, row.source_title, row.source, row.tags, row.license]
      .join(" ")
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const row = shown.find((item) => item.id === chosen) || shown[0];
  async function submit(remove = false) {
    if (applying.current || (!row && !remove)) return;
    applying.current = true;
    setBusy(true);
    setError("");
    try {
      if (remove) await clear();
      else await apply(row!, await backgroundFile(row!));
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "背景未能保存，请重试。");
    } finally {
      applying.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      className="bl-dialog"
      ref={dialog}
      aria-label="背景图库"
      onCancel={(e) => {
        if (applying.current) e.preventDefault();
        else close();
      }}
      onClick={(e) => {
        if (e.target === dialog.current && !busy) close();
      }}
    >
      <div className="bl-body">
        <header>
          <div>
            <h2>背景图库</h2>
            <p>{scope}</p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={close}
            aria-label="关闭背景图库"
          >
            <X size={19} />
          </button>
        </header>
        <div className="bl-tools">
          <label>
            <Search size={15} />
            <input
              autoFocus
              type="search"
              aria-label="搜索图库背景"
              placeholder="搜索作品、来源或主题"
              value={query}
              onChange={(e) => search(e.target.value)}
            />
          </label>
          <span>{shown.length} 幅</span>
        </div>
        <div className="bl-content">
          <div className="bl-grid" role="group" aria-label="可选背景">
            {shown.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={busy}
                aria-pressed={item.id === row?.id}
                onClick={() => choose(item.id)}
              >
                <img loading="lazy" src={previewUrl(item)} alt="" />
                <span>{item.name}</span>
                {item.id === selected?.id && (
                  <Check className="bl-check" size={15} />
                )}
              </button>
            ))}
            {loading ? (
              <p>正在加载图库…</p>
            ) : !shown.length && !error ? (
              <p>没有找到匹配的背景。</p>
            ) : null}
          </div>
          {row && (
            <aside>
              <img src={previewUrl(row)} alt={row.name + "预览"} />
              <h3>{row.name}</h3>
              {row.source_title && <p lang="en">{row.source_title}</p>}
              <p>{row.source}</p>
              <p>{row.license}</p>
              <div className="bl-links">
                {row.source_url && (
                  <a href={row.source_url} target="_blank" rel="noreferrer">
                    作品来源 <ExternalLink size={12} />
                  </a>
                )}
                {row.license_url && (
                  <a href={row.license_url} target="_blank" rel="noreferrer">
                    授权说明 <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </aside>
          )}
        </div>
        {error && (
          <p role="alert" className="bl-error">
            {error}{" "}
            {!items.length && (
              <button type="button" onClick={() => retry((i) => i + 1)}>
                重新加载
              </button>
            )}
          </p>
        )}
        <footer>
          {selected && (
            <button type="button" disabled={busy} onClick={() => submit(true)}>
              移除图库背景
            </button>
          )}
          <button
            className="bl-apply"
            type="button"
            disabled={busy || !row}
            onClick={() => submit()}
          >
            {busy ? <LoaderCircle size={15} /> : <Check size={15} />}
            使用这个背景
          </button>
        </footer>
      </div>
    </dialog>
  );
}
