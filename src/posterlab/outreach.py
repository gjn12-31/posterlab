"""Generate and validate a complete outreach kit with the configured model service."""
import hashlib
import json
import re
from typing import Annotated, Literal

import httpx
from fastapi import HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

from .outreach_strategy import build_messages, publication_issues, publication_text, remove_unverified_links, revision_messages
from .server import Brief
from .paper_poster import PaperReading

Channel = Literal['x', 'red', 'moments', 'wechat']
Edition = Literal['coffee', 'vinyl', 'nature', 'bloom', 'course', 'launch', 'afterglow']
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]
Quote = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=3000)]


# A publisher or reviewer notice can also arrive from an older client, without
# PDF geometry. Remove only complete template sentences at source boundaries.
_REVIEW_NOTICE = re.compile(
    r'(^|(?<=[.!?。！？])[ \t]+|\n[ \t]*)(?:'
    r'(?:CVPR|ICCV|ECCV|ICLR|ICML|NeurIPS|ACL|EMNLP|AAAI)[ \t]+20\d{2}[ \t]+submission'
    r'(?:[ \t]+(?:ID|number|no\.?))?(?:[ \t]*#?[ \t]*\d{1,8})?'
    r'|confidential[ \t]+review[ \t]+copy|do[ \t]+not[ \t]+distribute'
    r'|anonymous[ \t]+(?:conference[ \t]+)?submission'
    r'|under[ \t]+review[ \t]+(?:as[ \t]+a[ \t]+conference[ \t]+paper[ \t]+at|at)'
    r'[ \t]+(?:ICLR|ICML|NeurIPS|CVPR)[ \t]+20\d{2})'
    r'(?:[.!](?=\s|$)|(?=[ \t]*(?:\n|$)))', re.IGNORECASE,
)


def _clean_review_notices(text: str) -> str:
    return _REVIEW_NOTICE.sub(r'\1', text.replace('\r\n', '\n')).strip()


class PaperSections(BaseModel):
    model_config = ConfigDict(extra='forbid')
    abstract: str = Field(default='', max_length=45000)
    introduction: str = Field(default='', max_length=45000)

    @field_validator('abstract', 'introduction')
    @classmethod
    def strip_review_notices(cls, value: str) -> str:
        return _clean_review_notices(value)


class PaperRequest(BaseModel):
    model: str | None = Field(default=None, max_length=80)
    model_config = ConfigDict(extra='forbid')
    title: str = Field(min_length=1, max_length=500)
    byline: str = Field(default='', max_length=240)
    voice: Literal['author', 'editor'] = 'author'
    evidence: list[Quote] = Field(default_factory=list, max_length=5)
    sections: PaperSections | None = None
    reading: PaperReading | None = None

    @field_validator('evidence')
    @classmethod
    def clean_evidence(cls, evidence: list[str]) -> list[str]:
        cleaned = [_clean_review_notices(quote) for quote in evidence]
        if any(not quote for quote in cleaned):
            raise ValueError('请用论文正文替换审稿信息作为引文')
        return cleaned

    @model_validator(mode='after')
    def has_source(self):
        if self.sections:
            if not (self.sections.abstract.strip() or self.sections.introduction.strip()):
                raise ValueError('请提供摘要或引言')
        elif not self.evidence:
            raise ValueError('缺少论文来源')
        return self


class CampaignRequest(BaseModel):
    model: str | None = Field(default=None, max_length=80)
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
    art_direction: str = Field(default='', max_length=850)


def checked_result(kind, result, payload):
    if kind == 'campaign':
        return CampaignKit.model_validate(result).model_dump(exclude_defaults=True)
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
        drafts['evidence_ids'] = {}
    else:
        kit = PaperKit.model_validate(result)
        if set(kit.evidence_ids) != {'x', 'red', 'moments', 'wechat'}:
            raise ValueError('Missing channel evidence')
        for refs in kit.evidence_ids.values():
            if not refs or max(refs) > len(payload['evidence']):
                raise ValueError('Invalid evidence reference')
        drafts = kit.model_dump()
    for channel in ('red', 'wechat'):
        if channel in drafts:
            drafts[channel] = publication_text(channel, drafts[channel], drafts['headline'], payload['title'])
    for field, limit in (('cover_line', 90), ('cover_title_en', 100), ('cover_line_en', 200)):
        value = result.get(field)
        if isinstance(value, str):
            line = ' '.join(value.split())
            if 0 < len(line) <= limit:
                drafts[field] = line
    return drafts


def register_outreach(app, ledger, gateway, transport):
    async def polish_paper(result, payload, token, model):
        issues = publication_issues(result, payload)
        if not issues:
            return
        check = {'channels': list(issues), 'revised': [], 'status': 'kept', 'model_calls': 1}
        result['publication_check'] = check
        messages = revision_messages(payload, result, issues)
        fingerprint = hashlib.sha256(json.dumps(messages, ensure_ascii=False).encode()).hexdigest()
        key = 'publication-review-' + token
        try:
            cached = ledger.reserve(key, gateway.identity(model, fingerprint, legacy_model='step-3.5-flash'))
        except HTTPException:
            # Budget/concurrency limits never discard the completed first call.
            return
        check['model_calls'] = 2
        ledger.checkpoint(token, remove_unverified_links(result, payload))
        if cached is not None:
            result.update(cached)
            return
        cost = None
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(150, connect=10), transport=transport) as client:
                response = await gateway.complete(client, model, messages, 'paper')
            if response.status_code != 200:
                rejected = 400 <= response.status_code < 500
                ledger.finish(key, 'rejected' if rejected else 'unknown', 0 if rejected else None)
                return
            raw = response.json()
            cost = gateway.cost(model, raw.get('usage', {}))
            choice = raw['choices'][0]
            if choice.get('finish_reason') != 'stop':
                raise ValueError
            patch = json.loads(choice['message']['content'].strip().removeprefix('```json').removesuffix('```').strip())
            if not isinstance(patch, dict):
                raise ValueError
            current_issues = issues.keys()
            for channel in issues:
                if channel not in patch:
                    continue
                candidate = {**result, channel: patch[channel]}
                if not payload.get('sections'):
                    refs = patch.get('evidence_ids')
                    if not isinstance(refs, dict) or not refs.get(channel):
                        continue
                    candidate['evidence_ids'] = {**result['evidence_ids'], channel: refs[channel]}
                try:
                    proposed = checked_result('paper', candidate, payload)
                except (ValueError, TypeError, KeyError):
                    continue
                remaining_issues = publication_issues(proposed, payload)
                if channel not in proposed or channel in remaining_issues or remaining_issues.keys() - current_issues:
                    continue
                result[channel] = proposed[channel]
                current_issues = remaining_issues.keys()
                result['evidence_ids'] = proposed['evidence_ids']
                check['revised'].append(channel)
            check['status'] = ('revised' if len(check['revised']) == len(issues)
                               else 'partial' if check['revised'] else 'kept')
            ledger.finish(key, 'complete', cost, result)
        except httpx.TransportError:
            ledger.finish(key, 'unknown')
        except (ValueError, KeyError, TypeError, IndexError, AttributeError):
            ledger.finish(key, 'invalid', cost)

    async def generate(kind, data, request):
        model = gateway.select(data.model, kind)
        if not gateway.api_key:
            raise HTTPException(503, f'{gateway.name} 尚未配置，可选择本地排版。')
        token = request.headers.get('idempotency-key', '')
        if not 8 <= len(token) <= 100 or not all(c.isalnum() or c in '-_' for c in token):
            raise HTTPException(400, '请求标识无效')
        token = 'outreach-' + kind + '-' + token
        payload = data.model_dump(exclude={'model'})
        messages = build_messages(kind, payload)
        fingerprint = hashlib.sha256(json.dumps(messages, ensure_ascii=False).encode()).hexdigest()
        cached = ledger.reserve(token, gateway.identity(model, fingerprint, legacy_model='step-3.5-flash'))
        if cached is not None:
            return cached
        cost = None
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(300 if gateway.name == 'Paratera' else 90, connect=10), transport=transport) as client:
                response = await gateway.complete(client, model, messages, kind)
            if response.status_code != 200:
                certain = response.status_code < 500
                ledger.finish(token, 'rejected' if certain else 'unknown', 0 if certain else None)
                raise HTTPException(502, f'{gateway.name} 返回 HTTP {response.status_code}，原稿已保留。')
            raw = response.json()
            counts = raw.get('usage', {})
            cost = gateway.cost(model, counts)
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
            result.update(provider=gateway.name, model=model)
            if kind == 'paper':
                await polish_paper(result, payload, token, model)
                result = remove_unverified_links(result, payload)
                if not any(result.get(c) for c in ('x','red','moments','wechat')):
                    raise ValueError('No publishable channel remains')
            ledger.finish(token, 'complete', cost, result)
            return result
        except HTTPException:
            raise
        except httpx.TransportError:
            ledger.finish(token, 'unknown')
            raise HTTPException(502, f'{gateway.name} 连接中断，原稿已保留。') from None
        except (ValueError, KeyError, TypeError, IndexError, AttributeError):
            ledger.finish(token, 'invalid', cost)
            raise HTTPException(502, '模型回复中没有可读取的发布稿。输入已保留，可重试或选择本地排版。') from None

    @app.post('/api/outreach/paper')
    async def paper(data: PaperRequest, request: Request):
        return await generate('paper', data, request)

    @app.post('/api/outreach/campaign')
    async def campaign(data: CampaignRequest, request: Request):
        return await generate('campaign', data, request)
