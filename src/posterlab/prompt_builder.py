from pathlib import Path
from .schemas import ModelRequest,ImageInput
from .storage import dumps,file_hash
from .html_contract import CONTRACT
from .public_checks import build_public_feedback


def image_input(path,label,mime='image/png'):
    return ImageInput(path=str(Path(path).resolve()),mime_type=mime,sha256=file_hash(path),label=label)


def task_text(task):
    # Only PublicTask can cross this boundary. No manifest, answers or evaluation metadata.
    return dumps(task)+'\n【HTML 合同】\n'+CONTRACT


def assets(task,root):
    return [image_input(root/a.path,f'asset_id={a.asset_id}; html_path={a.path}',a.mime_type) for a in task.assets]


def build_generate_request(task,root,prompts,logical_id):
    return ModelRequest(role='executor',logical_call_id=logical_id,purpose='draft_generation',system=prompts['executor_system'],text=prompts['generate_user']+'\n'+task_text(task),images=assets(task,root))


def build_revise_request(task,root,draft_dir,checks,prompts,logical_id):
    feedback=build_public_feedback(checks)
    raw=draft_dir/('poster.html' if (draft_dir/'poster.html').exists() else 'response.txt')
    images=assets(task,root)
    if (draft_dir/'poster.png').exists():images.append(image_input(draft_dir/'poster.png','实际初稿预览'))
    return ModelRequest(role='executor',logical_call_id=logical_id,purpose='revision',system=prompts['executor_system'],text=prompts['revise_user']+'\n'+task_text(task)+'\n【初稿代码或原响应】\n'+raw.read_text(encoding='utf-8')+'\n【公开检查】\n'+dumps(feedback),images=images)
