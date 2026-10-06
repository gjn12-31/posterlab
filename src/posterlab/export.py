from pathlib import Path
import shutil,tempfile,zipfile
from .storage import read_json,atomic_text
from .schemas import PublicTask
from .renderer import render_html


def export_poster(pipeline,run_id,stage='revised'):
    if stage not in ('draft','revised'):raise ValueError('无效阶段')
    pipeline.verify_artifact(run_id,stage)
    run=pipeline.load(run_id);root,config,task,_=pipeline.snapshot(run_id)
    if run.artifacts[stage].status!='rendered':raise ValueError('该版本没有可下载作品')
    if any(not a.redistribution for a in task.assets):raise ValueError('素材未获再分发许可')
    destination=root/'exports'/f'posterlab_{run.task_id}_{stage}.zip';destination.parent.mkdir(exist_ok=True)
    if destination.exists():return destination
    with tempfile.TemporaryDirectory() as tmp:
        package=Path(tmp)/'package';package.mkdir()
        shutil.copy2(root/stage/'poster.render.html',package/'poster.html');shutil.copy2(root/stage/'poster.png',package/'poster.png')
        shutil.copytree(root/'public/assets',package/'assets');(package/'fonts').mkdir()
        for src,dst in [('PosterSans-Regular.otf','regular.otf'),('PosterSans-Bold.otf','bold.otf')]:shutil.copy2(root/'resources/fonts'/src,package/'fonts'/dst)
        attribution='Activity information: provided by the user, not independently verified.' if run.purpose=='personal' else 'Activity facts: linked public university notices. Chinese descriptions are project summaries.'
        licenses=(root/'resources/fonts/LICENSE.txt').read_text()+'\nAssets: Project-created geometric artwork, CC0-1.0.\n'+attribution+'\n'
        atomic_text(package/'LICENSES.txt',licenses)
        atomic_text(package/'README.txt',f'PosterLab {run_id} / {stage}\nMode: {run.mode}\n在浏览器打开 poster.html。可编辑 data-field 对应文字；请保留 assets/ 和 fonts/。\n离线演示作品非模型输出，不代表校方发布。无 API 密钥、隐藏答案或请求日志。\n')
        # Re-render the exact packaged HTML in a new directory, with packaged fonts.
        from .config import Config
        import copy
        data=copy.deepcopy(config.data);data['render']['regular_font']='fonts/regular.otf';data['render']['bold_font']='fonts/bold.otf'
        report=render_html(package/'poster.html',task,package,Config(data,package),Path(tmp)/'verified',fonts_root=package)
        if report.render_status!='rendered' or any(not a['natural_width'] for a in report.geometry['assets']):raise ValueError('导出包重新渲染未通过')
        with zipfile.ZipFile(destination,'w',zipfile.ZIP_DEFLATED) as z:
            for path in sorted(package.rglob('*')):
                if path.is_file():z.write(path,path.relative_to(package))
    return destination
