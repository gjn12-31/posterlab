"""Deterministic developer fixtures, never represented as model output."""
import html,re


def fixture_html(task,revised=False,fault=None):
    values={}
    for line in task.sources['sources/notice.txt'].splitlines():
        key,sep,value=line.partition('：')
        if sep and key in task.required_fields:values[key]=value
    if 'sources/update.txt' in task.sources:
        match=re.search(r'改为 (\d{4}-\d{2}-\d{2})',task.sources['sources/update.txt'])
        if match:values['date']=match[1]
    font=26 if revised else 20
    if fault=='valid':font=26
    if fault=='wrong_date':values['date']='2000-01-01'
    content=''.join(f'<div class="fact"><span class="label">{label}</span><p data-field="{key}">{html.escape(values[key])}</p></div>' for key,label in [('speaker','SPEAKER / 演讲人'),('date','DATE / 日期'),('time','TIME / 时间'),('venue','VENUE / 地点')])
    body=f'''<!doctype html><html><head><meta charset="utf-8"><title>PosterLab demo</title><style>
    body{{font-family:PosterSans}}#poster{{width:1080px;height:1440px;background:#f4f8ff;color:#112b59;padding:62px 70px;position:relative;overflow:hidden}}
    .brand{{display:flex;align-items:center;gap:20px;font-size:25px;letter-spacing:4px;color:#245ccd}}.brand img{{width:62px;height:62px;object-fit:contain}}.series{{margin-top:36px;font-size:23px;color:#376bac;letter-spacing:5px}}
    h1{{font-size:50px;line-height:1.15;margin:22px 0 26px;font-weight:700;overflow-wrap:anywhere}}.hero{{width:940px;height:225px;object-fit:cover;border-radius:18px;margin-bottom:24px}}
    .facts{{display:grid;grid-template-columns:1fr 1fr;gap:20px 30px}}.fact:last-child{{grid-column:1/3}}.label{{font-size:17px;letter-spacing:2px;color:#35639a}}p{{margin:5px 0;font-size:27px;line-height:1.4}}
    .description{{font-size:{font}px;line-height:1.7;margin-top:28px;padding-top:24px;border-top:2px solid #c7d7ee}}
    .foot{{position:absolute;bottom:36px;left:70px;font-size:17px;color:#607fa3;letter-spacing:2px}}
    </style></head><body><main id="poster"><div class="brand"><img data-asset="logo" src="assets/logo.png"><span>POSTERLAB / RESEARCH SERIES</span></div><div class="series">IDEAS INTO PERSPECTIVE</div><h1 data-field="title">{html.escape(values['title'])}</h1><img class="hero" data-asset="hero" src="assets/hero.jpg"><section class="facts">{content}</section><p class="description" data-field="description">{html.escape(values['description'])}</p><div class="foot">离线排版样例 · 非模型生成 · 非官方活动海报</div></main></body></html>'''
    if fault=='hidden':body=body.replace('class="description"','style="opacity:0" class="description"')
    if fault=='overflow':body=body.replace('class="description"','style="position:absolute;top:1400px" class="description"')
    if fault=='clip':body=body.replace('class="description"','style="height:20px;overflow:hidden" class="description"')
    if fault=='tiny_child':body=body.replace(html.escape(values['description']),'<span style="font-size:10px">'+html.escape(values['description'])+'</span>')
    if fault=='missing_asset':body=body.replace('src="assets/hero.jpg"','src="assets/missing.jpg"')
    if fault=='external':body=body.replace('</head>','<script src="https://example.com/evil.js"></script></head>')
    if fault=='occluded':body=body.replace('</main>','<div style="position:absolute;top:0;left:0;width:1080px;height:1440px;background:white"></div></main>')
    return body
