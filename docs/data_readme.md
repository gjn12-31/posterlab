# 数据说明

来源：清华大学交叉信息研究院 10 场独立公开讲座。完整清单见 data/source_manifest.jsonl，提取结果见 data/collected_events.json。每场保存原页面 page.html、去导航正文 body.txt、访问时间、HTTP 状态及 SHA256。

采集程序 scripts/collect_sources.py 只请求固定 10 个具体详情页，查询 robots.txt，间隔 1 秒，优先本地缓存，不绕过登录。运行 scripts/build_tasks.py 从缓存确定性构造任务。默认不会在网页访问或生成时抓取外网。

10 个活动并非 10 次真实模型实验。每场构造标准、改期、长文本三种任务，共30。e001/e002 为开发，其余为测试。近重复变体不跨集合。源码中的测试使用离线假响应，不消耗付费接口。

- 标准：真实主题、讲者、活动日期、时段、地点，中文简介为项目整理摘要。
- 更新：只将日期增加7天；公开 update.txt 明示“实验构造”。
- 长文本：只扩充简介，不改变其他事实。

输入目录 data/tasks/<id>/public，答案目录 data/answers。答案只用于修改后评测；网页修改前不显示。

所有记录尚待两名不同人员核对原文与中文摘要，confirmed=false，不能冻结为正式测试集。自动 schema/hash 通过不等于事实人工复核通过。

原始网页版权归来源方，仅作为本地教学研究证据归档。导出设计包不含网页快照。项目不使用学校 Logo 或讲者照片；logo.png 为 PosterLab 演示标识，hero.jpg 为原创几何图案，均按 CC0 提供。海报不是校方发布物。中文字体 Noto Sans CJK SC 为 SIL OFL 1.1，许可与源地址见 resources/fonts/。
