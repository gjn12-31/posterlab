# 论文宣传材料生成方法选型

本次核查了 10 个 GitHub 项目的 README、目录和根许可文件。目标是让一名科研作者能够把同一组论文原句变成四个平台可校订的宣传材料，并让另一名读者能回查出处。

## 发布帖怎样让人愿意点开论文

- **X**　Tri Dao 发 FlashAttention-2 时，首帖就给出了和上一版比有多快，以及在 A100 上测到的训练速度。后续串帖才讲同样的训练成本可以支持多长的上下文。写首帖时挑出同行可以直接转述的一项变化，数字要跟着比较对象和条件走。[作者首帖](https://x.com/tri_dao/status/1680987577913065472) · [作者团队博客](https://hazyresearch.stanford.edu/blog/2023-07-17-flash2)
- **小红书**　LongHorizonUI 的笔记让读者跟着智能体在游戏商城购买并装备道具。等读者看懂连续操作容易在哪里卡住，方法名才有了含义。论文给出具体例子时，可以用例子带出研究动机。只有摘要时，先选摘要里读者能想象的动作。[小红书原帖](https://www.xiaohongshu.com/explore/69fda95e0000000023014eba) · [另 19 篇主会笔记与样本背景](iclr-rednote-study.md)
- **公众号**　顾煜贤在「机器之心」介绍 PDS 时问到了训练者的一个选择。在训练 token 数相同时，让模型看所有数据一遍，还是让它多看几遍筛过的数据？文中让读者在图 6 比较这两种取舍。推文可以围绕一个决定展开，选择能改变读者判断的一组实验，并说明比较时固定了什么。[署名转载](https://m.aitntnews.com/newDetail.html?newId=13492)

**朋友圈**的写法来自产品的编辑判断。上面的公开样本只涵盖 X、小红书和公众号。朋友圈稿按随链接发给熟人的配文设计，挑一件值得和特定同行分享的事，一两句话也可以收住。

## 作者实际怎样发布一篇工作

本轮对照了用户提供的四篇小红书笔记。下表归纳行文方式。StableToken 与 IGPO 有可核对的原帖。VGMED 和 V2P-Bench 两行的站内写法来自用户提供的正文，所附会刊链接用于核对研究内容。

| 笔记 | 作者怎样把研究介绍给同行 |
| --- | --- |
| StableToken | 作者先交代已录用和参会信息，然后带读者沿配图看一个异常现象、它的两个成因、各自对应的改动和相对基线的结果。真实发布信息能解释为什么在此时发帖，已知的资源方便读者继续尝试。[小红书原帖](https://www.xiaohongshu.com/explore/69e22a2b000000002301112e) · [论文](https://arxiv.org/abs/2509.22220) |
| IGPO | 从自己训练时最关心的一个困难讲起，再用相邻轮次的差异解释奖励从哪里来。交代验证范围，并把后续工作的发现与本文分开。自然的分享语气也可以承载完整的技术解释。[小红书原帖](https://www.xiaohongshu.com/explore/69fcbcaf000000003501c99f) · [论文](https://arxiv.org/abs/2510.14967) |
| VGMED | 先问出一个诊断问题，再用数据集区分两种可能原因。理解了差别的读者，更容易跟上从注意力区域到再次推理的两步设计。[ICLR 会刊](https://proceedings.iclr.cc/paper_files/paper/2026/hash/999a7fa10ed25ce8b836b14ff003ad50-Abstract-Conference.html) |
| V2P-Bench | 从给视频做视觉标记这个交互动作切入，接着说明基准覆盖什么、现有模型在哪些任务上仍有短板，以及读者能拿哪些公开资源复查。[ICLR 会刊](https://proceedings.iclr.cc/paper_files/paper/2026/hash/2f23bf7068a2f45afa285353894fb5b0-Abstract-Conference.html) |

X 对照了 Tri Dao 的 FlashAttention-2 作者串帖。首帖的相对速度与具体硬件适合单独转发，后续帖有足够篇幅解释任务怎样在不同计算单元间分配。微信公众号对照了顾煜贤为「机器之心」撰写的 PDS 介绍，经署名转载正文核对。它围绕预算固定时是否应该重复学习筛选数据的实验展开。生成器借鉴这些叙事选择，文内示范另以虚构的档案、地图材料撰写。朋友圈的处理来自产品编辑判断，没有将私人朋友圈当做公开研究样本。[X 原帖](https://x.com/tri_dao/status/1680987577913065472) · [串帖公开存档](https://en.rattibha.com/thread/1680987577913065472) · [微信公众号署名转载](https://aitntnews.com/newDetail.html?newId=13492)

## 十个候选项目

| 项目 | 实际输入与输出 | 对 PosterLab 的判断 | 仓库许可与来源 |
|---|---|---|---|
| pprp/Paper2Blog | 单次模型调用把原文、可选配图说明转成中英文技术文章。实现把写作角色和论文材料放入不同消息。 | 作为论文宣传材料的编辑底稿；保留读者定位、术语解释和第三方叙述，对四个平台分别约束。 | MIT · [README](https://github.com/pprp/Paper2Blog/blob/10c42401235d07727052deda13c19baa6d5ae586/README.md) · [LICENSE](https://github.com/pprp/Paper2Blog/blob/10c42401235d07727052deda13c19baa6d5ae586/LICENSE) |
| HKUDS/Paper2Slides | 分阶段提取论文内容、整理摘要、规划内容并生成幻灯或海报；提取提示专门要求保留具体数字和比较对象。 | 作为定量结果核对的对照。导读需要可独立阅读，表格和逐页规划偏向演示。 | MIT · [README](https://github.com/HKUDS/Paper2Slides/blob/0785051d1f52814097e94c44751e3f12b83f7c8a/README.md) · [LICENSE](https://github.com/HKUDS/Paper2Slides/blob/0785051d1f52814097e94c44751e3f12b83f7c8a/LICENSE) |
| allenai/scitldr | 把论文句子、句子标签与作者或同行撰写的极短摘要配对，提供训练数据、权重与生成代码。 | 作为短帖抓住核心结论的对照。完整研究介绍还需要交代证据和边界。 | Apache-2.0（仓库） · [README](https://github.com/allenai/scitldr/blob/5ccad9c00a60ad75c9e04abf7f27d0f53f983b20/README.md) · [LICENSE](https://github.com/allenai/scitldr/blob/5ccad9c00a60ad75c9e04abf7f27d0f53f983b20/LICENSE) |
| Paper2Poster/Paper2Poster | PosterAgent 从 PDF 建立结构化素材，再规划版式并反复检查视觉效果，交付可编辑 PPTX。 | 适用于会议墙报。可编辑海报是重要目标，但这一套输出缺少社交渠道文案。 | MIT · [README](https://github.com/Paper2Poster/Paper2Poster/blob/70fc6f7b778bc8c9bfecc22875eff66f4eb65f93/README.md) · [LICENSE](https://github.com/Paper2Poster/Paper2Poster/blob/70fc6f7b778bc8c9bfecc22875eff66f4eb65f93/LICENSE) |
| imhaojie/PosterMELD | 先选模板，再让各段文字适应布局，放入论文图表、检查并导出可编辑的 PPTX 和 PNG。 | 适合印刷墙报，特别是控制文字长度。整套后端的目标与社交写作有差别。 | MIT · [README](https://github.com/imhaojie/PosterMELD/blob/4834144a1b37d8c683fb6ff507f4780cf56dc8e6/README.md) · [LICENSE](https://github.com/imhaojie/PosterMELD/blob/4834144a1b37d8c683fb6ff507f4780cf56dc8e6/LICENSE) |
| multimodal-art-projection/P2P | 将论文转为会议海报，提供生成与评估代码；示例可配置模型地址和图像检测服务，导出 JSON、HTML。 | 适合作为版面与信息保真度的评估参考。完整运行需要额外的图像检测环节。 | MIT · [README](https://github.com/multimodal-art-projection/P2P/blob/c619c9c58d92bde7efbdc079c6bacc81839d7816/README.md) · [LICENSE](https://github.com/multimodal-art-projection/P2P/blob/c619c9c58d92bde7efbdc079c6bacc81839d7816/LICENSE) |
| dwzhu-pku/PaperBanana | 从研究内容出发制作学术示意图和图表，包含视觉模型与图像生成步骤。 | 适用于绘制解释性插图。PosterLab 优先保留原论文图像、单位与图源。 | Apache-2.0 · [README](https://github.com/dwzhu-pku/PaperBanana/blob/9ceea039be86dd40294361856a4b7bf097d9e2b7/README.md) · [LICENSE](https://github.com/dwzhu-pku/PaperBanana/blob/9ceea039be86dd40294361856a4b7bf097d9e2b7/LICENSE) |
| YuhangChen1/Paper2All | 整合从论文到独立学术主页、演示、海报、视频等任务的流程。 | 作为多种成品共用论文输入的参考。此版本根目录未见整仓授权文件。 | 未确认整仓许可 · [README](https://github.com/YuhangChen1/Paper2All/blob/0639654f6dc023c0372de5e7f0484e03e5b25c25/README.md) |
| natasha139/paper2note | 针对小红书学术笔记，把标题、问题、方法、贡献交给后端润色，强调不能仅凭标题推断结果。 | 中文任务契合度高。此版本根目录未见授权文件，仅研究其公开流程。 | 未确认 · [README](https://github.com/natasha139/paper2note/blob/e88b68e6f8da47f6405b8c928be6fb0bc1a25bde/README.md) |
| aihes/xiaohongshu-ai-toolkit | 覆盖 arXiv 解析、小红书图文和封面生成，还集成账号、积分与监控。 | 适合研究从论文到笔记的发布路径。README 声明 MIT，但其链接的根目录 LICENSE 在核查提交中缺失。 | README 声明 MIT · [README](https://github.com/aihes/xiaohongshu-ai-toolkit/blob/55116828856c3a8311de21141b8bbd38b5e6d55d/README.md) |

## 用相同论文做写法对照

本机已有的模型服务对三个候选方法各执行一次真实请求，模型均为 StepFun 的 `step-3.5-flash`。三次共用同一标题、三条英语原句和同一个任务：用不超过 180 个汉字撰写公众号导读，并交代观测对象、观测办法、测量不确定性，以及与理论预期的关系。唯一替换的内容是分别按技术博客、演示内容提取和极短摘要的方式组织导读。此次比较的是移植后的写法，未运行各上游的完整训练或海报生成流程。

观测依据来自 EHT 对 M87 的研究：观测波长为 1.3 毫米，环的角直径为 42 ± 3 微角秒，图像与克尔黑洞阴影的预期一致。原句同时给出约为或大于 10∶1 的通量比。它们没有把“首次拍到”作为已选引文中的事实。[论文 DOI](https://doi.org/10.3847/2041-8213/ab0ec7)

| 写法 | 三次输出中可复核的表现 |
|---|---|
| Paper2Blog 技术博客 | 保留波长、角直径的误差和“与预测一致”；加入了“我们首次拍到”。用“亮度低谷与亮环的通量比超过10:1”表述强弱次序，容易使读者理解成暗区更亮。 |
| Paper2Slides 结果提取 | 同样保留波长、误差和理论预期，方法与结果区分清楚；也引入“我们首次”，并写成“亮度凹陷与亮环的流量比超10:1”。 |
| SciTLDR 极短总结 | 保留波长、误差与“符合预测”，先写亮环再写暗区；也写了原句未支持的“人类首次”，并把约略比较写成严格大于。 |

单篇对照没有产生普遍的质量冠军。选用 **Paper2Blog** 源于具体交付条件：中英文编辑角色可复用，一次给出完整稿件，MIT 授权清晰，现有 StepFun 服务即可执行。实测中暴露的问题直接进入产品规则：按编号原句归因，保留测量误差与近似符号；比较对象的顺序不明确就省略比值；题名中的 *First Results* 不足以证明“人类首次”。三份草稿都还需要作者校订，这组样本也不足以推断阅读量或转化率。

## 进入产品的部分

后端的 `build_messages("paper", payload)` 改编了 Paper2Blog 的 `LLMHandler.generate_blog_post` 角色与写作指令。上游将语言、角色和原文明确区分，并要求首次解释术语。最初版本使用上述技术博客思路。现在的产品以作者发布或读者推荐为写作任务，用同一来源生成英文串帖、小红书笔记、朋友圈分享语和公众号推文。作者发布时用研究团队的口吻，推荐分享时说明推荐理由。原文明示发布的软件或数据可以作为读者下一步可操作的入口。调用者得到四个平台所引用的原句编号，可以与本地原文对照。上游自带的 Markdown 图像链接、Marker 子模块和模型配置没有打包。[上游实现](https://github.com/pprp/Paper2Blog/blob/10c42401235d07727052deda13c19baa6d5ae586/paper2blog/llm_handler.py) · [保留的 MIT 许可](licenses/paper2blog.txt) · [本项目后端策略](../src/posterlab/outreach_strategy.py)

库、模型权重、训练数据和示例图片可能适用不同条款。上表的许可判断仅对应所链接提交的仓库；随这次改编分发的是 Paper2Blog 编辑指令的改编及其许可。活动海报的版式选型另见[活动设计方法](activity-layout.md)。

同一篇 LoRA 论文的生成实稿可以逐平台试读。X 首帖交代 GPT-3 175B 相对 Adam 全量微调的可训练参数对照，公众号则从部署时如何把更新并回权重讲起。四份均为 PosterLab 按作者口吻生成的示例。[LoRA 四平台成稿](../web/public/kits/lora-posts.txt)
