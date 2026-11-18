"""Release destinations the paper explicitly invites readers to use."""
import re
from urllib.parse import urlsplit


_URL = re.compile(r"https?://[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+", re.I)
_SENTENCE = re.compile(r"(?<=[.!?;])\s+|[。！？；]")
_RELEASE = re.compile(
    r"\bwe\s+(?:also\s+)?(?:release[ds]?|share[ds]?|provide[ds]?|publish(?:ed)?|open[- ]sourced?|make|made)\b"
    r"|\b(?:our\s+)?(?:source\s+code|code|implementations?|checkpoints?|models?|datasets?|demo|project\s+(?:page|website))"
    r"(?:\s+(?:and|for|the|model|code|weights|data|checkpoints?)){0,5}\s+(?:is|are|can\s+be)\s+(?:publicly\s+)?(?:available|released|found|accessed)"
    r"|(?:^|[,(（，]\s*)(?:code|checkpoint|demo|project\s+(?:page|website)|代码|权重|演示|项目主页)\s*[:：]"
    r"|(?:我们|本文|本工作)(?:.{0,20})(?:公开|开源|提供|发布)|(?:代码|权重|数据集|演示)(?:已|现已)(?:公开|开源|发布)",
    re.I,
)
_FUTURE = re.compile(r"\b(?:will|plan(?:ned)? to|upon (?:acceptance|publication)|forthcoming|not yet)\b|尚未|即将|计划|拟于|将于|将会", re.I)
_OTHER = re.compile(r"\b(?:baseline|prior work|third.party|their|not (?:available|release[ds]?))\b|基线|前人|第三方|暂不", re.I)
_KINDS = (
    ("代码", r"\b(?:code|implementations?|packages?|repos?(?:itory)?|libraries|library)\b|代码|开源库|实现"),
    ("模型权重", r"\b(?:checkpoints?|weights)\b|权重"),
    ("演示", r"\b(?:demos?|playground)\b|演示"),
    ("数据集", r"\bdatasets?\b|数据集"),
)
_MAX_LINKS = 4


def release_links(payload: dict) -> list[dict[str, str]]:
    sections = payload.get("sections") or {}
    passages = [sections.get("abstract", ""), sections.get("introduction", ""), *payload.get("evidence", [])]
    result = []
    seen = set()
    for passage in passages:
        compact = " ".join(passage.split())
        for match in _URL.finditer(compact):
            url = match.group().rstrip(".,;")
            while url.endswith(")") and url.count(")") > url.count("("):
                url = url[:-1]
            if url in seen or len(url) > 600:
                continue
            try:
                address = urlsplit(url)
                host = address.hostname or ""
                if (
                    address.scheme != "https" or "." not in host or not address.path.strip("/")
                    or address.username or address.password or address.query
                    or host in {"doi.org", "dx.doi.org", "arxiv.org", "openreview.net"}
                    or host.endswith((".internal", ".local")) or re.fullmatch(r"[\d.]+", host)
                ):
                    continue
            except ValueError:
                continue
            lead = _SENTENCE.split(compact[max(0, match.start() - 380):match.start()])[-1]
            if not _RELEASE.search(lead) or _FUTURE.search(lead) or _OTHER.search(lead):
                continue
            kinds = [name for name, regex in _KINDS if re.search(regex, lead, re.I)]
            if not kinds and not re.search(r"project (?:page|website)|项目主页", lead, re.I):
                continue
            result.append({"label": "与".join(kinds[:2]) or "项目主页", "url": url})
            seen.add(url)
            if len(result) == _MAX_LINKS:
                return result
    return result
