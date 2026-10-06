from pathlib import Path
from streamlit.testing.v1 import AppTest
from posterlab.config import load_config
from posterlab.pipeline import Pipeline
from posterlab.storage import read_json


def test_page_is_read_only_on_load_and_refresh():
    root=Path(__file__).resolve().parents[1]
    ledger=root/'artifacts/ledger/attempts.json';before=ledger.read_bytes() if ledger.exists() else None
    app=AppTest.from_file(str(root/'app.py'),default_timeout=30).run()
    assert not app.exception
    assert [t.label for t in app.tabs]==['制作海报','我的作品','使用帮助']
    assert not app.json
    assert not app.code
    assert app.button(key='make_poster').label=='制作海报'
    app.run();assert not app.exception
    assert (ledger.read_bytes() if ledger.exists() else None)==before


def test_sample_fills_editable_fields_without_api():
    root=Path(__file__).resolve().parents[1]
    app=AppTest.from_file(str(root/'app.py'),default_timeout=30).run()
    app.selectbox(key='sample_choice').select('e001').run()
    assert not app.exception
    assert app.text_input(key='edit_speaker').value=='冯昱善'
    app.text_input(key='edit_title').set_value('我的设计分享').run()
    assert not app.exception
    assert app.text_input(key='edit_title').value=='我的设计分享'
    app.radio(key='design_theme').set_value('sage').run()
    assert not app.exception
    assert not app.json and not app.code


def test_blank_title_shows_friendly_error():
    root=Path(__file__).resolve().parents[1]
    before=set((root/'runs').glob('*/run.json'))
    app=AppTest.from_file(str(root/'app.py'),default_timeout=30).run()
    app.text_input(key='edit_title').set_value('').run()
    app.button(key='make_poster').click().run()
    assert not app.exception
    assert any('请填写标题' in e.value for e in app.error)
    assert set((root/'runs').glob('*/run.json'))==before
