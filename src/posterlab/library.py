"""Curated local image assets. Never resolve user-supplied filesystem paths."""
import json
from pathlib import Path
from fastapi import HTTPException

ROOT = Path(__file__).resolve().parents[2] / 'web/public/library'
CATALOG = {item['id']: item for item in json.loads((ROOT / 'catalog.json').read_text())}

def select_assets(ids):
    if len(ids) != len(set(ids)) or any(id not in CATALOG for id in ids):
        raise HTTPException(400, '素材选择无效，请从素材库重新选择。')
    entries=[CATALOG[id] for id in ids]
    if sum(item['kind']=='background' for item in entries)>1:
        raise HTTPException(400, '每张海报只能选择一个背景。')
    return entries
