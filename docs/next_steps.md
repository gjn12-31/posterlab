# 从离线框架到真实实测

1. 确认导师与课程要求，补 docs/mentor_approval.md。
2. 两位成员逐场核对 data/sources 与答案，签名后设置 confirmed=true，重新计算 manifest hash；不要跳过复核直接批量勾选。
3. 复制 .env.example 为 .env，在本机填写执行、评审密钥；configs/dev.yaml 填两个已确认可用的模型 ID。不要把密钥发到聊天或写入 YAML。
4. 运行 doctor。无付费调用。首次可以直接运行一个开发任务完整流程：run --task e001-standard --mode dev；正常需要4次请求。若另做 smoke，同样计入 Pilot 4次上限，需核定预算后调整，不能清空账本绕过限制。
5. 检查真实返回、PNG、公开反馈、修改、两个独立 judge JSON、usage、延迟和失败状态。API 成功返回不等于作品合格。真实数据不人工修改后冒充模型输出。
6. scripts/build_calibration.py 生成5份校准样例，由两人先建立预期标签；之后每图两次独立真实评审，共10次，需要先确认预算。校准通过后才能正式采用视觉评审。
7. 对照定价、图像/缓存计费和账单确定 money_caps、reservations、prices_confirmed。账本当前对未知费用保留预留额，不用0替代。Pilot 未知支出需核账。
8. 完成冻结、正式批次和抽检，生成真实报告；再制作 API Demo Word、Market and Steps HTML 与最终 Proposal。当前不把离线样例包装成这些材料中的真实 API 证据。

现在已能完成网页全流程的离线演示；真实服务、校准、正式实验及课程最终文档属于后续阶段。
