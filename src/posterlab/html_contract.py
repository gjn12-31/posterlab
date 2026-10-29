import re
from bs4 import BeautifulSoup
import tinycss2

CONTRACT = '''输出完整 doctype/html/head/body 文档，唯一 #poster 固定 1080x1440px。
每个必备字段使用一个 data-field 容器，每张素材使用 img data-asset 和清单中的相对 src。
只允许静态 HTML/CSS，使用 PosterSans。禁止脚本、事件、表单、SVG、iframe、外链、base64、所有 CSS @规则与 CSS 伪元素。
关键文字及祖先不得 transform/rotate/scale。不得用 CSS 伪元素承载事实。'''
ALLOWED = {'html','head','body','title','meta','style','main','section','article','header','footer','div','h1','h2','h3','p','span','img','br','strong','b','em','small','ul','ol','li'}


def extract_html(text):
    text=text.strip()
    if text.startswith('```'):
        m=re.fullmatch(r'```(?:html)?\s*\n(.*?)\n```',text,re.S|re.I)
        if not m or '```' in m.group(1): raise ValueError('需要唯一 HTML 代码块')
        text=m.group(1).strip()
    if not re.match(r'<!doctype\s+html\s*>',text,re.I) or not re.search(r'</html>\s*$',text,re.I):
        raise ValueError('缺少完整 HTML 文档或含额外说明')
    return text


def validate_html(html, task, creative=False):
    errors=[]; soup=BeautifulSoup(html,'html.parser')
    # Product mode supports static vector illustration; the legacy research contract stays unchanged.
    svg_tags={'svg','g','path','rect','circle','ellipse','line','polyline','polygon','defs','lineargradient','radialgradient','stop','clippath','mask','filter','fegaussianblur','feoffset','fecolormatrix','feblend','femerge','femergenode','feturbulence','fedisplacementmap','fecomposite','feflood','text','tspan','pattern','desc'}
    allowed=ALLOWED | (svg_tags | {'i','u','hr','figure','figcaption','label'} if creative else set())
    if len(soup.select('#poster'))!=1: errors.append('需要唯一 #poster 根节点')
    if len(soup.find_all('html'))!=1 or not soup.head or not soup.body: errors.append('html/head/body 必须完整')
    allowed_sources={a.path for a in task.assets}
    def scan_tokens(tokens):
        for tok in tokens:
            if tok.type=='error': errors.append('CSS 解析错误')
            if tok.type=='url' and not (creative and re.fullmatch(r'#[A-Za-z_][\w.-]*',tok.value)): errors.append('不允许 CSS 外部 URL')
            if tok.type=='function':
                if tok.lower_name=='url':
                    value=tinycss2.serialize(tok.arguments).strip().strip('\"\'')
                    if not (creative and re.fullmatch(r'#[A-Za-z_][\w.-]*',value)): errors.append('不允许 CSS 外部资源')
                if tok.lower_name in ('image-set','expression'): errors.append('不允许 CSS 外部资源或表达式')
                scan_tokens(tok.arguments)
            if hasattr(tok,'content') and tok.content: scan_tokens(tok.content)
    for el in soup.find_all(True):
        if el.name not in allowed: errors.append(f'不允许标签 {el.name}')
        for key,value in el.attrs.items():
            if key.lower().startswith('on') or key.lower() in ('srcset','href','xlink:href','action','formaction','srcdoc','background') or (key.lower()=='xmlns' and not (creative and el.name=='svg' and value=='http://www.w3.org/2000/svg')):
                errors.append(f'不允许属性 {key}')
            if creative and isinstance(value,str) and ('url(' in value.lower() or 'expression(' in value.lower()):scan_tokens(tinycss2.parse_component_value_list(value))
        if el.name=='meta' and (el.get('http-equiv') or (el.get('charset') and el.get('charset').lower()!='utf-8')): errors.append('不允许重定向或冲突编码')
        if el.name=='img' and el.get('src') not in allowed_sources: errors.append(f'素材路径不在白名单: {el.get("src")}')
        if el.get('src') and el.name!='img': errors.append('只有 img 可使用 src')
    css='\n'.join(x.get_text() for x in soup.find_all('style'))
    def scan_rules(rules):
        for rule in rules:
            if rule.type=='at-rule':
                if creative and rule.lower_at_keyword in ('media','supports','layer','keyframes','-webkit-keyframes') and rule.content is not None:
                    scan_tokens(rule.prelude);scan_rules(tinycss2.parse_rule_list(rule.content,skip_comments=True,skip_whitespace=True))
                else:errors.append('不允许导入资源或自定义字体的 CSS @规则')
            elif rule.type=='error': errors.append('CSS 解析失败')
            elif rule.type=='qualified-rule':
                if not creative and re.search(r'::?(before|after)',tinycss2.serialize(rule.prelude),re.I): errors.append('不允许伪元素文字')
                scan_tokens(rule.content)
    scan_rules(tinycss2.parse_stylesheet(css,skip_comments=True,skip_whitespace=True))
    for el in soup.select('[style]'): scan_tokens(tinycss2.parse_component_value_list(el['style']))
    for field in task.required_fields:
        if len(soup.select(f'[data-field="{field}"]'))!=1: errors.append(f'字段容器须唯一: {field}')
    for a in task.assets:
        els=soup.select(f'img[data-asset="{a.asset_id}"]')
        if a.required and (not els or (not creative and len(els)!=1) or any(el.get('src')!=a.path for el in els)): errors.append(f'素材标注错误: {a.asset_id}')
    return {'schema_version':'1.0','valid':not errors,'errors':sorted(set(errors))}
