"""Supported StepFun models, with server-side capability validation."""
from fastapi import HTTPException

MODELS = [
    {'id': 'step-5-preview', 'name': 'Step 5 Preview', 'description': '复杂创作与推理 · 支持原图反馈', 'roles': ['chat', 'design', 'review', 'paper', 'campaign']},
    {'id': 'step-3.7-flash', 'name': 'Step 3.7 Flash', 'description': '多模态 Flash · 支持原图反馈', 'roles': ['chat', 'design', 'review', 'paper', 'campaign']},
    {'id': 'step-3.5-flash', 'name': 'Step 3.5 Flash', 'description': '文本创作 · 修改时参考源码，不读取原图', 'roles': ['chat', 'design', 'paper', 'campaign']},
]

# Each entry supports the protocol exercised by its assigned workflow. The
# image endpoint uses a separate allowlist from chat completions.
PARATERA_MODELS = [
    ('Kimi-K3.1-Pro', '论文研读与宣传文案', ('chat', 'design', 'paper', 'campaign')),
    ('DeepSeek-V4-Pro-0813', '活动策划与复杂排版', ('chat', 'design', 'paper', 'campaign')),
    ('DeepSeek-V4.1-Flash-1017', '文本创作与快速迭代', ('chat', 'design', 'paper', 'campaign')),
    ('Qwen3.7-Plus', '视觉审阅与原图反馈', ('review', 'design')),
    ('GLM-4.6V', '多模态视觉审阅', ('review',)),
    ('Doubao-Seedream-4.5', '图像生成 · 主视觉', ('artwork',)),
    ('Doubao-Seedream-4.0', '图像生成 · 风格备选', ('artwork',)),
]


def resolve_model(selected, default, role, catalog=MODELS):
    value = selected or default
    entry = next((m for m in catalog if m['id'] == value), None)
    if not entry or role not in entry['roles']:
        raise HTTPException(400, '所选模型不支持此用途，请在创作偏好中重新选择')
    return value
