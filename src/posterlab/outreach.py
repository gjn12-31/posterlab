"""Generate and validate a complete outreach kit with the configured StepFun service."""
import hashlib
import json
from typing import Annotated, Literal

import httpx
from fastapi import HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from .outreach_strategy import build_messages
from .server import Brief

Channel = Literal['x', 'red', 'moments', 'wechat']
Edition = Literal['coffee', 'vinyl', 'nature', 'bloom', 'course', 'launch', 'afterglow']
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]
Quote = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=3000)]


class PaperSections(BaseModel):
    model_config = ConfigDict(extra='forbid')
    abstract: str = Field(default='', max_length=45000)
    introduction: str = Field(default='', max_length=45000)


class PaperRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    title: str = Field(min_length=1, max_length=500)
    byline: str = Field(default='', max_length=240)
    evidence: list[Quote] = Field(default_factory=list, max_length=5)
    sections: PaperSections | None = None

    @model_validator(mode='after')
    def has_source(self):
        if self.sections:
            if not (self.sections.abstract.strip() or self.sections.introduction.strip()):
                raise ValueError('请提供摘要或引言')
        elif not self.evidence:
            raise ValueError('缺少论文来源')
        return self


class CampaignRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    brief: Brief


class PaperKit(BaseModel):
    headline: str = Field(min_length=1, max_length=180)
    x: list[Text] = Field(min_length=1, max_length=6)
    red: Text
    moments: Text
    wechat: Text
    evidence_ids: dict[Channel, list[Annotated[int, Field(strict=True, gt=0)]]]


class CampaignKit(BaseModel):
    invitation: str = Field(min_length=1, max_length=900)
    edition: Edition
    tag: str = Field(min_length=1, max_length=80)
    reason: str = Field(min_length=1, max_length=300)


def checked_result(kind, result, payload):
    if kind == 'campaign':
        return CampaignKit.model_validate(result).model_dump()
    if payload.get('sections'):
        # The new workflow cites the confirmed sections as a whole. Optional
        # sentence IDs from a model are not a prerequisite for an otherwise usable kit.
        if not isinstance(result, dict):
            raise ValueError('Expected four platform drafts')
        drafts = {}
        for channel in ('x', 'red', 'moments', 'wechat'):
            value = result.get(channel)
            if channel == 'x':
                posts = value.splitlines() if isinstance(value, str) else value
                if isinstance(posts, list) and 0 < len(posts) <= 6 and all(
                    isinstance(post, str) and 0 < len(post.strip()) <= 4000 for post in posts
                ):
                    drafts[channel] = [post.strip() for post in posts]
            elif isinstance(value, str) and 0 < len(value.strip()) <= 4000:
                drafts[channel] = value.strip()
        if not drafts:
            raise ValueError('No usable platform copy')
        title = result.get('headline')
        drafts['headline'] = (title.strip() if isinstance(title, str) and title.strip() else payload['title'])[:180]
        return {**drafts, 'evidence_ids': {}}
    kit = PaperKit.model_validate(result)
    if set(kit.evidence_ids) != {'x', 'red', 'moments', 'wechat'}:
        raise ValueError('Missing channel evidence')
    for refs in kit.evidence_ids.values():
        if not refs or max(refs) > len(payload['evidence']):
            raise ValueError('Invalid evidence reference')
    return kit.model_dump()


def register_outreach(app, ledger, key, model, transport):
    async def generate(kind, data, request):
        if not key:
            raise HTTPException(503, 'StepFun 尚未配置，可选择本地排版。')
        token = request.headers.get('idempotency-key', '')
        if not 8 <= len(token) <= 100 or not all(c.isalnum() or c in '-_' for c in token):
            raise HTTPException(400, '请求标识无效')
        token = 'outreach-' + kind + '-' + token
        payload = data.model_dump()
        messages = build_messages(kind, payload)
        fingerprint = hashlib.sha256(json.dumps(messages, ensure_ascii=False).encode()).hexdigest()
        cached = ledger.reserve(token, fingerprint)
        if cached is not None:
            return cached
        cost = None
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(90, connect=10), transport=transport) as client:
                response = await client.post('https://api.stepfun.com/v1/chat/completions',
                    headers={'Authorization': 'Bearer ' + key},
                    json={'model': model, 'messages': messages, 'max_tokens': 8192 if kind == 'paper' else 4096, 'stream': False,
                          'response_format': {'type': 'json_object'}})
            if response.status_code != 200:
                certain = response.status_code < 500
                ledger.finish(token, 'rejected' if certain else 'unknown', 0 if certain else None)
                raise HTTPException(502, f'StepFun 返回 HTTP {response.status_code}，原稿已保留。')
            raw = response.json()
            counts = raw.get('usage', {})
            inp, out = counts.get('prompt_tokens'), counts.get('completion_tokens')
            if type(inp) is int and type(out) is int and min(inp, out) >= 0:
                cost = (inp * .7 + out * 2.1) / 1_000_000
            choice = raw['choices'][0]
            if choice.get('finish_reason') == 'length':
                ledger.finish(token, 'invalid', cost)
                raise HTTPException(502, '模型回复达到了长度上限。输入已保留，可以重试或使用本地摘录稿。')
            if choice.get('finish_reason') != 'stop':
                raise ValueError('Incomplete output')
            content = choice['message']['content'].strip()
            if content.startswith('```') and content.endswith('```'):
                content = content.partition('\n')[2].removesuffix('```').strip()
            result = checked_result(kind, json.loads(content), payload)
            result.update(provider='StepFun', model=model)
            ledger.finish(token, 'complete', cost, result)
            return result
        except HTTPException:
            raise
        except httpx.TransportError:
            ledger.finish(token, 'unknown')
            raise HTTPException(502, 'StepFun 连接中断，原稿已保留。') from None
        except (ValueError, KeyError, TypeError, IndexError, AttributeError):
            ledger.finish(token, 'invalid', cost)
            raise HTTPException(502, '模型返回的未返回四个平台的完整文案或所需字段。已保留输入，可重试或选择本地排版。') from None

    @app.post('/api/outreach/paper')
    async def paper(data: PaperRequest, request: Request):
        return await generate('paper', data, request)

    @app.post('/api/outreach/campaign')
    async def campaign(data: CampaignRequest, request: Request):
        return await generate('campaign', data, request)
