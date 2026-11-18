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
PYTHONPATH="$PWD/src${PYTHONPATH:+:$PYTHONPATH}" .venv/bin/python -c '
import os, json, getpass, threading, time, urllib.request, webbrowser
from dotenv import load_dotenv
load_dotenv(".env")
from posterlab.gateway import StudioGateway
gateway = StudioGateway.configured()
url = "http://127.0.0.1:" + str(int(os.getenv("POSTERLAB_PORT","8787")))
print("PosterLab Studio:", url)
try:
    status=json.load(urllib.request.urlopen(url + "/api/status",timeout=2))
except Exception:
    status=None
if status is not None:
    if status.get("provider","StepFun") != gateway.name:
        raise SystemExit("该端口正在运行另一个模型服务。请在 .env 中设置不同的 POSTERLAB_PORT。")
    print("PosterLab is already running:", url)
    print("AI connected:", status.get("ai",False))
    webbrowser.open(url)
else:
    if not gateway.api_key:
        variable = "PARATERA_API_KEY" if gateway.name == "Paratera" else "STEP_API_KEY"
        os.environ[variable] = getpass.getpass(gateway.name + " API key (hidden; Enter for local mode): ").strip()
    def open_when_ready():
        for _ in range(50):
            try:
                with urllib.request.urlopen(url + "/api/status", timeout=1) as response:
                    if json.load(response).get("provider") == gateway.name:
                        webbrowser.open(url)
                        return
            except (OSError, ValueError):
                pass
            time.sleep(0.2)
    from posterlab.server import main
    threading.Thread(target=open_when_ready, daemon=True).start()
    main()
'
