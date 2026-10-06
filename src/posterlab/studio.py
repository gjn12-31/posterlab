"""User-authored poster briefs and approachable labels, separate from benchmark data."""
from datetime import date
from html import escape
import re
from .schemas import PublicTask,Canvas,AnswerSpec,FieldAnswer,SourceReview

THEMES = {
    'paper': {'name':'暖纸人文','description':'温暖留白 · 艺术沙龙','background':'#f4ecde','ink':'#633832','accent':'#bb6350','brief':'暖纸人文风格：米白纸色、陶土红与深褐色，编辑式大标题、克制的圆形装饰和舒展留白。'},
    'blue': {'name':'蓝调学术','description':'理性秩序 · 讲座论坛','background':'#edf2ff','ink':'#193c7b','accent':'#456bd1','brief':'蓝调学术风格：冷白与钴蓝色，清晰的信息层级、规整网格和抽象几何。'},
    'sage': {'name':'青绿漫想','description':'轻盈自然 · 创意分享','background':'#eaf0e7','ink':'#244b41','accent':'#668c69','brief':'青绿漫想风格：浅鼠尾草绿、森林绿与柔和柠檬黄，简洁大标题、有机圆形和轻盈留白。'},
}
FIELD_NAMES={'title':'标题','speaker':'主讲人','date':'日期','time':'时间','venue':'地点','description':'活动介绍'}
DEFAULT_FIELDS={'title':'人工智能与创新设计','speaker':'设计分享嘉宾','date':'2026-10-24','time':'14:00–16:00','venue':'创意空间 · 一层展厅','description':'从一个灵感开始，探索人工智能与设计的更多可能。一起分享创作方法，交流新鲜想法，把想象变成看得见的作品。'}
SAMPLE_NAMES=['用 AI 看见科学的新可能','多智能体的协作与学习','机器人的灵巧之手','探索多体量子系统','量子编码与错误检测','量子信息与精密测量','共享量子的非定域性','理解生成流网络','让视觉推理走得更远','大模型如何理解上下文']


def public_fields(task):
    result={}
    for line in task.sources.get('sources/notice.txt','').splitlines():
        name,sep,value=line.partition('：')
        if sep and name in FIELD_NAMES:result[name]=value
    update=task.sources.get('sources/update.txt','')
    match=re.search(r'改为 (\d{4}-\d{2}-\d{2})',update)
    if match:result['date']=match[1]
    return result


def clean_fields(fields):
    limits={'title':180,'speaker':120,'date':10,'time':80,'venue':220,'description':1200}
    cleaned={}
    for name,maximum in limits.items():
        value=str(fields.get(name,'')).strip()
        if not value:raise ValueError(f'请填写{FIELD_NAMES[name]}')
        if len(value)>maximum:raise ValueError(f'{FIELD_NAMES[name]}请控制在 {maximum} 字以内')
        cleaned[name]=re.sub(r'\s+',' ',value)
    date.fromisoformat(cleaned['date'])
    return cleaned


def make_personal_task(task_id,fields,theme,assets):
    fields=clean_fields(fields)
    if theme not in THEMES:raise ValueError('请选择一种海报风格')
    brief=THEMES[theme]['brief']+'\n海报为1080×1440像素，使用PosterSans；标题至少48px，其余必备内容至少24px。所有字段必须展示，简介完整保留。给定Logo为平台演示标识，不代表活动主办方；主题图为抽象示意图。每字段一个data-field，每素材一个img data-asset。日期使用YYYY-MM-DD，或YYYY年M月D日。'
    notice='用户提供的活动信息（未做外部事实核实）：\n'+'\n'.join(f'{k}：{v}' for k,v in fields.items())
    task=PublicTask(task_id=task_id,canvas=Canvas(),source_files=['sources/notice.txt'],required_fields=list(fields),minimum_font_px={'title':48,'body':24},style_requirements=[THEMES[theme]['brief']],verbatim_fields=['description'],brief=brief,sources={'sources/notice.txt':notice},assets=assets)
    answers={k:FieldAnswer(value=v) for k,v in fields.items()}
    d=date.fromisoformat(fields['date']);answers['date']=FieldAnswer(value=fields['date'],match='allowed_forms',allowed_forms=[fields['date'],f'{d.year}年{d.month}月{d.day}日'])
    return task,AnswerSpec(task_id=task_id,fields=answers,critical_fields=list(fields),source_review=SourceReview())


def theme_for(task):
    return next((key for key,t in THEMES.items() if any(t['name'] in text for text in task.style_requirements)),'blue')


def check_label(check_id):
    parts=check_id.split('.');field=FIELD_NAMES.get(parts[-1],parts[-1])
    fixed={'delivery.html_contract':'海报文件','delivery.png':'图片生成','delivery.canvas_size':'画面尺寸','content.no_stale_date':'日期是否更新'}
    if check_id in fixed:return fixed[check_id]
    if check_id.startswith('layout.font_min.'):return f'{field}字号'
    if check_id.startswith('layout.font_family.'):return f'{field}字体'
    if check_id.startswith('layout.bounds.'):return f'{field}是否超出画面'
    if check_id.startswith('layout.clip.'):return f'{field}是否完整显示'
    if check_id.startswith('visibility.'):return f'{field}是否清晰可见'
    if check_id.startswith('content.'):return f'{field}内容'
    if check_id.startswith('structure.'):return FIELD_NAMES.get(parts[1],'内容')+'是否齐全'
    if check_id.startswith('assets.'):
        return ('标识' if parts[1]=='logo' else '配图')+{'loaded':'加载','fit':'比例','bounds':'位置'}.get(parts[-1],'检查')
    return '其他检查'


def issue_message(check):
    cid=check['check_id'];label=check_label(cid)
    if cid.startswith('layout.font_min.'):
        ev=check['evidence'];return f'{FIELD_NAMES.get(cid.split(".")[-1],"文字")}偏小，建议调整到至少 {ev.get("required_min",24)} 像素。'
    if cid.startswith('layout.bounds.'):return label.replace('是否超出画面','超出了画面，请调整位置。')
    if cid.startswith('layout.clip.'):return label.replace('是否完整显示','可能被裁切，请留出更多空间。')
    if cid.startswith('content.'):return f'{label}与提供的信息不一致，请检查。'
    return label+'需要再检查一下。'


def studio_html(task,revised=False):
    values={k:escape(v) for k,v in public_fields(task).items()}
    theme=theme_for(task);palette=THEMES[theme]
    bg,ink,accent=[palette[k] for k in ['background','ink','accent']]
    title_px=68 if len(values['title'])<50 else 50
    body_px=28 if revised else 26
    hero_css={'paper':'filter:grayscale(1) sepia(.8);border-radius:120px 120px 8px 8px;','blue':'border-radius:10px;','sage':'filter:grayscale(1) sepia(.4) hue-rotate(65deg);border-radius:140px;'}[theme]
    hero='<img class="hero" data-asset="hero" src="assets/hero.jpg">'
    facts=''.join(f'<div class="fact"><span>{FIELD_NAMES[k]}</span><p data-field="{k}">{values[k]}</p></div>' for k in ['speaker','date','time','venue'])
    content=f'<section class="facts">{facts}</section>'
    composition=content+hero if theme=='paper' else hero+content
    return f'''<!doctype html><html><head><meta charset="utf-8"><title>海报作品</title><style>
    body{{font-family:PosterSans}}#poster{{position:relative;width:1080px;height:1440px;padding:65px 74px;background:{bg};color:{ink};overflow:hidden}}
    .orb{{position:absolute;right:-160px;top:-195px;width:650px;height:650px;border:1px solid {accent};border-radius:50%;opacity:.2}}.orb.small{{right:-110px;top:-145px;width:550px;height:550px}}
    .brand{{display:flex;align-items:center;gap:16px;letter-spacing:3px;font-size:19px;color:{accent}}}.brand img{{width:38px;height:38px;object-fit:contain;border-radius:8px}}
    .kicker{{font-size:19px;letter-spacing:6px;margin:48px 0 22px;color:{accent}}}h1{{position:relative;font-size:{title_px}px;line-height:1.24;margin:0 0 36px;font-weight:700;overflow-wrap:anywhere;max-width:900px}}
    .hero{{width:932px;height:215px;object-fit:cover;display:block;margin:28px 0;{hero_css}}}
    .facts{{display:grid;grid-template-columns:1fr 1fr;gap:22px 40px;border-top:1px solid {accent};padding-top:24px}}.fact:last-child{{grid-column:1/3}}.fact span{{font-size:18px;letter-spacing:3px;color:{accent}}}.fact p{{font-size:28px;line-height:1.4;margin:5px 0 0}}
    .description{{font-size:{body_px}px;line-height:1.65;margin:30px 0 0}}.footer{{position:absolute;bottom:38px;left:74px;right:74px;display:flex;justify-content:space-between;border-top:1px solid {accent};padding-top:18px;font-size:16px;color:{accent};letter-spacing:2px}}
    </style></head><body><main id="poster"><div data-decoration="true" class="orb"></div><div data-decoration="true" class="orb small"></div><div class="brand"><img data-asset="logo" src="assets/logo.png"><span>POSTERLAB · 创意分享</span></div><div class="kicker">让每一个好想法，被看见</div><h1 data-field="title">{values['title']}</h1>{composition}<p class="description" data-field="description">{values['description']}</p><div class="footer"><span>灵感，在这里发生。</span><span>模板体验作品</span></div></main></body></html>'''
