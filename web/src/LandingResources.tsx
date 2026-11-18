import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Layers3, Plus, X } from "lucide-react";
import "./landing-resources.css";

const repo = "https://github.com/gjn12-31/posterlab";
const docs = repo + "#安装与启动";
const issues = repo + "/issues";

const questions = [
  {
    title: "我需要准备什么？",
    answer:
      "论文宣传可以从一份有文字层的 PDF 开始，也可以直接粘贴摘要。活动宣传只需一段通知，带上活动名称、时间和地点即可。",
  },
  {
    title: "一篇论文可以生成哪些宣传材料？",
    answer:
      "X 的英文串帖、小红书图文笔记、朋友圈分享语、微信公众号推文，各配一张对应画幅的海报。可以用作者身份介绍自己的工作，也可以用推荐者的口吻分享别人的论文。",
    link: { label: "打开 ClashBench 的可编辑案例", href: "#papers/example/clashbench" },
  },
  {
    title: "导出的海报还能修改吗？",
    answer:
      "可以。论文和活动海报都可以在网页里拖动图层、修改文字、调整图片大小。两类海报也都能下载 .drawio 源文件，用 diagrams.net 打开后继续编辑。原论文插图会作为整张图片保留。",
  },
  {
    title: "在哪里使用实时 AI 生成？",
    answer:
      "GitHub Pages 展示版可以浏览和下载案例。要用自己的论文或活动通知调用模型，可从宣传工作台打开已部署的 AI 工作台，或按项目文档在本机启动完整版。",
    link: { label: "查看安装说明", href: docs },
  },
];

type Panel = "about" | "privacy" | "rights";

type PanelContent = {
  title: string;
  paragraphs: string[];
  link?: { label: string; href: string };
};

const panels: Record<Panel, PanelContent> = {
  about: {
    title: "关于 PosterLab",
    paragraphs: [
      "PosterLab 是面向研究者与活动策划者的网页工作室。你可以把一篇论文做成四个平台的宣传材料，也可以把一份活动通知排成一套可编辑的海报。",
      "项目由 GitHub 仓库维护。使用说明、代码更新和问题反馈都可以在那里查看。",
    ],
    link: { label: "查看项目仓库", href: repo },
  },
  privacy: {
    title: "隐私与数据",
    paragraphs: [
      "导入 PDF 时，浏览器会按页读取正文并定位原论文中的图表。接通模型后，可以根据研究内容选取方法图与结果表，查看所引用的原句。论文库和本地画布作品保存在当前浏览器。清除站点数据前，可先导出需要保留的作品。",
      "使用实时 AI 时，工作台会把该任务所需的论文内容、活动信息或设计素材提交给当前部署的服务端，再由已配置的模型服务处理。服务端可保存生成结果与调用记录。具体存储位置和模型供应商取决于所用的部署。",
    ],
  },
  rights: {
    title: "内容与版权",
    paragraphs: [
      "下载案例时，请查看作品详情中的论文出处、原图署名与设计说明。论文插图、照片、字体及其他第三方素材各自适用其来源标明的授权条件。",
      "准备公开或商业发布时，请确认所用素材的使用权限，并对照原文核实宣传稿中的研究结论、数字及署名。若发现归属或授权信息有误，可附上作品链接向项目反馈。",
    ],
    link: { label: "反馈内容问题", href: issues },
  },
};

export default function LandingResources() {
  const [panel, setPanel] = useState<Panel | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const info = panel ? panels[panel] : null;

  useEffect(() => {
    if (panel && !dialog.current?.open) dialog.current?.showModal();
  }, [panel]);

  function openPanel(next: Panel, button: HTMLButtonElement) {
    opener.current = button;
    setPanel(next);
  }

  return (
    <div className="landing-resources">
      <section className="lr-faq" id="faq" aria-labelledby="lr-faq-title">
        <div className="lr-frame lr-faq-grid">
          <div>
            <h2 id="lr-faq-title">常见问题</h2>
            <a
              className="lr-help"
              href={issues}
              target="_blank"
              rel="noreferrer"
            >
              反馈问题 <ArrowUpRight size={15} aria-hidden="true" />
            </a>
          </div>
          <div className="lr-questions">
            {questions.map(({ title, answer, link }, index) => (
              <details key={title} name="posterlab-faq" open={index === 0}>
                <summary>
                  <span>{title}</span>
                  <Plus size={19} aria-hidden="true" />
                </summary>
                <div className="lr-answer">
                  <p>{answer}</p>
                  {link && (
                    <a href={link.href} target="_blank" rel="noreferrer">
                      {link.label} <ArrowUpRight size={14} aria-hidden="true" />
                    </a>
                  )}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <footer id="about" aria-label="关于与资源" className="lr-footer">
        <div className="lr-frame lr-footer-grid">
          <div className="lr-signature">
            <a href="#desk" className="lr-wordmark" aria-label="PosterLab 首页">
              <Layers3 aria-hidden="true" size={27} /> PosterLab
            </a>
            <p>论文与活动宣传工作室</p>
          </div>
          <nav aria-label="宣传工作室">
            <h3>产品</h3>
            <a href="#papers">论文宣传</a>
            <a href="#campaign">活动宣传</a>
            <a href="#collection">作品选集</a>
          </nav>
          <nav aria-label="更多设计工具">
            <h3>创作工具</h3>
            <a href="#studio">海报设计室</a>
            <a href="#create">设计样张</a>
            <a href="#exhibitions">灵感档案</a>
            <a href="?mode=templates#gallery">我的作品</a>
          </nav>
          <nav aria-label="关于我们">
            <h3>关于我们</h3>
            <button
              type="button"
              onClick={(e) => openPanel("about", e.currentTarget)}
            >
              关于 PosterLab
            </button>
            <a href={docs} target="_blank" rel="noreferrer">
              使用文档 <ArrowUpRight size={13} aria-hidden="true" />
            </a>
            <a href={issues} target="_blank" rel="noreferrer">
              联系与反馈 <ArrowUpRight size={13} aria-hidden="true" />
            </a>
          </nav>
          <nav aria-label="相关声明">
            <h3>相关声明</h3>
            <button
              type="button"
              onClick={(e) => openPanel("privacy", e.currentTarget)}
            >
              隐私与数据
            </button>
            <button
              type="button"
              onClick={(e) => openPanel("rights", e.currentTarget)}
            >
              内容与版权
            </button>
          </nav>
        </div>
      </footer>

      <dialog
        ref={dialog}
        className="lr-dialog"
        aria-labelledby="lr-panel-title"
        onClose={() => {
          setPanel(null);
          opener.current?.focus();
        }}
      >
        {info && (
          <>
            <div className="lr-dialog-head">
              <h2 id="lr-panel-title">{info.title}</h2>
              <button
                type="button"
                aria-label="关闭窗口"
                onClick={() => dialog.current?.close()}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            {info.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {info.link && (
              <a href={info.link.href} target="_blank" rel="noreferrer">
                {info.link.label} <ArrowUpRight size={15} aria-hidden="true" />
              </a>
            )}
          </>
        )}
      </dialog>
    </div>
  );
}
