import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Clipboard,
  Download,
  Images,
  Layers,
  Maximize2,
  MessageCircle,
  NotebookPen,
  PencilLine,
  ScanText,
} from "lucide-react";
import twitterText from "twitter-text";
import { drawPaper } from "./paper-art";
import { platforms, type Paper, type Channel } from "./paper-model";
import { noteParts, postParts } from "./paper-publication";

export function Art({ paper, channel }: { paper: Paper; channel: Channel }) {
  const target = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    const container = target.current!;
    setFailed(false);
    container.replaceChildren();
    drawPaper(paper, channel)
      .then((canvas) => {
        if (live) container.replaceChildren(canvas);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [
    paper.title,
    paper.byline,
    paper.headline,
    paper.sample,
    paper.figure,
    paper.evidence,
    channel,
  ]);
  const { width, height, name } = platforms[channel];
  return (
    <div
      className="pr-art"
      role="img"
      aria-label={name + "配图预览"}
      style={
        {
          aspectRatio: width + "/" + height,
          "--ratio": width / height,
        } as CSSProperties
      }
      ref={target}
    >
      {failed ? "配图未能载入，请刷新后重试。" : null}
    </div>
  );
}

const order: Channel[] = ["red", "x", "moments", "wechat"];
function PlatformMark({ channel }: { channel: Channel }) {
  const Icon =
    channel === "red"
      ? NotebookPen
      : channel === "moments"
        ? MessageCircle
        : BookOpen;
  return (
    <span className={"pub-mark is-" + channel} aria-hidden="true">
      {channel === "x" ? (
        <strong>𝕏</strong>
      ) : (
        <Icon size={17} strokeWidth={1.9} />
      )}
    </span>
  );
}

export default function PublicationDesk({
  paper,
  channel,
  copy,
  reviewTerms,
  busy,
  choose,
  edit,
  evidence,
  figure,
  zoom,
  exportFile,
  clipboard,
}: {
  paper: Paper;
  channel: Channel;
  copy: string;
  reviewTerms: string[];
  busy: string;
  choose: (c: Channel) => void;
  edit: () => void;
  evidence: () => void;
  figure: () => void;
  zoom: () => void;
  exportFile: (what: "image" | "channel") => void;
  clipboard: (s: string, rich?: boolean) => Promise<boolean>;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    setCopied(null);
  }, [channel, paper.id, copy]);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const info = platforms[channel];
  const { title, body } = noteParts(copy);
  const titled = (channel === "red" || channel === "wechat") && !!title;
  const posts = postParts(copy);
  function copyAction(label: string, text: string, rich = false) {
    return (
      <button
        type="button"
        onClick={async () => {
          if (await clipboard(text, rich)) setCopied(label);
        }}
      >
        {copied === label ? <Check size={15} /> : <Clipboard size={15} />}{" "}
        {label}
      </button>
    );
  }
  return (
    <div className="pub-desk" data-channel={channel}>
      <aside className="pub-rail">
        <h3>
          <Layers size={16} />
          发布平台
        </h3>
        <div
          className="pub-channels pr-tabs"
          role="group"
          aria-label="发布平台"
        >
          {order.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={platforms[c].name}
              aria-pressed={c === channel}
              onClick={() => choose(c)}
            >
              <PlatformMark channel={c} />
              <span className="pub-channel-label">
                <b>{platforms[c].name}</b>
                <small>{platforms[c].type}</small>
              </span>
              <ChevronRight className="pub-chevron" size={15} />
            </button>
          ))}
        </div>
      </aside>
      <section className="pub-sheet" aria-label={info.name + "发布稿"}>
        <header className="pub-head">
          <span className="pub-head-title">
            <PlatformMark channel={channel} />
            <h3>
              {info.name}
              {info.type}
            </h3>
          </span>
          <button
            className="pub-button pub-deliver"
            disabled={!!busy}
            onClick={() => exportFile("channel")}
          >
            <Download size={15} />
            {busy === "channel" ? "正在打包…" : "下载本平台"}
          </button>
        </header>
        <div className="pub-columns">
          <div className="pub-media">
            <button
              className="pub-proof"
              aria-label="放大发布配图"
              onClick={zoom}
            >
              <Art paper={paper} channel={channel} />
              <span className="pub-zoom" aria-hidden="true">
                <Maximize2 size={15} />
              </span>
            </button>
            <div className="pub-dimensions">
              <span>
                {info.width} × {info.height}
              </span>
              <span>PNG</span>
            </div>
            <div className="pub-media-tools">
              <button onClick={figure}>
                <Images size={15} />
                {paper.figure ? "更换论文插图" : "选取论文插图"}
              </button>
              <button disabled={!!busy} onClick={() => exportFile("image")}>
                <ArrowDownToLine size={15} />
                下载配图
              </button>
            </div>
          </div>
          <div className="pub-writing">
            <div className="pub-copy-heading">
              <strong>
                {channel === "x" ? posts.length + " 条短帖" : "发布文案"}
              </strong>
              <button className="pub-button" onClick={edit}>
                <PencilLine size={14} />
                编辑
              </button>
            </div>
            {paper.localChannels?.includes(channel) && (
              <p className="pub-local">本地摘录稿</p>
            )}
            {reviewTerms.length > 0 && (
              <button className="pr-reviewnote" onClick={evidence}>
                <ScanText size={15} />
                <span>
                  建议对照原句　
                  {reviewTerms.map((t) => "「" + t + "」").join("、")}
                </span>
                <ArrowUpRight size={14} />
              </button>
            )}
            <div
              className="pr-copy pub-copy"
              key={paper.id + "-" + channel}
              tabIndex={0}
              aria-label="发布文案预览"
            >
              {channel === "x" ? (
                posts.map((s, i) => (
                  <article className="pub-tweet" key={i}>
                    <div className="pub-tweet-count">
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <div>
                      <p>{s}</p>
                      <button onClick={() => clipboard(s)}>
                        复制第 {i + 1} 帖{" "}
                        <small>
                          {twitterText.parseTweet(s).weightedLength}/280
                        </small>
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <article>
                  {titled && <h4>{title}</h4>}
                  {postParts(titled ? body : copy).map((s, i) => (
                    <p key={i} className={s.startsWith("#") ? "pub-tags" : ""}>
                      {s}
                    </p>
                  ))}
                </article>
              )}
            </div>
            <div className="pub-copy-tools">
              <button type="button" onClick={evidence}>
                <ScanText size={15} />
                核对原句
                {paper.evidenceIds?.[channel]?.length
                  ? " " + paper.evidenceIds[channel]!.join("、")
                  : ""}
              </button>
              <div>
                {channel === "red" && titled && copyAction("复制标题", title)}
                {channel === "wechat" && copyAction("复制排版", copy, true)}
                {copyAction(
                  channel === "red" && titled ? "复制正文" : "复制文案",
                  channel === "red" && titled ? body : copy,
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
