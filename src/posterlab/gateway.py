"""Server-only routing for the studio's OpenAI-compatible model services."""
from dataclasses import dataclass, field
import hashlib
import os
from urllib.parse import urlsplit

from .design_policy import estimate_cost, model_options
from .model_catalog import MODELS, PARATERA_MODELS, resolve_model


@dataclass(frozen=True)
class StudioGateway:
    name: str
    base_url: str
    api_key: str = field(repr=False)
    defaults: dict[str, str]
    models: list[dict]
    artwork_model: str = ''

    @classmethod
    def configured(cls, api_key=None):
        provider = os.getenv('POSTERLAB_PROVIDER', '').strip().lower()
        if not provider:
            provider = 'paratera' if os.getenv('PARATERA_API_KEY') else 'stepfun'
        if provider == 'stepfun':
            chat = 'step-3.5-flash'
            return cls('StepFun', 'https://api.stepfun.com/v1',
                       api_key if api_key is not None else os.getenv('STEP_API_KEY', ''),
                       {'chat': chat, 'paper': chat, 'campaign': chat,
                        'design': os.getenv('STEP_DESIGN_MODEL') or 'step-5-preview',
                        'review': os.getenv('STEP_VISION_MODEL') or 'step-5-preview'}, MODELS)
        if provider != 'paratera':
            raise ValueError('POSTERLAB_PROVIDER 请选择 paratera 或 stepfun')
        base = (os.getenv('PARATERA_BASE_URL') or 'https://llmapi.paratera.com/v1').strip().rstrip('/')
        host = urlsplit(base)
        if (host.scheme != 'https' or not host.hostname or host.username or host.password
                or host.query or host.fragment):
            raise ValueError('PARATERA_BASE_URL 需要 HTTPS API 根地址')
        defaults = {'chat': os.getenv('PARATERA_CHAT_MODEL') or 'DeepSeek-V4-Pro-0813',
                    'paper': os.getenv('PARATERA_PAPER_MODEL') or 'Kimi-K3.1-Pro',
                    'campaign': os.getenv('PARATERA_CAMPAIGN_MODEL') or 'DeepSeek-V4-Pro-0813',
                    'design': os.getenv('PARATERA_DESIGN_MODEL') or 'DeepSeek-V4-Pro-0813',
                    'review': os.getenv('PARATERA_VISION_MODEL') or 'Qwen3.7-Plus'}
        catalog = {model: {'id': model, 'name': model, 'roles': list(roles), 'description': description}
                   for model, description, roles in PARATERA_MODELS}
        image_model = os.getenv('PARATERA_IMAGE_MODEL', 'Doubao-Seedream-4.5').strip()
        for role, model in {**defaults, 'artwork': image_model}.items():
            if not model:
                continue
            entry = catalog.setdefault(model, {'id': model, 'name': model, 'roles': [], 'description': '服务端配置模型'})
            if role not in entry['roles']:
                entry['roles'].append(role)
        models = list(catalog.values())
        key = api_key if api_key is not None else os.getenv('PARATERA_API_KEY', '')
        return cls('Paratera', base, key, defaults, models, image_model if key else '')

    def select(self, selected, role):
        default = self.artwork_model if role == 'artwork' else self.defaults[role]
        return resolve_model(selected, default, role, self.models)

    def sees_images(self, model):
        return any(m['id'] == model and 'review' in m['roles'] for m in self.models)

    def cost(self, model, usage):
        return estimate_cost(model, usage) if self.name == 'StepFun' else None

    def identity(self, model, fingerprint, *, legacy_model=None):
        # Existing StepFun records use the original fingerprints in local ledgers.
        if self.name == 'StepFun' and (legacy_model is None or model == legacy_model):
            return fingerprint
        return hashlib.sha256(f'{self.name}:{self.base_url}:{model}:{fingerprint}'.encode()).hexdigest()

    async def complete(self, client, model, messages, purpose):
        if self.name == 'StepFun':
            limits = {'assist': 2048, 'paper': 8192, 'campaign': 4096}
            if purpose == 'chat' and model == 'step-3.5-flash':
                options = {'max_tokens': 3000}
            elif purpose in limits:
                options = {'max_tokens': limits[purpose]}
            else:
                options = model_options(model, purpose)
            if purpose != 'design':
                options['response_format'] = {'type': 'json_object'}
        else:
            # Instruction-following and reasoning share the output budget. Allow
            # complete HTML/CSS and all four publication drafts in one response.
            tokens = {'assist': 8192, 'chat': 8192, 'paper': 16384, 'campaign': 8192,
                      'design': 16384, 'review': 8192}
            options = {'max_tokens': tokens[purpose]}
        payload = {'model': model, 'messages': messages, 'stream': False, **options}
        return await client.post(self.base_url + '/chat/completions',
                                 headers={'Authorization': 'Bearer ' + self.api_key}, json=payload)
