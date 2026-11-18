import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Sparkles, X } from "lucide-react";
import { STATIC_DEMO } from "./studio-api";
import "./live-studio-link.css";

export default function LiveStudioLink({ route }: { route: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);
  if (!STATIC_DEMO) return null;
  const hosted: string | undefined = import.meta.env.VITE_LIVE_STUDIO_URL;
  if (hosted && /^https:\/\//i.test(hosted)) {
    return <a className="live-studio-link" href={hosted.split("#")[0] + route}><Sparkles size={15} />打开 AI 工作台</a>;
  }
  return (
    <>
      <button className="live-studio-link" type="button" onClick={() => setOpen(true)}>
        <Sparkles size={15} />打开 AI 工作台
      </button>
      {open && (
        <dialog className="live-studio-dialog" ref={dialog} onClose={() => setOpen(false)}>
          <header>
            <h2>连接 AI 工作台</h2>
            <button type="button" aria-label="关闭连接窗口" onClick={() => dialog.current?.close()}><X size={19} /></button>
          </header>
          <p>实时生成在完整版中运行。启动后，选择与启动窗口一致的地址。</p>
          {[8787, 5173].map(port => (
            <a key={port} href={`http://127.0.0.1:${port}/${route}`} target="_blank" rel="noreferrer">
              <span>本机工作台 <small>127.0.0.1:{port}</small></span><ArrowUpRight size={18}/>
            </a>
          ))}
          <footer><a href="https://github.com/gjn12-31/posterlab#安装与启动" target="_blank" rel="noreferrer">安装完整版与配置模型</a></footer>
        </dialog>
      )}
    </>
  );
}
