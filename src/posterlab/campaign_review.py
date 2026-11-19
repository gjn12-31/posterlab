"""Review a single, already typeset activity poster with the configured vision model."""
import base64
import binascii
import hashlib
from io import BytesIO
import json
import re
from typing import Literal

import httpx
from fastapi import HTTPException, Request
from PIL import Image
from pydantic import BaseModel, ConfigDict, Field, model_validator

from .evaluation import RUBRIC, SYSTEM, parse_critique
from .server import Brief


class PrintProof(BaseModel):
    model: str | None = Field(default=None, max_length=80)
    model_config = ConfigDict(extra='forbid')
    brief: Brief
    format: Literal['portrait', 'square', 'landscape']
    jpeg: str = Field(min_length=4, max_length=1_600_000)

    @model_validator(mode='after')
    def verify_picture(self):
        try:
            raw = base64.b64decode(self.jpeg, validate=True)
            with Image.open(BytesIO(raw), formats=['JPEG']) as image:
                w, h = image.size
                aspect = {'portrait': 3 / 4, 'square': 1, 'landscape': 16 / 9}[self.format]
                if min(w, h) < 160 or max(w, h) > 1600 or abs(w / h - aspect) > .005:
                    raise ValueError
                image.load()
        except (OSError, ValueError, Image.DecompressionBombError, binascii.Error):
            # Avoid a validation response echoing the supplied image.
            raise HTTPException(422, '需要当前画幅的 JPEG 成图。') from None
        return self


def register_campaign_review(app, ledger, gateway, transport):
    @app.post('/api/outreach/campaign-review')
    async def review(proof: PrintProof, request: Request):
        model = gateway.select(proof.model, 'review')
        if not gateway.api_key or not gateway.sees_images(model):
            raise HTTPException(503, '视觉模型尚未连接。')
        key = request.headers.get('idempotency-key', '')
        if not re.fullmatch(r'[a-zA-Z0-9_-]{8,100}', key):
            raise HTTPException(400, '缺少有效的请求标识')
        key = 'campaign-review-' + key
        fingerprint = hashlib.sha256(proof.model_dump_json(exclude={'model'}).encode()).hexdigest()
        cached = ledger.reserve(key, gateway.identity(model, fingerprint, legacy_model='step-5-preview'))
        if cached is not None:
            return cached
        context = {'活动事实': proof.brief.model_dump(), '画幅': proof.format, '评分维度': RUBRIC}
        messages = [
            {'role': 'system', 'content': SYSTEM + '\n这是社交活动宣传套装的单张成图。活动简介供理解主题，另有完整配套邀请文案，不要求在海报上刊登整段简介；'
             '请检查实际题名、日期、地点及图像焦点。平台 AI 标识属于保留的来源标注，不能建议去除、遮挡、裁掉或要求模型隐去标识。'
             '建议需能通过当前的拖动文字图层、调整字号、选择色彩或重新创作配图完成。'},
            {'role': 'user', 'content': [
                {'type': 'text', 'text': json.dumps(context, ensure_ascii=False)},
                {'type': 'image_url', 'image_url': {'url': 'data:image/jpeg;base64,' + proof.jpeg, 'detail': 'high'}},
            ]},
        ]
        cost = None
        try:
            async with httpx.AsyncClient(transport=transport, timeout=httpx.Timeout(300, connect=10)) as client:
                response = await gateway.complete(client, model, messages, 'review')
            if response.status_code != 200:
                rejected = 400 <= response.status_code < 500
                ledger.finish(key, 'rejected' if rejected else 'unknown', 0 if rejected else None)
                raise HTTPException(502, f'视觉模型返回 HTTP {response.status_code}，海报仍可编辑。')
            raw = response.json()
            cost = gateway.cost(model, raw.get('usage', {}))
            choice = raw['choices'][0]
            if choice.get('finish_reason') != 'stop':
                raise ValueError
            report = parse_critique(choice['message']['content'])
        except httpx.TransportError:
            ledger.finish(key, 'unknown')
            raise HTTPException(502, '视觉模型连接中断，海报仍可编辑。') from None
        except (ValueError, TypeError, IndexError, KeyError, AttributeError):
            ledger.finish(key, 'invalid', cost)
            raise HTTPException(502, '视觉模型未返回完整审片意见。') from None
        priorities = sorted(report['dimensions'], key=lambda item: item['score'])[:2]
        result = {'model': model, 'summary': report['summary'], 'priorities': [
            {k: item[k] for k in ('name', 'evidence', 'suggestion')} for item in priorities
        ]}
        ledger.finish(key, 'complete', cost, result)
        return result
