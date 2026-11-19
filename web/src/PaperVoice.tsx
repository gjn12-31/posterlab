import WorkflowModels from "./WorkflowModels";
import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import Dialog from "./PaperDialog";
import { writePaper } from "./outreach";
import {
  channelCopy,
  channels,
  platforms,
  voiceNames,
  type Channel,
  type Paper,
  type PaperVoice,
} from "./paper-model";

export function VoicePicker({
  value,
  choose,
  disabled = false,
}: {
  value: PaperVoice;
  choose: (value: PaperVoice) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="pr-voices" disabled={disabled}>
      <legend>发布视角</legend>
      {(["author", "editor"] as const).map((voice) => (
        <label key={voice} className={value === voice ? "is-selected" : ""}>
          <input
            type="radio"
            name="paper-voice"
            value={voice}
            checked={value === voice}
            onChange={() => choose(voice)}
          />
          <span>
            <b>{voiceNames[voice]}</b>
            <small>
              {voice === "author" ? "分享自己的研究" : "向读者推荐这篇论文"}
            </small>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function RewritePaper({
  paper,
  close,
  apply,
}: {
  paper: Paper;
  close: () => void;
  apply: (kit: Paper, selected: Channel[]) => void;
}) {
  const [voice, setVoice] = useState<PaperVoice>(paper.voice || "author");
  const [kit, setKit] = useState<Paper>();
  const [selected, setSelected] = useState<Channel[]>([]);
  const [channel, setChannel] = useState<Channel>("red");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  async function generate() {
    setWorking(true);
    setError("");
    try {
      const next = await writePaper({ ...paper, voice }, crypto.randomUUID());
      const available = channels.filter((c) => !!next.edits[c]);
      setKit(next);
      setChannel(available.includes(channel) ? channel : available[0]);
      setSelected(
        available.filter(
          (c) =>
            paper.localChannels?.includes(c) || paper.edits[c] === undefined,
        ),
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : "生成失败，请重试。");
    } finally {
      setWorking(false);
    }
  }
  return (
    <Dialog
      title="重写四平台宣传稿"
      className="pr-rewrite"
      close={() => {
        if (!working) close();
      }}
    >
      {!kit ? (
        <>
          <p className="pr-help">
            用已有论文重写文案。生成后逐个平台对比，再选择要采用的新稿。
          </p>
          <VoicePicker value={voice} choose={setVoice} disabled={working} />
          <WorkflowModels context="writing" disabled={working} />
          {error && (
            <p role="alert" className="pr-error">
              {error}
            </p>
          )}
          <button className="pr-action" disabled={working} onClick={generate}>
            <Sparkles size={16} />
            {working ? "正在撰写四平台宣传稿…" : "生成对照稿"}
          </button>
        </>
      ) : (
        <>
          <div
            className="pr-rewrite-tabs"
            role="group"
            aria-label="选择对比平台"
          >
            {channels.map((c) => (
              <button
                key={c}
                aria-pressed={channel === c}
                disabled={!kit.edits[c]}
                onClick={() => setChannel(c)}
              >
                {platforms[c].name}
                {selected.includes(c) && <Check size={13} />}
              </button>
            ))}
          </div>
          <div className="pr-rewrite-comparison">
            <section>
              <h3>现有文案</h3>
              <p>{channelCopy(paper, channel)}</p>
            </section>
            <section>
              <h3>{voiceNames[voice]} · 新稿</h3>
              <p>{kit.edits[channel]}</p>
            </section>
          </div>
          <label className="pr-rewrite-pick">
            <input
              type="checkbox"
              checked={selected.includes(channel)}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [...selected, channel]
                    : selected.filter((c) => c !== channel),
                )
              }
            />
            采用{platforms[channel].name}新稿
          </label>
          <button
            className="pr-action"
            disabled={!selected.length}
            onClick={() => apply(kit, selected)}
          >
            <Check size={16} />
            {selected.length
              ? "应用" + selected.length + "个平台的新稿"
              : "选择要采用的平台"}
          </button>
        </>
      )}
    </Dialog>
  );
}
