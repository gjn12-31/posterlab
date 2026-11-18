import { useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  Download,
  FileArchive,
  FileImage,
  FileText,
  LoaderCircle,
} from "lucide-react";
import { formats, type Format, type Project } from "./model";
import {
  campaignExportFiles,
  exportSelection,
  type ExportSelection,
} from "./campaign-export";
import { download, type Issue } from "./render";
import "./campaign-export.css";

const destinations: Record<Format, string> = {
  portrait: "群聊海报",
  square: "朋友圈",
  landscape: "活动页封面",
};
const allFormats = Object.keys(destinations) as Format[];

type Props = {
  project: Project;
  layouts: Record<Format, { svg: string; issues: Issue[] }>;
  initialFormat: Format | "all";
  name: string;
  updateCopy: string;
  busy: boolean;
  error: string;
  run: (action: string, fn: () => Promise<void>) => Promise<void>;
  complete: () => void;
};

export default function CampaignExport({
  project,
  layouts,
  initialFormat,
  name,
  updateCopy,
  busy,
  error,
  run,
  complete,
}: Props) {
  const supported = allFormats.filter(
    (f) => !layouts[f].issues.some((i) => i.level === "error"),
  );
  const [selection, setSelection] = useState<ExportSelection>(() => ({
    formats: supported.filter(
      (f) => initialFormat === "all" || f === initialFormat,
    ),
    imageType: "png",
    copy: initialFormat === "all",
    calendar: false,
  }));
  const files = useMemo(
    () => campaignExportFiles(project, selection, updateCopy),
    [project, selection, updateCopy],
  );
  function submit() {
    run("export", async () => {
      const result = await exportSelection(project, files, name);
      download(result.blob, result.filename);
      complete();
    });
  }
  return (
    <div className="ce-panel">
      <p className="ce-title">{project.current.brief.title}</p>
      <div className="ce-grid">
        <div className="ce-settings">
          <fieldset disabled={busy} className="ce-group">
            <legend>发布渠道</legend>
            <div className="ce-targets">
              {allFormats.map((f) => {
                const dimension = formats[f],
                  checked = selection.formats.includes(f),
                  supportedFormat = supported.includes(f);
                return (
                  <label
                    key={f}
                    className="ce-card"
                    data-checked={checked}
                    data-disabled={!supportedFormat}
                  >
                    <input
                      type="checkbox"
                      aria-label={destinations[f]}
                      checked={checked}
                      disabled={!supportedFormat}
                      onChange={() => {
                        setSelection((s) => ({
                          ...s,
                          formats: allFormats.filter((k) =>
                            k === f ? !checked : s.formats.includes(k),
                          ),
                        }));
                      }}
                    />
                    <span className="ce-thumb" aria-hidden="true">
                      <span
                        dangerouslySetInnerHTML={{ __html: layouts[f].svg }}
                      />
                      <i>{checked && <Check size={13} strokeWidth={3} />}</i>
                    </span>
                    <strong>{destinations[f]}</strong>
                    <small>
                      {supportedFormat
                        ? dimension.width + " × " + dimension.height
                        : "需修改排版"}
                    </small>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <fieldset
            disabled={busy || !selection.formats.length}
            className="ce-group"
          >
            <legend>图片格式</legend>
            <div className="ce-types">
              {(["png", "jpg"] as const).map((type) => (
                <label key={type}>
                  <input
                    type="radio"
                    name="image-type"
                    checked={selection.imageType === type}
                    onChange={() =>
                      setSelection((s) => ({ ...s, imageType: type }))
                    }
                  />
                  <span>{type === "png" ? "PNG · 高清" : "JPG · 压缩"}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset disabled={busy} className="ce-group">
            <legend>随附文件</legend>
            <div className="ce-extras">
              <label>
                <input
                  type="checkbox"
                  checked={selection.copy}
                  onChange={(e) =>
                    setSelection({ ...selection, copy: e.target.checked })
                  }
                />
                发布文案
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={selection.calendar}
                  disabled={!project.current.brief.date}
                  onChange={(e) =>
                    setSelection({ ...selection, calendar: e.target.checked })
                  }
                />
                发布日历
                {!project.current.brief.date && <small>需填写日期</small>}
              </label>
            </div>
          </fieldset>
        </div>
        <section className="ce-summary" aria-label="导出清单">
          <h3>
            <FileArchive size={17} />
            导出清单
          </h3>
          {files.length ? (
            <ul>
              {files.map((file) => (
                <li key={file.filename}>
                  {"format" in file ? (
                    <FileImage size={15} />
                  ) : file.filename.endsWith(".ics") ? (
                    <CalendarDays size={15} />
                  ) : (
                    <FileText size={15} />
                  )}
                  {file.filename}
                </li>
              ))}
            </ul>
          ) : (
            <p>请选择渠道或随附文件</p>
          )}
          <div className="ce-footnote" aria-live="polite">
            {files.length} 个文件{files.length > 1 && " · ZIP 压缩包"}
          </div>
        </section>
      </div>
      {error && (
        <p role="alert" className="cp-error">
          {error}
        </p>
      )}
      <div className="ce-actions">
        <button
          className="cp-primary"
          disabled={busy || !files.length}
          onClick={submit}
        >
          {busy ? (
            <LoaderCircle size={16} className="cp-spin" />
          ) : (
            <Download size={16} />
          )}
          {busy ? "正在导出…" : files.length > 1 ? "下载 ZIP" : "下载文件"}
        </button>
      </div>
    </div>
  );
}
