"""Install two offline course translation models; no course material is transmitted."""

import hashlib
import shutil
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.request import urlopen
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[1]
PACKS = {
    "en-zh": "433e7c4f034d87fbe2353161e05f18646d7999452f801a4e1f0378522b9850ab",
    "zh-en": "62e7af5a3a48b530e47b7b3e5c78c2de79073ecd815750d2bf3ab35b4a67da2d",
}


def install(direction, archive, directory):
    with archive.open("rb") as handle:
        if hashlib.file_digest(handle, "sha256").hexdigest() != PACKS[direction]:
            raise ValueError("Translation archive hash differs from the pinned package.")
    prefix = "translate-" + direction.replace("-", "_") + "-1_9/"
    with ZipFile(archive) as data:
        for name in data.namelist():
            rel = name.removeprefix(prefix)
            if (
                name.startswith(prefix)
                and (rel.startswith("model/") or rel in {"README.md", "metadata.json", "sentencepiece.model"})
                and not name.endswith("/")
            ):
                dest = directory / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                with data.open(name) as source, dest.open("wb") as out:
                    shutil.copyfileobj(source, out)


def main():
    python = ROOT / ".venv" / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
    if not python.is_file():
        raise SystemExit("Run python run.py once to create the project's virtual environment.")
    subprocess.run(
        [str(python), "-m", "pip", "install", "ctranslate2==4.9.0", "sentencepiece==0.2.3"], check=True
    )
    directory = ROOT / ".local" / "translation"
    directory.mkdir(parents=True, exist_ok=True)
    for direction in PACKS:
        target = directory / direction
        if (target / "model" / "model.bin").is_file():
            continue
        with TemporaryDirectory(dir=directory) as temp:
            temp = Path(temp)
            archive = temp / "download.zip"
            url = "https://argos-net.com/v1/translate-" + direction.replace("-", "_") + "-1_9.argosmodel"
            with urlopen(url, timeout=120) as source, archive.open("wb") as out:
                shutil.copyfileobj(source, out)
            unpacked = temp / "model-pack"
            install(direction, archive, unpacked)
            unpacked.rename(target)
        print("Ready:", direction)
    print("Offline translation is ready.")


if __name__ == "__main__":
    main()
