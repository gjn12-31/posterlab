import os, platform, sys
from pathlib import Path
from importlib.metadata import version
import yaml
from dotenv import load_dotenv
from .storage import file_hash


class Config:
    def __init__(self, data, root):
        self.data, self.root = data, Path(root).resolve()
    def path(self, value):
        return self.root / value
    def __getitem__(self, key):
        return self.data[key]


def load_config(path='configs/dev.yaml'):
    path = Path(path).resolve()
    data = yaml.safe_load(path.read_text(encoding='utf-8'))
    root = (path.parent / data['project']['root']).resolve()
    load_dotenv(root / '.env', override=False)
    if data['experiment']['max_design_calls_per_run'] != 2:
        raise ValueError('仅支持两次设计调用')
    if data['http']['max_retries'] not in (0, 1):
        raise ValueError('最多一次传输重试')
    return Config(data, root)


def doctor(config):
    from playwright.sync_api import sync_playwright
    fonts = {k: {'exists': config.path(config['render'][k]).is_file(),
                 'sha256': file_hash(config.path(config['render'][k])) if config.path(config['render'][k]).is_file() else None}
             for k in ('regular_font', 'bold_font')}
    browser = {'installed': False, 'version': None}
    with sync_playwright() as p:
        browser['installed'] = Path(p.chromium.executable_path).exists()
        if browser['installed']:
            b = p.chromium.launch(); browser['version'] = b.version; b.close()
    return {'python': sys.version, 'platform': platform.platform(),
            'packages': {k: version(k) for k in ['streamlit','playwright','pydantic','httpx']},
            'browser': browser, 'fonts': fonts, 'writable': os.access(config.root, os.W_OK),
            'models': {role: {'model': m['model'] or 'not configured', 'key': 'configured' if os.getenv(m['api_key_env']) else 'missing'} for role,m in config['models'].items()},
            'paid_requests': 0}
