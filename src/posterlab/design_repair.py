"""Conservative delivery repairs; never substitute a locally designed poster.

The original response is retained by the caller. The normal validator and
isolated renderer must still accept the resulting document.
"""
import re

import tinycss2
from bs4 import BeautifulSoup, Comment


def compact(value):
    return re.sub(r'\s+', '', value)


def unsafe_tokens(tokens):
    for token in tokens:
        if token.type == 'error':
            return True
        if token.type == 'url' and not re.fullmatch(r'#[A-Za-z_][\w.-]*', token.value):
            return True
        if token.type == 'function':
            if token.lower_name in ('image-set', '-webkit-image-set', 'expression'):
                return True
            if token.lower_name == 'url':
                value = tinycss2.serialize(token.arguments).strip().strip('\"\'')
                if not re.fullmatch(r'#[A-Za-z_][\w.-]*', value):
                    return True
            if unsafe_tokens(token.arguments):
                return True
        if getattr(token, 'content', None) and unsafe_tokens(token.content):
            return True
    return False


def normalize_design(html, facts):
    """Repair resources and unambiguous fact annotations without redoing art."""
    if not isinstance(html, str) or len(html) > 300_000:
        raise ValueError('生成HTML无效或过长')
    soup = BeautifulSoup(html, 'html.parser')
    if len(soup.find_all(True)) > 3000:
        raise ValueError('页面元素过多')
    changes = []
    hidden_selectors = []

    def declarations(content, selector=None):
        kept = []
        for decl in tinycss2.parse_declaration_list(content, skip_comments=True, skip_whitespace=True):
            if decl.type != 'declaration' or unsafe_tokens(decl.value):
                changes.append('移除无法离线渲染的CSS声明')
                continue
            value = tinycss2.serialize(decl.value).strip().lower()
            if selector and ((decl.lower_name == 'display' and value == 'none') or
                             (decl.lower_name == 'visibility' and value in ('hidden', 'collapse')) or
                             (decl.lower_name == 'opacity' and value == '0')):
                hidden_selectors.append(selector)
            kept.append(decl)
        return tinycss2.serialize(kept)

    def stylesheet(content):
        parts = []
        for rule in tinycss2.parse_stylesheet(content, skip_comments=True, skip_whitespace=True):
            if rule.type == 'qualified-rule':
                selector = tinycss2.serialize(rule.prelude)
                parts.append(selector + '{' + declarations(rule.content, selector) + '}')
            elif rule.type == 'at-rule' and rule.lower_at_keyword in ('media', 'supports', 'layer', 'keyframes', '-webkit-keyframes') and rule.content is not None and not unsafe_tokens(rule.prelude):
                parts.append('@' + rule.at_keyword + ' ' + tinycss2.serialize(rule.prelude) + '{' + stylesheet(rule.content) + '}')
            else:
                changes.append('移除资源导入或不支持的CSS规则')
        return ''.join(parts)

    for node in soup.find_all('style'):
        node.string = stylesheet(node.get_text())
    for node in soup.select('[style]'):
        node['style'] = declarations(node['style'])

    hidden = set()
    for selector in hidden_selectors:
        try:
            hidden.update(id(n) for n in soup.select(selector))
        except Exception:
            pass  # Final validation and actual browser checks remain authoritative.

    def visible(node):
        for parent in [node, *node.parents]:
            if id(parent) in hidden or parent.has_attr('hidden'):
                return False
            if re.search(r'(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\s*[;!]|$))', parent.get('style', ''), re.I):
                return False
        return not node.find_parent('svg')

    poster = soup.select_one('#poster')
    if poster:
        aliases = {'location': 'venue', 'event_title': 'title', 'datetime': 'time'}
        for node in poster.select('[data-field]'):
            field = node['data-field']
            if field in aliases:
                node['data-field'] = aliases[field]
                changes.append('统一事实字段名称')
        for field, value in facts.items():
            marked = poster.select(f'[data-field="{field}"]')
            candidates = [n for n in poster.find_all(True) if n.name not in ('style', 'script', 'svg') and visible(n) and compact(n.get_text()) == compact(value)]
            # Prefer the smallest exact container. It preserves split-span typography.
            candidates.sort(key=lambda n: (n not in marked, len(n.find_all(True))))
            chosen = candidates[0] if candidates else None
            if chosen is None:
                # A label such as TIME sits beside the actual value: wrap only the value.
                for text in list(poster.find_all(string=True)):
                    if isinstance(text, Comment) or text.parent.name in ('style', 'script'):
                        continue
                    if compact(str(text)) == compact(value) and visible(text.parent):
                        chosen = soup.new_tag('span')
                        text.replace_with(chosen)
                        chosen.string = value
                        break
            if chosen is None:
                leaves = [n for n in marked if visible(n) and not n.find(True)]
                if len(leaves) == 1:
                    chosen = leaves[0]
                    chosen.string = value
                    changes.append('恢复用户确认的事实：' + field)
            if chosen is not None:
                if len(marked) != 1 or marked[0] is not chosen:
                    for node in marked:
                        if node is not chosen and chosen not in node.descendants and visible(node) and compact(node.get_text()) != compact(value):
                            if node.find(True):
                                raise ValueError('重复的可见事实内容冲突：' + field)
                            node.string = value
                            changes.append('恢复重复区域的事实：' + field)
                        del node['data-field']
                    chosen['data-field'] = field
                    changes.append('修复可见事实标记：' + field)
    # Do not rewrite otherwise valid HTML (including its SVG/whitespace) needlessly.
    return (str(soup) if changes else html), list(dict.fromkeys(changes))
