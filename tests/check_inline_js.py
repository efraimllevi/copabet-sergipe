"""Verifica a sintaxe dos dois scripts inline alterados na COPABET com Node.js.
Não acessa internet, Firebase, segredos ou cota da API.
"""
from pathlib import Path
import re
import subprocess
import tempfile

html = (Path(__file__).parents[1] / "index.html").read_text(encoding="utf-8")
scripts = re.findall(r"<script\\b([^>]*)>(.*?)</script\\s*>", html, flags=re.I | re.S)
targets = []
for attrs, source in scripts:
    if 'id="copabet-sportsapi-reader"' in attrs or (
        "function renderChampionshipTabs()" in source and "manualPublicMatches" in source
    ):
        targets.append(source)

if len(targets) != 2:
    raise SystemExit(f"Esperados dois blocos JS do projeto, identificados {len(targets)}")

with tempfile.TemporaryDirectory() as temp:
    for i, js in enumerate(targets):
        path = Path(temp) / f"copabet-{i}.mjs"
        path.write_text(js, encoding="utf-8")
        subprocess.run(["node", "--check", str(path)], check=True)
print("Dois blocos JavaScript validados com Node.js.")
