"""Generate reusable, text-free editorial artwork for a campaign or a research paper."""
import asyncio
import base64
import binascii
import hashlib
from io import BytesIO
from ipaddress import ip_address
import json
import re
import socket

import httpx
from fastapi import HTTPException, Request
from PIL import Image, ImageOps
from pydantic import BaseModel, ConfigDict, Field

from .outreach import Edition

MAX_BYTES = 8 * 1024 * 1024
ART_DIRECTIONS = {
    'coffee': '陶杯、咖啡液与侧光，温暖的街区静物摄影',
    'vinyl': '黑胶唱片、现场灯光与饱和阴影',
    'nature': '自然观察纪实摄影和舒展的景深',
    'bloom': '植物标本式近景和柔和的自然光',
    'course': '围绕讲座主题设计的清晰几何构成',
    'launch': '材质与折面形成的产品静物',
    'afterglow': '具有空间感的实验性光影艺术',
}


class ArtworkBrief(BaseModel):
    model: str | None = Field(default=None, max_length=80)
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=180)
    description: str = Field(default='', max_length=1200)
    edition: Edition = 'afterglow'
    art_direction: str = Field(default='', max_length=850)



def _prompt(brief):
    return (
        '创作一幅可用于文化机构活动海报的原创主视觉，构图填满方形画面。以活动的独特细节做出一个明确的视觉中心，'
        '将关键主体完整放在画面中部略偏右、垂直约 55% 的区域，四周保留裁切余量。左上留连续而安静的暗调空间，'
        '让后期叠加的浅色题名清晰。细节集中在主体，边缘克制，光源与阴影一致；避免拼贴多幅小图和通用图库式摆拍。'
        '只交付平面图像本身，不画海报边框、文字、字母、标志、二维码、价格牌或样机。'
        '主视觉创作方向：' + (brief.art_direction or ART_DIRECTIONS[brief.edition]) + '。活动事实仅用于理解主题：\n'
        + json.dumps({'title': brief.title, 'description': brief.description}, ensure_ascii=False)
    )


async def _read_limited(response, limit):
    chunks = bytearray()
    async for chunk in response.aiter_bytes(chunk_size=65536):
        if len(chunks) + len(chunk) > limit:
            raise ValueError('Image response too large')
        chunks.extend(chunk)
    return bytes(chunks)


async def _public_address(host):
    records = await asyncio.get_running_loop().getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    addresses = [ip_address(r[4][0]) for r in records]
    if not addresses or any(not a.is_global or a.is_multicast for a in addresses):
        raise ValueError('Expected public image storage')
    # Prefer IPv4 when the CDN offers both protocols.
    return str(min(addresses, key=lambda a: a.version))


async def _download_asset(location, transport):
    url = httpx.URL(location)
    async with asyncio.timeout(45):
        for _ in range(3):
            if url.scheme != 'https' or not url.host or url.port not in (None, 443) or url.userinfo:
                raise ValueError('Unexpected image URL')
            address = await _public_address(url.host)
            # Pin the checked address while preserving TLS verification and signed URL paths.
            # A fresh, credential-free client also isolates cookies on CDN redirects.
            async with httpx.AsyncClient(transport=transport, trust_env=False, timeout=20) as client:
                async with client.stream('GET', url.copy_with(host=address),
                                         headers={'Host': url.netloc.decode(), 'Accept-Encoding': 'identity'},
                                         extensions={'sni_hostname': url.raw_host.decode()}) as response:
                    if response.is_redirect and 'location' in response.headers:
                        url = url.join(response.headers['location'])
                        continue
                    if response.status_code != 200 or response.headers.get('Content-Encoding', 'identity').lower() != 'identity':
                        raise ValueError('Image storage returned no usable file')
                    return await _read_limited(response, MAX_BYTES)
    raise ValueError('Too many image storage redirects')


def _webp(data):
    with Image.open(BytesIO(data), formats=('PNG', 'JPEG', 'WEBP')) as image:
        if image.width * image.height > 20_000_000:
            raise ValueError('Image has too many pixels')
        original = ImageOps.exif_transpose(image)
        original.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
        out = BytesIO()
        original.convert('RGB').save(out, format='WEBP', quality=89, method=4)
    return 'data:image/webp;base64,' + base64.b64encode(out.getvalue()).decode('ascii')


class PaperArtworkBrief(BaseModel):
    model: str | None = Field(default=None, max_length=80)
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=500)
    abstract: str = Field(min_length=1, max_length=3500)


def paper_art_direction(brief):
    return (
        'Design an original, text-free cover photograph or art-directed conceptual illustration for a research magazine. '
        'Read the paper title and abstract below as source material only. Choose one visually specific, recognizable '
        'metaphor for the actual research idea, using the material, geometry, or environment the topic suggests. '
        'Give the single subject a striking silhouette, editorial lighting, a restrained palette with one vivid accent, '
        'and generous tonal separation. Keep the main subject in the upper right quadrant of a square composition, '
        'with the left and bottom falling naturally into deep shadow for typography. The top half must work as a wide crop. '
        'Avoid generic stock AI motifs, glowing brains, decorative graphs, interface panels and repetitive pattern wallpaper. '
        'Draw no text, lettering, diagrams, axes, figures, measurement scales, invented experimental results or numbers. '
        'The client separately typesets all words and inserts the original published figure without modification. '
        'Research source:\n' + json.dumps(brief.model_dump(exclude={'model'}), ensure_ascii=False)
    )


def register_artwork(app, ledger, gateway, transport):
    @app.post('/api/outreach/artwork')
    async def create(brief: ArtworkBrief, request: Request):
        return await create_image(_prompt(brief), 'campaign', request, brief.model)

    @app.post('/api/outreach/paper-artwork')
    async def paper_artwork(brief: PaperArtworkBrief, request: Request):
        return await create_image(paper_art_direction(brief), 'paper', request, brief.model)

    async def create_image(prompt, workflow, request, selected):
        if not gateway.artwork_model:
            raise HTTPException(503, '请先配置并行智算云的大模型 API 密钥。')
        model = gateway.select(selected, 'artwork')
        token = request.headers.get('idempotency-key', '')
        if not re.fullmatch(r'[a-zA-Z0-9_-]{8,100}', token):
            raise HTTPException(400, '缺少有效的请求标识')
        token = workflow + '-artwork-' + token
        payload = {'model': model, 'prompt': prompt}
        digest = hashlib.sha256(json.dumps(payload, ensure_ascii=False).encode()).hexdigest()
        cached = ledger.reserve(token, gateway.identity(model, digest))
        if cached and 'data_url' in cached:
            return cached

        # Cache the generated file reference so a temporary CDN failure can be
        # retried with the same key without paying for a second generation.
        if cached:
            source = cached['source']
        else:
            try:
                async with httpx.AsyncClient(transport=transport, timeout=httpx.Timeout(120, connect=10)) as client:
                    async with client.stream('POST', gateway.base_url + '/images/generations',
                                             headers={'Authorization': 'Bearer ' + gateway.api_key,
                                                      'Accept-Encoding': 'identity'}, json=payload) as response:
                        if response.status_code != 200:
                            rejected = 400 <= response.status_code < 500
                            ledger.finish(token, 'rejected' if rejected else 'unknown', 0 if rejected else None)
                            raise HTTPException(502, f'并行智算云图片服务返回 HTTP {response.status_code}，原海报已保留。')
                        raw = json.loads(await _read_limited(response, MAX_BYTES * 4 // 3 + 8192))
                first = raw['data'][0]
                source = {'url': first['url']} if first.get('url') else {'b64_json': first['b64_json']}
                if not isinstance(next(iter(source.values())), str):
                    raise ValueError('Missing image')
                ledger.finish(token, 'complete', None, {'source': source})
            except httpx.TransportError:
                ledger.finish(token, 'unknown')
                raise HTTPException(502, '图片服务连接中断，请核对平台用量。') from None
            except (ValueError, KeyError, IndexError, AttributeError, TypeError):
                ledger.finish(token, 'invalid')
                raise HTTPException(502, '图片服务未返回可用的图片，原海报已保留。') from None

        try:
            if 'url' in source:
                image = await _download_asset(source['url'], transport)
            else:
                image = base64.b64decode(source['b64_json'], validate=True)
                if len(image) > MAX_BYTES:
                    raise ValueError('Image too large')
            data_url = await asyncio.to_thread(_webp, image)
        except (ValueError, OSError, TimeoutError, httpx.HTTPError, httpx.InvalidURL, binascii.Error, Image.DecompressionBombError):
            raise HTTPException(502, '图片已生成但暂时无法读取。重试将继续取图。', headers={'X-PosterLab-Reusable':'1'}) from None
        result = {'data_url': data_url, 'provider': gateway.name, 'model': model}
        # Paratera does not return a settled monetary amount in this response.
        ledger.finish(token, 'complete', None, result)
        return result
