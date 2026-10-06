from pathlib import Path
from PIL import Image
from .schemas import PublicTask, TaskMetadata, AnswerSpec, Asset
from .storage import read_json, read_jsonl, inside, safe_id, directory_hash, file_hash


def metadata(task_id, config):
    safe_id(task_id)
    found = [r for r in read_jsonl(config.path(config['paths']['manifest'])) if r['task_id'] == task_id]
    if len(found) != 1: raise ValueError('任务不存在或 ID 重复')
    return TaskMetadata.model_validate(found[0])


def load_public_task(task_id, config):
    meta = metadata(task_id, config)
    root = inside(config.root, meta.public_dir)
    task = PublicTask.model_validate(read_json(root / 'task.json'))
    if task.task_id != task_id: raise ValueError('任务 ID 不一致')
    task.brief = inside(root, task.brief_file).read_text(encoding='utf-8')
    task.sources = {p: inside(root, p).read_text(encoding='utf-8') for p in task.source_files}
    task.assets = [Asset.model_validate(a) for a in read_json(inside(root, task.asset_manifest))['assets']]
    for asset in task.assets:
        path = inside(root, asset.path)
        with Image.open(path) as img:
            if img.size != (asset.width, asset.height): raise ValueError('素材尺寸不符')
            if Image.MIME[img.format] != asset.mime_type: raise ValueError('素材 MIME 不符')
    return task, root


def load_answer_spec(task_id, config):
    return AnswerSpec.model_validate(read_json(inside(config.root, metadata(task_id, config).answer_path)))


def validate_data(config, formal=False):
    rows = read_jsonl(config.path(config['paths']['manifest']))
    errors, warnings, seen, splits = [], [], set(), {}
    for row in rows:
        try:
            meta = TaskMetadata.model_validate(row)
            if meta.task_id in seen: raise ValueError('重复 task ID')
            seen.add(meta.task_id)
            if meta.event_id in splits and splits[meta.event_id] != meta.split: raise ValueError('同一活动跨集合')
            splits[meta.event_id] = meta.split
            task, root = load_public_task(meta.task_id, config)
            answer = load_answer_spec(meta.task_id, config)
            if directory_hash(root) != meta.public_sha256: raise ValueError('公开资料 hash 已变化')
            if file_hash(inside(config.root, meta.answer_path)) != meta.answer_sha256: raise ValueError('答案 hash 已变化')
            if set(task.required_fields) != set(answer.fields): raise ValueError('必备字段不完整')
            for name, field in answer.fields.items():
                if not any(value in '\n'.join(task.sources.values()) for value in [field.value] + field.allowed_forms):
                    raise ValueError(f'{name} 答案不在公开输入中')
            review = answer.source_review
            if not (review.confirmed and review.reviewer_a and review.reviewer_b and review.reviewer_a != review.reviewer_b):
                (errors if formal else warnings).append(f'{meta.task_id}: 待双人事实核对')
        except (ValueError, OSError, KeyError) as e:
            errors.append(f'{row.get("task_id")}: {e}')
    if not rows: errors.append('数据集为空')
    return {'valid': not errors, 'tasks': len(rows), 'events': len(splits), 'splits': {s: sum(x == s for x in splits.values()) for s in ['dev','test']}, 'errors': errors, 'warnings': warnings, 'formal_ready': not errors and not warnings}
