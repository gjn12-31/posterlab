import copy
import os
from pathlib import Path
import pytest
from posterlab.config import load_config,Config

ROOT=Path(__file__).resolve().parents[1]

@pytest.fixture(autouse=True)
def isolate_model_environment(request, monkeypatch):
    if request.node.get_closest_marker('live'):
        return
    # Ordinary tests set their own provider and use mock transports. Do not
    # import credentials or settings from a developer's shell or project .env.
    monkeypatch.setenv('PYTHON_DOTENV_DISABLED', '1')
    monkeypatch.setattr('posterlab.config.load_dotenv', lambda *args, **kwargs: False)
    for name in tuple(os.environ):
        if (name.startswith(('PARATERA_', 'STEP_', 'STUDIO_', 'POSTERLAB_'))
                or name in ('DASHSCOPE_API_KEY', 'ANTHROPIC_API_KEY')):
            monkeypatch.delenv(name)

@pytest.fixture
def config(tmp_path):
    conf=load_config(ROOT/'configs/dev.yaml');data=copy.deepcopy(conf.data)
    data['paths']['runs']=str(tmp_path/'runs');data['paths']['ledger']=str(tmp_path/'ledger')
    class TestConfig(Config):
        def path(self,value):
            if str(value).startswith('artifacts/'):
                return tmp_path / value
            return super().path(value)
    return TestConfig(data,ROOT)
