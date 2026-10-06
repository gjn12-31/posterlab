import copy
from pathlib import Path
import pytest
from posterlab.config import load_config,Config

ROOT=Path(__file__).resolve().parents[1]
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
