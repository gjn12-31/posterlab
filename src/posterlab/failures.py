"""Stable user-facing failures; provider bodies and secrets never become UI text."""
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import math

import httpx
from fastapi import HTTPException


class Failure(ValueError):
    def __init__(self, code, message, suggestion, *, stage='provider', repairable=False,
                 uncertain=False, retry_after=0, details=''):
        super().__init__(message)
        self.code, self.message, self.suggestion = code, message, suggestion
        self.stage, self.repairable, self.uncertain = stage, repairable, uncertain
        self.retry_after, self.details = retry_after, str(details)[:1200]

    def public(self):
        return {'code':self.code, 'message':self.message, 'suggestion':self.suggestion,
                'stage':self.stage, 'charge_uncertain':self.uncertain,
                'retry_after_seconds':self.retry_after, 'details':self.details}


def retry_delay(value):
    try:
        seconds=float(value)
    except (ValueError, TypeError):
        try:seconds=(parsedate_to_datetime(value)-datetime.now(timezone.utc)).total_seconds()
        except (ValueError, TypeError, OverflowError):return 30
    return max(1,min(900,math.ceil(seconds))) if math.isfinite(seconds) else 30


def check_provider(response):
    status=response.status_code
    if status==200:return
    if status in (401,403):
        raise Failure('provider_auth','模型服务未授权。','请检查服务端 API Key 和所选模型权限后重新生成。')
    if status==402:
        raise Failure('provider_quota','模型平台余额或额度不足。','请在模型平台补充余额或额度后重新生成。')
    if status==429:
        raise Failure('provider_rate_limit','模型服务暂时限流。','请稍后重试；本次不会自动重复调用。',retry_after=retry_delay(response.headers.get('retry-after')))
    if status>=500 or status==408:
        raise Failure('provider_unavailable',f'模型服务暂时异常（HTTP {status}）。','请稍后核对平台记录，再重新生成。',uncertain=True)
    raise Failure('provider_rejected',f'模型服务拒绝了请求（HTTP {status}）。','请检查模型权限、输入长度和服务配置后重试。')


def provider_document(response):
    try:
        raw=response.json()
        if not isinstance(raw,dict):raise ValueError()
        choices=raw.get('choices')
        if not isinstance(choices,list) or not choices or not isinstance(choices[0],dict):raise ValueError()
        message=choices[0].get('message')
        if not isinstance(message,dict) or not isinstance(message.get('content'),str):raise ValueError()
        return raw
    except (ValueError,TypeError):
        raise Failure('provider_response','模型服务返回的响应无法读取。','原请求未自动重发；请核对平台记录后重试。',uncertain=True) from None


def clean_usage(raw):
    usage=raw.get('usage')
    if not isinstance(usage,dict):return {}
    return {k:v for k,v in usage.items() if k in ('prompt_tokens','completion_tokens','total_tokens') and type(v) is int and v>=0}


def classify(exc, stage='internal'):
    if isinstance(exc,Failure):return exc
    if isinstance(exc,(httpx.ConnectError,httpx.ConnectTimeout,httpx.PoolTimeout)):
        return Failure('connection_failed','未能连接模型服务。','请检查网络后重试；未收到模型响应。')
    if isinstance(exc,httpx.TransportError):
        return Failure('network_unknown','连接中断，远端状态未知。','请先核对平台调用记录；再次生成可能产生额外费用。',uncertain=True)
    if isinstance(exc,HTTPException):
        code={402:'local_budget',429:'local_busy',503:'configuration'}.get(exc.status_code,'request_invalid')
        return Failure(code,str(exc.detail),'请处理上述原因后重试；尚未发出的请求不会调用模型。',stage='queue')
    if isinstance(exc,OSError):
        return Failure('storage_error','作品文件暂时无法读取或保存。','请检查本机磁盘空间、文件权限及素材是否完整，再尝试本地恢复。',stage=stage)
    return Failure('internal_error','处理过程中遇到异常，任务记录已保留。','请先重新连接服务；有已保存设计时可尝试本地恢复。',stage=stage)


def interrupted():
    return Failure('interrupted','任务被服务重启中断。','已返回的设计可以本地恢复；核对平台记录后再发起新的模型请求。',stage='interrupted',uncertain=True)
