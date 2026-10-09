"""Запуск бота с настройками из локального .env."""
import logging
import os
from pathlib import Path
import runpy


def load_settings(path):
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        key, separator, value = line.strip().partition("=")
        key = key.strip()
        if not separator or key not in ("BOT_TOKEN", "WEBAPP_URL"):
            continue
        value = value.strip()
        if value.startswith(('"', "'")):
            quote = value[0]
            end = value.find(quote, 1)
            if end < 0:
                raise SystemExit(f"Незакрытая кавычка в настройке {key} файла .env.")
            value = value[1:end]
        else:
            value = value.split(" #", 1)[0].strip()
        os.environ.setdefault(key, value)


if __name__ == "__main__":
    root = Path(__file__).resolve().parent
    load_settings(root / ".env")
    missing = [key for key in ("BOT_TOKEN", "WEBAPP_URL") if not os.environ.get(key)]
    if missing:
        raise SystemExit("Укажите в .env: " + ", ".join(missing))
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    runpy.run_path(str(root / "bot.py"), run_name="__main__")
