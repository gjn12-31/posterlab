from __future__ import annotations
import hashlib, json, os, re, tempfile
from datetime import datetime, timezone
from pathlib import Path
from filelock import FileLock


def now():
    return datetime.now(timezone.utc).isoformat()


def safe_id(value: str):
    if not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,119}', value):
        raise ValueError(f'非法 ID: {value!r}')
    return value


def inside(root: Path, relative: str) -> Path:
    root = root.resolve()
    p = (root / relative).resolve()
    if not p.is_relative_to(root) or Path(relative).is_absolute():
        raise ValueError('路径超出允许目录')
    return p


def dumps(obj):
    if hasattr(obj, 'model_dump'):
        obj = obj.model_dump(mode='json')
    return json.dumps(obj, ensure_ascii=False, indent=2, sort_keys=True)


def atomic_text(path: Path, text: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(dir=path.parent, prefix='.tmp-')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(text)
            f.flush()
            os.fsync(f.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name): os.unlink(name)


def write_json(path: Path, obj):
    atomic_text(path, dumps(obj))


def read_json(path: Path):
    return json.loads(path.read_text(encoding='utf-8'))


def append_jsonl(path: Path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    with FileLock(str(path) + '.lock'):
        with path.open('a', encoding='utf-8') as f:
            f.write(json.dumps(obj, ensure_ascii=False) + '\n')
            f.flush()
            os.fsync(f.fileno())


def read_jsonl(path: Path):
    return [json.loads(line) for line in path.read_text(encoding='utf-8').splitlines() if line.strip()] if path.exists() else []


def sha256(value):
    return hashlib.sha256(value if isinstance(value, bytes) else value.encode()).hexdigest()


def file_hash(path):
    return sha256(Path(path).read_bytes())


def directory_hash(path):
    return sha256(dumps({p.relative_to(path).as_posix(): file_hash(p) for p in sorted(path.rglob('*')) if p.is_file()}))
