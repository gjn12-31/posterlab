"""Supported StepFun models, with server-side capability validation."""
from fastapi import HTTPException

MODELS = [
    {'id': 'step-5-preview', 'name': 'Step 5 Preview', 'description': '复杂创作与推理 · 支持原图反馈', 'roles': ['chat', 'design', 'review']},
    {'id': 'step-3.7-flash', 'name': 'Step 3.7 Flash', 'description': '多模态 Flash · 支持原图反馈', 'roles': ['chat', 'design', 'review']},
    {'id': 'step-3.5-flash', 'name': 'Step 3.5 Flash', 'description': '文本创作 · 修改时参考源码，不读取原图', 'roles': ['chat', 'design']},
]

def resolve_model(selected, default, role):
    value = selected or default
    entry = next((m for m in MODELS if m['id'] == value), None)
    if not entry or role not in entry['roles']:
        raise HTTPException(400, '所选模型不支持此用途，请在创作偏好中重新选择')
    return value
