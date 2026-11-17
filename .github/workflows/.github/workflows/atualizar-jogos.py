import os
import json
import requests
import time
import firebase_admin

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from firebase_admin import credentials, firestore

# Credenciais protegidas no GitHub
API_KEY = os.environ["SPORTSAPI_API_KEY"]
FIREBASE_JSON = json.loads(
    os.environ["FIREBASE_SERVICE_ACCOUNT"]
)

# Conectar ao Firebase
if not firebase_admin._apps:
    cred = credentials.Certificate(FIREBASE_JSON)
    firebase_admin.initialize_app(cred)

db = firestore.client()

API_URL = "https://sportsapi.com.br/api/v1/games/filter"

# Competições e modalidades
CONSULTAS = [
    {
        "sport": "football",
        "region": "Brazil"
    },
    {
        "sport": "football",
        "competition": "Brasileirão"
    },
    {
        "sport": "football",
        "competition": "Copa do Brasil"
    },
    {
        "sport": "football",
        "competition": "Libertadores"
    },
    {"sport": "football", "competition": "La Liga"},
    {"sport": "football", "competition": "Champions League"},
    {"sport": "football", "competition": "Europa League"},
    {"sport": "basketball", "region": "Brazil"}
]

session = requests.Session()
session.headers.update({
    "X-API-Key": API_KEY
})

hoje = datetime.now(
    ZoneInfo("America/Sao_Paulo")
).date()

jogos = {}

print("Iniciando atualização COPABET SERGIPE")

# Consultar jogos dos próximos sete dias (inclusive hoje)
for dias in range(7):

    data = (hoje + timedelta(days=dias)).isoformat()

    for consulta in CONSULTAS:

        parametros = {
            **consulta,
            "date": data,
            "limit": 100,
            "offset": 0
        }

        # Até duas páginas por consulta
        for pagina in range(2):

            try:
                resposta = None
                for tentativa in range(3):
                    try:
                        resposta = session.get(
                            API_URL, params=parametros, timeout=(10, 20)
                        )
                        if resposta.status_code in (429, 500, 502, 503, 504):
                            raise requests.exceptions.HTTPError(
                                f"Resposta temporária HTTP {resposta.status_code}"
                            )
                        break
                    except (requests.exceptions.Timeout, requests.exceptions.ConnectionError,
                            requests.exceptions.HTTPError) as erro_temporario:
                        print(f"Tentativa {tentativa + 1}/3 falhou em {data}, {consulta}: {erro_temporario}")
                        if tentativa < 2:
                            time.sleep(2 ** tentativa)
                if resposta is None or resposta.status_code in (429, 500, 502, 503, 504):
                    print(f"Pulando consulta temporariamente indisponível: {data}, {consulta}")
                    break

                if resposta.status_code == 403:
                    print("Modalidade não liberada no plano")
                    break

                resposta.raise_for_status()

                dados = resposta.json()

                partidas = dados.get("matches", [])

                for jogo in partidas:
                    identificador = jogo.get("id")

                    if identificador:
                        jogos[str(identificador)] = jogo

                paginacao = dados.get("pagination") or {}

                if not paginacao.get("hasNext"):
                    break

                proximo = paginacao.get("nextOffset")

                if proximo is None:
                    break

                parametros["offset"] = proximo

            except requests.RequestException as erro:
                print(f"Consulta ignorada após erro em {data}, {consulta}: {erro}")
                break

print("Partidas encontradas:", len(jogos))

# Consultar as odds atuais, priorizando jogos em andamento.
# A cota da API limita as partidas consultadas a cada sincronização.
limite_odds = 50
odds_consultadas = 0
LIVE_STATUSES = {"live", "inplay", "in_play", "1h", "2h", "ht", "half_time", "playing", "started", "first_half", "second_half"}
ABERTOS = LIVE_STATUSES | {"scheduled", "upcoming", "not_started"}

def prioridade_odds(item):
    status = str(item[1].get("status") or "").lower().replace("-", "_").replace(" ", "_")
    return 0 if status in LIVE_STATUSES else 1

for identificador, jogo in sorted(jogos.items(), key=prioridade_odds):
    status = str(jogo.get("status") or "").lower().replace("-", "_").replace(" ", "_")
    if odds_consultadas >= limite_odds:
        break
    if status not in ABERTOS:
        continue
    try:
        odds_consultadas += 1
        resposta = session.get(
            f"https://sportsapi.com.br/api/v1/games/{identificador}/odds",
            params={"sport": jogo.get("sport", "football")},
            timeout=30
        )
        if resposta.ok:
            dados_odds = resposta.json()
            mercados = dados_odds.get("markets") if isinstance(dados_odds, dict) else None
            if isinstance(mercados, list):
                jogo["odds"] = mercados
                # Apenas a resposta de odds realmente recebida atualiza a validade.
                # Partida em andamento com odds anteriores não deve ser ofertada.
                jogo["oddsAtualizadasEm"] = datetime.now(timezone.utc)
    except (requests.RequestException, ValueError) as erro:
        print("Odds indisponíveis:", identificador, erro)

# Salvar partidas no Firestore
quantidade = 0

for identificador, jogo in jogos.items():

    documento = {
        **jogo,
        "sportsApiId": identificador,
        "fonte": "SportsAPI",
        "atualizadoEm": datetime.now(timezone.utc)
    }

    db.collection("jogos").document(
        identificador
    ).set(documento, merge=True)

    quantidade += 1

print("Jogos atualizados no Firebase:", quantidade)
print("Atualização COPABET SERGIPE finalizada!")
