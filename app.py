"""PosterLab creative studio. Technical experiment tools are opt-in."""
from datetime import date, datetime
from html import escape
from pathlib import Path
import os
import streamlit as st
from posterlab.config import load_config
from posterlab.storage import read_json, read_jsonl, dumps
from posterlab.tasks import load_public_task, validate_data
from posterlab.pipeline import Pipeline
from posterlab.export import export_poster
from posterlab.aggregate import aggregate
from posterlab.adjudication import write_override
from posterlab.studio import THEMES, FIELD_NAMES, DEFAULT_FIELDS, SAMPLE_NAMES, public_fields, theme_for, check_label, issue_message

ROOT = Path(__file__).resolve().parent
st.set_page_config(page_title='PosterLab · 让灵感成为海报', page_icon='◒', layout='wide', initial_sidebar_state='collapsed')
config = load_config(ROOT / 'configs/dev.yaml')
pipe = Pipeline(config)
st.markdown('<style>' + (ROOT / 'ui/studio.css').read_text() + '</style>', unsafe_allow_html=True)


def service_ready(role):
    model = config['models'][role]
    return bool(model['model'] and os.getenv(model['api_key_env']))


def set_editor(values, theme='paper'):
    for key, value in values.items():
        st.session_state['edit_' + key] = date.fromisoformat(value) if key == 'date' else value
    st.session_state['design_theme'] = theme


def choose_sample():
    sample = st.session_state['sample_choice']
    if sample == 'custom':
        set_editor(DEFAULT_FIELDS)
    else:
        task, _ = load_public_task(sample + '-standard', config)
        set_editor(public_fields(task), 'blue')
    st.session_state.pop('studio_run_id', None)


def load_work(run_id):
    run = pipe.load(run_id)
    _, _, task, _ = pipe.snapshot(run_id)
    set_editor(public_fields(task), theme_for(task))
    st.session_state['studio_run_id'] = run_id
    st.session_state['main_nav'] = '制作海报'
    st.session_state['sample_choice'] = 'custom'
    st.session_state['notice'] = '作品已打开，可以继续优化或下载。'


def nice_error(error):
    st.session_state['studio_error'] = str(error)
    if isinstance(error, ValueError) and str(error).startswith(('请填写', '请选择', '标题请', '活动介绍请', '主讲人请', '地点请', '时间请')):
        st.error(str(error))
    elif getattr(error, 'kind', '') == 'configuration_error':
        st.error('AI 服务还未连接，请先使用体验模式。')
    else:
        st.error('这一步暂时没有完成，已有作品已保留。可以在使用帮助中查看原因。')


def create_poster(fields, theme):
    try:
        mode = 'dev' if st.session_state.get('use_ai', False) else 'demo'
        with st.spinner('正在排版你的海报…'):
            run = pipe.create_personal_run(fields, theme, mode)
            st.session_state['studio_run_id'] = run.run_id
            pipe.generate_draft(run.run_id)
        st.session_state['notice'] = '海报已保存。可以直接下载，或再优化一次。'
        st.rerun()
    except Exception as error:
        nice_error(error)


def optimize(run):
    try:
        with st.spinner('正在调整排版与阅读细节…'):
            pipe.revise_once(run.run_id)
            if run.mode == 'demo' or service_ready('judge'):
                pipe.evaluate_run(run.run_id)
        st.session_state['notice'] = '优化版已保存，可切换查看前后变化。'
        st.rerun()
    except Exception as error:
        nice_error(error)


def preview_illustration(fields, theme):
    t = THEMES[theme]
    title = fields['title'] or '你的海报标题'
    if len(title) > 55:
        title = title[:55] + '…'
    title = escape(title)
    st.markdown(f'''<div class="empty-stage"><div class="sample-sheet" style="--sheet:{t['background']};--sheet-ink:{t['ink']};--sheet-accent:{t['accent']}">
<div class="ring"></div><div class="ring second"></div><div class="edition">POSTERLAB · CREATIVE NOTES</div>
<div class="small-quote">让每一个好想法，被看见</div><h2>{title}</h2><div class="sample-art"></div>
<div class="sample-info"><div><small>主讲人</small>{escape(fields['speaker'][:30])}</div><div><small>活动日期</small>{escape(fields['date'])}</div><div class="wide"><small>活动地点</small>{escape(fields['venue'][:48])}</div></div>
<div class="sample-footer"><span>灵感，在这里发生。</span><span>风格示意</span></div></div></div><div class="preview-note">风格预览 · 制作后可下载完整海报</div>''', unsafe_allow_html=True)


def quality_summary(root, stage):
    path = root / stage / 'public_checks.json'
    if not path.exists():
        return
    checks = read_json(path)
    failed = [c for c in checks if c['status'] == 'fail']
    uncertain = [c for c in checks if c['status'] == 'unknown']
    st.markdown('<div class="quality-title">帮你看一眼</div>', unsafe_allow_html=True)
    if failed:
        for c in failed[:3]:
            st.markdown('<div class="check-item">↗ ' + escape(issue_message(c)) + '</div>', unsafe_allow_html=True)
        if len(failed) > 3:
            st.caption(f'还有 {len(failed) - 3} 处待检查，可以展开查看。')
    else:
        st.markdown('<div class="check-item good">✓ 尺寸、文字大小与画面边界检查通过</div>', unsafe_allow_html=True)
    if uncertain:
        st.caption('部分文字的可见性还需要你看一下。')
    if (root / stage / 'fact_checks.json').exists():
        facts = read_json(root / stage / 'fact_checks.json')
        failures = [c for c in facts if c['status'] == 'fail']
        st.caption('内容与输入信息一致；活动真实性请自行确认。' if not failures else '有内容与输入信息不一致，请检查后再使用。')
    with st.expander('查看检查建议'):
        status_names = {'pass':'通过', 'fail':'需调整', 'unknown':'待确认', 'not_applicable':'无需检查'}
        st.dataframe([{'检查内容':check_label(c['check_id']), '结果':status_names[c['status']]} for c in checks], hide_index=True, width='stretch', height=245)


if 'edit_title' not in st.session_state:
    set_editor(DEFAULT_FIELDS)

active_id = st.session_state.get('studio_run_id')
run = pipe.load(active_id) if active_id else None
root = pipe.directory(active_id) if active_id else None
st.markdown('''<div class="masthead"><div class="wordmark"><span class="brand-mark"></span>PosterLab</div><div class="mast-caption">把灵感，留在纸上。</div><span class="mode-chip">创作体验版</span></div>''', unsafe_allow_html=True)
create_tab, gallery_tab, help_tab = st.tabs(['制作海报', '我的作品', '使用帮助'], key='main_nav', on_change='rerun')

with create_tab:
    st.markdown('''<div class="hero"><div><h1>一个好想法，<em>一张好海报。</em></h1><p>填入活动信息，选一种喜欢的风格，让灵感有自己的样子。</p></div><div class="steps"><span><i>1</i>写内容</span><b>—</b><span><i>2</i>选风格</span><b>—</b><span><i>3</i>下载作品</span></div></div>''', unsafe_allow_html=True)
    if st.session_state.get('notice'):
        st.caption(st.session_state.pop('notice'))
    editor, canvas = st.columns([.95, 1.55], gap='large')
    with editor:
        st.markdown('<div class="section-overline">YOUR STORY</div><div class="section-title">这次，想分享什么？</div>', unsafe_allow_html=True)
        samples = ['custom'] + [f'e{i:03d}' for i in range(1, 11)]
        names = dict(zip(samples[1:], SAMPLE_NAMES))
        st.selectbox('从示例开始', samples, format_func=lambda x:'自由创作' if x == 'custom' else names[x], key='sample_choice', on_change=choose_sample, help='示例来自公开活动资料，你也可以填写自己的活动。')
        title = st.text_input('海报标题', key='edit_title', max_chars=180, placeholder='例如：周末，一起聊聊设计')
        a, b = st.columns(2, gap='small')
        with a:
            speaker = st.text_input('主讲人', key='edit_speaker', max_chars=120)
        with b:
            selected_date = st.date_input('活动日期', key='edit_date', format='YYYY/MM/DD')
        a, b = st.columns([.8, 1.2], gap='small')
        with a:
            clock = st.text_input('时间', key='edit_time', max_chars=80)
        with b:
            venue = st.text_input('地点', key='edit_venue', max_chars=220)
        with st.expander('活动介绍', expanded=False):
            description = st.text_area('想告诉大家的话', key='edit_description', max_chars=1200, height=130)
        st.markdown('<div class="quiet-rule"></div><div class="section-title">选一种风格</div>', unsafe_allow_html=True)
        theme = st.radio('海报风格', list(THEMES), key='design_theme', format_func=lambda key:THEMES[key]['name'], horizontal=True, label_visibility='collapsed')
        tiles = ''
        for key, t in THEMES.items():
            colors = ''.join(f'<i style="background:{t[color]}"></i>' for color in ('background','ink','accent'))
            tiles += f'<div class="style-tile {"chosen" if theme == key else ""}" style="background:{t["background"]}"><div class="swatches">{colors}</div><b style="color:{t["ink"]}">{t["name"]}</b><span>{t["description"].split(" · ")[0]}</span></div>'
        st.markdown('<div class="style-row">' + tiles + '</div>', unsafe_allow_html=True)
        fields = {'title':title, 'speaker':speaker, 'date':selected_date.isoformat(), 'time':clock, 'venue':venue, 'description':description}
        if st.button('制作海报', type='primary', width='stretch', key='make_poster'):
            create_poster(fields, theme)
        st.caption('当前为模板体验，无需付费。AI 生成暂未连接。' if not st.session_state.get('use_ai') else '使用已连接的 AI 服务制作，生成后自动保存。')
        if run:
            st.markdown('<div class="status-line"><i class="status-dot"></i>作品已保存，可在「我的作品」中找到</div>', unsafe_allow_html=True)
    with canvas:
        st.markdown('<div class="canvas-heading"><strong>你的海报</strong><small>竖版 · 适合分享与打印</small></div>', unsafe_allow_html=True)
        dirty = False
        if run:
            _, _, saved_task, _ = pipe.snapshot(run.run_id)
            from posterlab.studio import clean_fields
            try:
                dirty = public_fields(saved_task) != clean_fields(fields) or theme_for(saved_task) != theme
            except ValueError:
                dirty = True
        stage = 'draft'
        compare = False
        if run and run.operations['revise_once'].status == 'complete':
            view = st.radio('查看版本', ['优化版','原版','前后对比'], horizontal=True, key='poster_view_' + run.run_id, label_visibility='collapsed')
            stage = 'draft' if view == '原版' else 'revised'
            compare = view == '前后对比'
        with st.container(key='preview_canvas'):
            if not run:
                preview_illustration(fields, theme)
            elif compare:
                for s, col, label in zip(('draft','revised'), st.columns(2, gap='small'), ('原版','优化版')):
                    with col:
                        st.caption(label)
                        image_path = run.artifacts[s].png
                        if image_path:
                            with st.container(horizontal=True, horizontal_alignment='center'):
                                st.image(str(root / image_path), width=300)
                        else:
                            st.info('此版本暂未生成成功。')
            elif run.artifacts[stage].png:
                with st.container(horizontal=True, horizontal_alignment='center'):
                    st.image(str(root / run.artifacts[stage].png), width=405)
            else:
                st.info('这一版暂未生成成功。已完成的版本仍然保留。')
        if dirty:
            st.caption('内容或风格已修改。点击「制作海报」保存为新作品。')
        elif run:
            st.caption('模板体验作品' if run.mode == 'demo' else 'AI 生成作品，请确认内容后使用。')
        else:
            st.caption('左侧内容可以直接修改。示意图用于挑选风格，实际排版以制作结果为准。')
        if run:
            a, b = st.columns([1, 1], gap='small')
            eligible = run.operations['generate_draft'].status == 'complete' and run.operations['revise_once'].status == 'pending' and not dirty
            with a:
                if st.button('优化一下' if run.operations['revise_once'].status == 'pending' else '已完成优化', disabled=not eligible, width='stretch', help='根据海报预览检查并调整一次，保留原版。'):
                    optimize(run)
            with b:
                if run.artifacts[stage].png:
                    download_title = public_fields(saved_task)['title'][:35]
                    st.download_button('下载图片', (root / run.artifacts[stage].png).read_bytes(), file_name=download_title + ('_优化版.png' if stage == 'revised' else '.png'), mime='image/png', width='stretch', type='primary')
                else:
                    st.button('下载图片', disabled=True, width='stretch')
            with st.expander('需要可编辑文件？'):
                st.caption('包含海报图片、可编辑网页与配图，方便后续调整。')
                zip_path = root / 'exports' / f'posterlab_{run.task_id}_{stage}.zip'
                if zip_path.exists():
                    st.download_button('下载源文件', zip_path.read_bytes(), file_name='海报源文件.zip', mime='application/zip', width='stretch')
                elif st.button('打包源文件', disabled=not run.artifacts[stage].png, width='stretch'):
                    try:
                        with st.spinner('正在整理文件…'):
                            export_poster(pipe, run.run_id, stage)
                        st.rerun()
                    except Exception as error:
                        nice_error(error)
            quality_summary(root, stage)

with gallery_tab:
    st.markdown('<div class="hero"><div><h1>你的灵感收藏。</h1><p>每一次制作都会保存，喜欢的版本随时回来下载。</p></div></div>', unsafe_allow_html=True)
    records = []
    for path in sorted(config.path(config['paths']['runs']).glob('*/run.json'), reverse=True):
        record = read_json(path)
        records.append(record)
    if not records:
        st.info('这里还没有作品。去制作第一张海报吧。')
    else:
        with st.container(key='gallery'):
            for offset in range(0, len(records), 3):
                for record, col in zip(records[offset:offset + 3], st.columns(3)):
                    with col:
                        folder = pipe.directory(record['run_id'])
                        from posterlab.schemas import PublicTask
                        saved = PublicTask.model_validate(read_json(folder / 'task.snapshot.json'))
                        values = public_fields(saved)
                        st.markdown('<div class="section-title">' + escape(values.get('title','海报作品')) + '</div>', unsafe_allow_html=True)
                        latest = 'revised' if record['artifacts']['revised']['png'] else 'draft'
                        image_path = record['artifacts'][latest]['png']
                        if image_path:
                            st.image(str(folder / image_path), width='stretch')
                        else:
                            st.caption('作品尚未完成')
                        created = datetime.fromisoformat(record['created_at']).astimezone().strftime('%m月%d日 %H:%M')
                        st.caption(created + ' · ' + ('模板作品' if record['mode'] == 'demo' else 'AI 作品'))
                        st.button('打开作品', key='open_' + record['run_id'], on_click=load_work, args=(record['run_id'],), width='stretch')
        st.caption('修改内容再制作，会保存为新的作品。原版始终保留。')

with help_tab:
    st.markdown('<div class="hero"><div><h1>从想法到作品，只要三步。</h1><p>把排版交给工具，把注意力留给你想表达的内容。</p></div></div>', unsafe_allow_html=True)
    for col, heading, text in zip(st.columns(3), ['01 · 写下内容','02 · 选个风格','03 · 下载分享'], ['填写标题、时间与地点，也可以从现成的活动示例开始。','挑选你喜欢的配色，点击制作。需要时再优化一次，原版会保留。','直接下载海报图片，也可以打包可编辑源文件。']):
        with col:
            st.subheader(heading)
            st.write(text)
    st.write('')
    with st.expander('现在可以免费体验吗？', expanded=True):
        st.write('可以。当前使用本地排版模板制作真实图片，不调用付费模型。AI 生成与独立视觉评分将在服务接入后开放。')
    with st.expander('活动示例和配图来自哪里？'):
        st.write('活动示例整理自清华大学公开讲座资料；中文介绍为项目摘要。你可以替换成自己的信息。配图与标识为本项目制作的演示素材，不代表活动主办方。')
        events = read_json(ROOT / 'data/collected_events.json')
        for event, label in zip(events, SAMPLE_NAMES):
            st.link_button(label + ' ↗', event['source_url'])
    with st.expander('为什么有些检查需要我确认？'):
        st.write('程序会检查文字大小、图片和画面边界，但不能保证活动信息真实，也不能代替你的审美判断。发布前请确认日期、地点、文字与图片。')
    if st.session_state.get('studio_error'):
        with st.expander('查看上次未完成的原因'):
            st.code(st.session_state['studio_error'], language=None)
    advanced = st.toggle('高级工具', value=False, help='用于课程评测、人工复核与接口接入，日常制作无需开启。')
    if advanced:
        st.caption('以下是实验与开发功能，与个人作品制作分开。')
        settings, checks_tab, benchmark_tab = st.tabs(['服务设置','评测记录','实验数据'])
        with settings:
            ready = service_ready('executor')
            st.toggle('使用 AI 服务制作', key='use_ai', disabled=not ready)
            st.write('执行服务：' + ('已连接配置' if ready else '待连接'))
            st.write('视觉评价：' + ('已连接配置' if service_ready('judge') else '待连接'))
            with st.expander('配置方法'):
                st.code('cp .env.example .env\n# .env：填写密钥\n# configs/dev.yaml：填写两个模型 ID\n.venv/bin/posterlab doctor', language='bash')
                st.caption('首次全链路通常为4次请求；重试与接口试跑均计入全局请求上限。')
        with checks_tab:
            if not run:
                st.info('打开一件作品后可查看记录。')
            else:
                evaluation_path = root / 'evaluation/resolved_summary.json'
                if run.operations['revise_once'].status == 'complete' and run.status != 'complete':
                    if st.button('评测作品'):
                        try:
                            with st.spinner('正在评测…'):
                                pipe.evaluate_run(run.run_id)
                            st.rerun()
                        except Exception as error:
                            nice_error(error)
                if evaluation_path.exists():
                    summary = read_json(evaluation_path)
                    for stage_name, col, label in zip(('draft','revised'), st.columns(2), ('原版','优化版')):
                        with col:
                            st.subheader(label)
                            item = summary[stage_name]
                            jr = item['judge']['report']
                            if not jr:
                                st.caption('视觉评分尚未完成')
                            else:
                                for dim, name in [('readability','可读性'),('hierarchy','信息层级'),('layout','布局'),('style','风格')]:
                                    st.write(name + '：' + str(jr['visual_scores'][dim]['score'] or '待确认'))
                            st.dataframe([{'检查内容':check_label(c['check_id']), '状态':{'pass':'通过','fail':'未通过','unknown':'待确认','not_applicable':'不适用'}[c['status']]} for c in item['checks']], hide_index=True, width='stretch', height=260)
                    with st.expander('人工复核'):
                        with st.form('human_review'):
                            chosen_stage = st.selectbox('选择版本', ['draft','revised'], format_func=lambda x:'原版' if x == 'draft' else '优化版')
                            chosen_check = st.selectbox('检查内容', [c['check_id'] for c in summary['draft']['checks']], format_func=check_label)
                            final = st.selectbox('复核结论', ['unknown','pass','fail'], format_func=lambda x:{'unknown':'待确认','pass':'通过','fail':'未通过'}[x])
                            reviewer = st.text_input('复核人')
                            reason = st.text_area('理由与图像依据')
                            if st.form_submit_button('保存复核'):
                                try:
                                    write_override(root, chosen_stage, chosen_check, final, reviewer, reason)
                                    st.rerun()
                                except Exception as error:
                                    nice_error(error)
                    if st.button('导出评测表'):
                        _, report_dir = aggregate(config, [run.run_id], include_demo=run.mode == 'demo')
                        st.session_state['studio_report'] = (run.run_id, str(report_dir))
                    report = st.session_state.get('studio_report')
                    if report and report[0] == run.run_id:
                        for filename, label in [('stage_results.csv','版本评测表'),('paired_results.csv','前后对比表')]:
                            st.download_button('下载' + label, (Path(report[1]) / filename).read_bytes(), file_name=label + '.csv')
                if run.status != 'complete':
                    if st.button('继续未完成处理'):
                        try:
                            with st.spinner('正在继续处理…'):
                                pipe.resume(run.run_id)
                            st.rerun()
                        except Exception as error:
                            nice_error(error)
                with st.expander('原始证据与运行记录'):
                    st.json(run.model_dump(mode='json'))
                    for stage_name in ('draft','revised'):
                        path = root / stage_name / 'public_feedback.json'
                        if path.exists():
                            st.json(read_json(path))
                        code = root / stage_name / 'poster.html'
                        if code.exists():
                            st.code(code.read_text(), language='html')
        with benchmark_tab:
            st.caption('固定测试任务保留原始要求；个人作品不会修改数据集，也不进入默认实验统计。')
            variant = st.selectbox('测试条件', ['standard','update','long'], format_func=lambda x:{'standard':'原始资料','update':'日期变更','long':'较长介绍'}[x])
            event = st.selectbox('活动', list(names), format_func=lambda x:names[x])
            if st.button('运行样例', help='使用固定离线样例完成生成、一次修改及程序评测。'):
                try:
                    with st.spinner('正在验证样例…'):
                        result = pipe.run_all(event + '-' + variant, 'demo')
                    st.session_state['studio_run_id'] = result.run_id
                    st.success('样例已保存，可在「我的作品」中打开。')
                except Exception as error:
                    nice_error(error)
            if st.button('校验数据'):
                result = validate_data(config)
                st.write(f'{result["events"]} 个活动，{result["tasks"]} 个任务；结构校验' + ('通过' if result['valid'] else '未通过'))
                st.caption('正式实验仍需双人事实核对。')
                with st.expander('校验详情'):
                    st.json(result)

st.markdown('<div class="page-footer"><span>PosterLab · 为每一个值得分享的想法</span><span>内容由你决定，灵感不设限。</span></div>', unsafe_allow_html=True)
