"""Launch the classroom web app on this computer (Python 3.11+)."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import threading
import time
from urllib.error import URLError
from urllib.request import urlopen
import webbrowser


ROOT = Path(__file__).resolve().parent


def prepare_python():
    env = ROOT / ".venv"
    python = env / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if not python.is_file():
        subprocess.run([sys.executable, "-m", "venv", str(env)], check=True)
    files = (ROOT / "requirements.txt", ROOT / "PartA" / "pyproject.toml")
    fingerprint = hashlib.sha256(b"\0".join(p.read_bytes() for p in files)).hexdigest()
    stamp = env / ".learning2game-requirements"
    if not stamp.is_file() or stamp.read_text() != fingerprint:
        if subprocess.run([str(python), "-m", "pip", "--version"], capture_output=True).returncode:
            subprocess.run([str(python), "-m", "ensurepip", "--upgrade"], check=True)
        subprocess.run([str(python), "-m", "pip", "install", "--disable-pip-version-check",
                        "-r", "requirements.txt"], cwd=ROOT, check=True)
        stamp.write_text(fingerprint)
    return python


def ready(url):
    try:
        with urlopen(url + "health", timeout=1) as response:
            return json.load(response).get("service") == "learning2game"
    except (URLError, TimeoutError, ValueError, OSError, AttributeError):
        return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    if sys.version_info < (3, 11):
        parser.exit(2, "Please run with Python 3.11 or later.\n")
    if not 1 <= args.port <= 65535:
        parser.error("Choose a port from 1 to 65535.")
    url = f"http://127.0.0.1:{args.port}/"
    if ready(url):
        print(f"Learning2Game: {url}", flush=True)
        if not args.no_browser:
            webbrowser.open(url)
        return 0
    with socket.socket() as probe:
        try:
            probe.bind(("127.0.0.1", args.port))
        except OSError:
            parser.exit(2, f"Port {args.port} is in use. Try: python run.py --port 8001\n")
    python = prepare_python()
    cmd = [str(python), "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1",
           "--port", str(args.port)]
    if (ROOT / ".env").is_file():
        cmd += ["--env-file", ".env"]
    process = subprocess.Popen(cmd, cwd=ROOT)

    def announce():
        while process.poll() is None:
            if ready(url):
                print(f"Learning2Game: {url}", flush=True)
                if not args.no_browser:
                    webbrowser.open(url)
                return
            time.sleep(0.25)

    threading.Thread(target=announce, daemon=True).start()
    try:
        return process.wait()
    except KeyboardInterrupt:
        if process.poll() is None:
            process.terminate()
        process.wait()
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
