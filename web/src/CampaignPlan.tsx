import { useRef, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clipboard,
  Download,
  MapPin,
  Pencil,
} from "lucide-react";
import {
  bindStageIntro,
  releaseCalendar,
  releasePlan,
  type ReleaseEntry,
} from "./campaign-plan";
import { download } from "./render";
import { formats, type CampaignPlan, type Format, type Project } from "./model";
import "./campaign-plan.css";

type Props = {
  project: Project;
  inactive: boolean;
  packDisabled: boolean;
  name: string;
  layouts: Record<Format, { svg: string; issues: { level: string }[] }>;
  dirty: boolean;
  busy: string;
  error: string;
  pack: () => void;
  png: (f: Format) => void;
  preview: (f: Format) => void;
  schedule: () => void;
  notify: (message: string) => void;
  savePlan: (plan: CampaignPlan) => Promise<boolean>;
};

function StageEditor({
  entry,
  project,
  inactive,
  save,
  cancel,
}: {
  entry: ReleaseEntry;
  project: Project;
  inactive: boolean;
  save: Props["savePlan"];
  cancel: () => void;
}) {
  const [intro, setIntro] = useState(entry.intro),
    [format, setFormat] = useState(entry.format),
    [days, setDays] = useState(String(entry.days));
  const plan = project.current.campaignPlan;
  return (
    <form
      className="release-editor"
      onSubmit={async (event) => {
        event.preventDefault();
        const override =
          intro === entry.baseIntro
            ? undefined
            : bindStageIntro(intro.trim(), project.current.brief);
        const saved = await save({
          ...plan,
          ...(entry.id === "announce" ? { announceDays: Number(days) } : {}),
          stages: { ...plan?.stages, [entry.id]: { intro: override, format } },
        });
        if (saved) cancel();
      }}
    >
      <label>
        开场文案
        <textarea
          value={intro}
          maxLength={1200}
          onChange={(e) => setIntro(e.target.value)}
          rows={4}
        />
      </label>
      <small>活动名、时间、地点和链接会随活动信息同步。</small>
      <div className="release-choice">
        <label>
          配图
          <select
            aria-label="配图"
            value={format}
            onChange={(e) => setFormat(e.target.value as Format)}
          >
            {(Object.keys(formats) as Format[]).map((f) => (
              <option key={f} value={f}>
                {formats[f].name}
              </option>
            ))}
          </select>
        </label>
        {entry.id === "announce" && (
          <label>
            提前几天发布
            <input
              type="number"
              min={0}
              max={365}
              step={1}
              required
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          </label>
        )}
      </div>
      <div className="release-actions">
        <button
          type="button"
          className="cp-textbutton"
          disabled={inactive}
          onClick={cancel}
        >
          取消
        </button>
        <button type="submit" className="cp-primary" disabled={inactive}>
          <Check size={16} />
          保存此阶段
        </button>
      </div>
    </form>
  );
}

export default function CampaignReleasePlan({
  project,
  layouts,
  inactive,
  packDisabled,
  name,
  pack,
  png,
  preview,
  schedule,
  savePlan,
  notify,
  dirty,
  busy,
  error,
}: Props) {
  const [index, setIndex] = useState(0),
    [editing, setEditing] = useState(false),
    [copied, setCopied] = useState(false);
  const entries = releasePlan(project),
    entry = entries[index],
    { brief } = project.current;
  const copyBox = useRef<HTMLTextAreaElement>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(entry.copy);
      setCopied(true);
      notify(entry.name + "文案已复制");
    } catch {
      copyBox.current?.focus();
      copyBox.current?.select();
      notify("请复制已选中的文字");
    }
  }
  function calendar() {
    const content = releaseCalendar(project, entries);
    if (!content) return;
    download(
      new Blob([content], { type: "text/calendar;charset=utf-8" }),
      name + "-发布日历.ics",
    );
    notify("已下载三个阶段的全天发布日程");
  }
  return (
    <main className="cp-shell release-page">
      <a href="#campaign" className="release-back">
        <ArrowLeft size={15} />
        活动制作台
      </a>
      <div className="release-heading">
        <div>
          <h1>活动发布计划</h1>
          <p>{brief.title}</p>
        </div>
        <div className="release-actions">
          {brief.date && (
            <button
              className="release-secondary"
              disabled={inactive || editing}
              onClick={calendar}
            >
              <CalendarDays size={16} />
              下载发布日历
            </button>
          )}
          <button
            className="cp-dark"
            disabled={packDisabled || editing}
            onClick={pack}
          >
            <Download size={16} />
            {busy === "pack" ? "正在打包" : "下载整套 ZIP"}
          </button>
        </div>
      </div>
      {dirty && (
        <p className="cp-state">
          通知已修改。<a href="#campaign">返回活动制作台生成新版</a>
        </p>
      )}
      <div className="release-timeline" role="group" aria-label="发布阶段">
        {entries.map((item, i) => (
          <button
            key={item.id}
            disabled={editing}
            aria-pressed={index === i}
            onClick={() => {
              setIndex(i);
              setCopied(false);
            }}
          >
            <span className="release-timing">
              <span className="release-dot" />
              {item.relative}
            </span>
            <strong>{item.name}</strong>
            {item.date && (
              <time dateTime={item.date}>
                {Number(item.date.slice(5, 7))} 月 {Number(item.date.slice(8))}{" "}
                日
              </time>
            )}
          </button>
        ))}
      </div>
      <div className="release-schedule">
        <span>
          <MapPin size={15} />
          {[brief.date, brief.time, brief.venue].filter(Boolean).join(" · ") ||
            "活动安排待补充"}
        </span>
        <button
          className="cp-textbutton"
          disabled={inactive || editing}
          onClick={schedule}
        >
          <Pencil size={13} />
          {brief.date ? "改时间地点" : "补全日期以生成日历"}
        </button>
      </div>
      <section className="release-work" aria-label={entry.name + "发布材料"}>
        <div className="release-artwork">
          <button
            className="release-art"
            aria-label={"放大" + entry.name + "配图"}
            onClick={() => preview(entry.format)}
            dangerouslySetInnerHTML={{ __html: layouts[entry.format].svg }}
          />
          <div className="release-art-foot">
            <span>
              {formats[entry.format].name} · {formats[entry.format].ratio}
            </span>
            <button
              className="cp-textbutton"
              disabled={
                inactive ||
                editing ||
                layouts[entry.format].issues.some((i) => i.level === "error")
              }
              onClick={() => png(entry.format)}
            >
              <Download size={14} />
              下载配图
            </button>
          </div>
        </div>
        <div className="release-writing">
          <div className="release-copy-head">
            <div>
              <small>
                {entry.date ? "建议发布日 · " + entry.date : entry.relative}
              </small>
              <h2>{entry.name}</h2>
            </div>
            {!editing && (
              <button
                className="cp-textbutton"
                disabled={inactive}
                onClick={() => {
                  setEditing(true);
                  setCopied(false);
                }}
              >
                <Pencil size={14} />
                编辑此阶段
              </button>
            )}
          </div>
          {editing ? (
            <StageEditor
              key={entry.id}
              entry={entry}
              project={project}
              inactive={inactive}
              save={savePlan}
              cancel={() => setEditing(false)}
            />
          ) : (
            <>
              <textarea
                ref={copyBox}
                className="release-copy"
                aria-label="发布文案"
                readOnly
                value={entry.copy}
              />
              <div className="release-actions">
                <button
                  className="cp-primary"
                  disabled={inactive}
                  onClick={copy}
                >
                  {copied ? <Check size={15} /> : <Clipboard size={15} />}
                  {copied ? "已复制" : "复制文案"}
                </button>
              </div>
            </>
          )}
          {error && (
            <p role="alert" className="cp-error">
              {error}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
