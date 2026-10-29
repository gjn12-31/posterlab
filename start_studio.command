#!/bin/zsh
set -e
cd "$(dirname "$0")"
if [[ ! -x .venv/bin/python ]]; then
  echo "请先按 README 安装 Python 环境：python3.12 -m venv .venv"
  exit 1
fi
if [[ ! -f site/index.html ]]; then
  echo "请先构建网页：cd web && npm ci && npm run build"
  exit 1
fi
echo "PosterLab Studio: http://127.0.0.1:8787"
PYTHONPATH="$PWD/src${PYTHONPATH:+:$PYTHONPATH}" .venv/bin/python -c '
import os, json, getpass, urllib.request
from dotenv import load_dotenv
load_dotenv(".env")
try:
    status=json.load(urllib.request.urlopen("http://127.0.0.1:8787/api/status",timeout=2))
except Exception:
    status=None
if status is not None:
    print("PosterLab is already running: http://127.0.0.1:8787")
    print("AI connected:", status.get("ai",False))
else:
    if not os.getenv("STEP_API_KEY"):
        os.environ["STEP_API_KEY"]=getpass.getpass("StepFun API key (hidden, not saved): ").strip()
    from posterlab.server import main
    main()
'
