"""Importa torneios, participantes e odds da OddsPapi para a coleção 'jogos'.

Segredos necessários no GitHub Actions:
- ODDSPAPI_API_KEY
- FIREBASE_SERVICE_ACCOUNT
Não registra URLs de requisição (contêm credencial em query string).
"""
import json
import logging
import os
import re
import time
from datetime import datetime, timedelta, timezone

import firebase_admin
import requests
from firebase_admin import credentials, firestore

API_BASE = "https://api.oddspapi.io/v4"
KEY = ""
BOOKMAKER = os.getenv("ODDSPAPI_BOOKMAKER", "pinnacle").strip() or "pinnacle"
SPORT_ID = 10  # football, documentado pela OddsPapi
HORIZON = timedelta(days=30)
BATCH_SIZE = 3  # limite documentado de tournamentIds
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
session = requests.Session()

db = None  # inicializado apenas na execução, permitindo testes sem credenciais


def fetch(endpoint, params=None):
    query = dict(params or {})
    query["apiKey"] = KEY
    last_error = None
    for attempt in range(3):
        try:
            response = session.get(
                API_BASE + endpoint,
                params=query,
                timeout=(8, 35),
            )
            if response.status_code in (429, 500, 502, 503, 504):
                last_error = RuntimeError("OddsPapi indisponível temporariamente")
                time.sleep(2 ** attempt)
                continue
            if response.status_code in (401, 403):
                raise RuntimeError(
                    "OddsPapi negou acesso. Confirme a chave, a assinatura e os torneios."
                )
            if response.status_code == 404 and endpoint == "/odds-by-tournaments":
                logging.warning("Sem partidas/odds para este grupo de torneios (HTTP 404).")
                return []
            response.raise_for_status()
            return response.json()
        except (requests.Timeout, requests.ConnectionError) as err:
            last_error = err
            time.sleep(2 ** attempt)
        except requests.HTTPError as err:
            # Nunca incluir a URL completa em logs: contém a chave.
            raise RuntimeError("Erro HTTP na OddsPapi: " + str(err.response.status_code)) from None
    # Não anexar exceções de requests: podem conter URL com apiKey como query string.
    raise RuntimeError("Falha temporária consultando " + endpoint) from None


def normalize(text):
    return re.sub(r"[^a-z0-9]+", "-", str(text).lower().strip()).strip("-")


def pick_tournaments(items):
    """Seleciona somente as três ligas principais; exclui mulheres, SRL, base e classificatórias."""
    found = {}
    for t in items if isinstance(items, list) else []:
        if not isinstance(t, dict) or t.get("tournamentId") is None:
            continue
        slug = normalize(t.get("tournamentSlug") or t.get("tournamentName", ""))
        name = normalize(t.get("tournamentName") or "")
        category = normalize(t.get("categorySlug") or t.get("categoryName") or "")
        candidates = {slug, name}
        if "uefa-champions-league" in candidates:
            key, priority = "champions", 1
        elif "uefa-nations-league" in candidates:
            key, priority = "nations", 1
        elif category in ("brazil", "brasil") and candidates.intersection({
            "brasileiro-serie-a", "brasileirao-serie-a", "brazilian-serie-a", "serie-a"
        }):
            key = "brasileirao"
            priority = 2 if "brasileiro-serie-a" in candidates else 1
        else:
            continue
        if key not in found or priority > found[key][0]:
            found[key] = (priority, t)
    return [entry[1] for entry in found.values()]


def odds_for_fixture(fixture):
    books = fixture.get("bookmakerOdds") or {}
    book = books.get(BOOKMAKER) or {}
    if not book.get("bookmakerIsActive", True) or book.get("suspended"):
        return {}, []
    prices = {}
    catalogs = []
    for mid, market in (book.get("markets") or {}).items():
        if market.get("marketActive") is False:
            continue
        outcomes = []
        for oid, outcome in (market.get("outcomes") or {}).items():
            players = (outcome or {}).get("players") or {}
            for player_id, detail in players.items():
                if not detail or detail.get("active") is False:
                    continue
                price = detail.get("price")
                if not isinstance(price, (int, float)) or not 1 < price < 100000:
                    continue
                if str(player_id) != "0":
                    # Props de jogadores necessitam identificação e liquidação específicas.
                    continue
                outcomes.append({"id": str(oid), "odd": float(price)})
        if outcomes:
            catalogs.append({"id": str(mid), "outcomes": outcomes})
        if str(mid) == "101":
            for o in outcomes:
                side = {"101": "Casa", "102": "Empate", "103": "Fora"}.get(o["id"])
                if side:
                    prices[side] = o["odd"]
    # Limite conservador para o documento Firestore de 1 MiB.
    return prices, catalogs[:350]


def main():
    global KEY, db
    KEY = os.environ.get("ODDSPAPI_API_KEY", "").strip()
    service_account = os.environ.get("FIREBASE_SERVICE_ACCOUNT", "").strip()
    if not KEY or not service_account:
        raise RuntimeError("Configurar ODDSPAPI_API_KEY e FIREBASE_SERVICE_ACCOUNT nos segredos do GitHub.")
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(json.loads(service_account)))
    db = firestore.client()
    tournaments = fetch("/tournaments", {"sportId": SPORT_ID, "language": "en"})
    targets = pick_tournaments(tournaments)
    if not targets:
        raise RuntimeError("Nenhum torneio solicitado encontrado; nada foi modificado.")
    logging.info("Torneios identificados: %s", ", ".join(
        str(t.get("tournamentName", t["tournamentId"])) for t in targets
    ))
    # Metadados de participantes e mercados são compartilhados entre os torneios.
    # Requisições diretas são limitadas pela cota do plano contratado.
    time.sleep(1.1)
    participants = fetch("/participants", {"sportId": SPORT_ID, "language": "en"})
    if not isinstance(participants, dict):
        raise RuntimeError("Participantes em formato inesperado.")
    time.sleep(1.1)
    markets_meta_raw = fetch("/markets", {"language": "en"})
    market_meta = {
        str(m.get("marketId")): m for m in markets_meta_raw
        if isinstance(m, dict) and m.get("sportId") == SPORT_ID
    } if isinstance(markets_meta_raw, list) else {}

    ids = [str(t["tournamentId"]) for t in targets]
    by_tournament = {str(t["tournamentId"]): t for t in targets}
    now = datetime.now(timezone.utc)
    deadline = now + HORIZON
    written = 0
    time.sleep(1.1)
    for i in range(0, len(ids), BATCH_SIZE):
        # Documentação: máximo de 3 torneios em cada requisição.
        fixtures = fetch("/odds-by-tournaments", {
            "tournamentIds": ",".join(ids[i:i + BATCH_SIZE]),
            "bookmaker": BOOKMAKER,
            "language": "en",
            "verbosity": 3,
        })
        if isinstance(fixtures, dict):
            fixtures = fixtures.get("fixtures") or fixtures.get("data") or []
        if not isinstance(fixtures, list):
            raise RuntimeError("Partidas retornaram formato inesperado")
        for g in fixtures:
            if not isinstance(g, dict):
                continue
            fid = str(g.get("fixtureId") or "")
            if not fid or str(g.get("statusId", "")) != "0":
                continue  # apenas partidas pré-jogo, nunca aceitar evento iniciado
            try:
                start = datetime.fromisoformat(str(g.get("startTime")).replace("Z", "+00:00"))
            except ValueError:
                continue
            if start.tzinfo is None:
                start = start.replace(tzinfo=timezone.utc)
            if start <= now or start > deadline:
                continue
            home = participants.get(str(g.get("participant1Id")))
            away = participants.get(str(g.get("participant2Id")))
            if not home or not away:
                continue  # não mostrar IDs como nomes de times
            tournament = by_tournament.get(str(g.get("tournamentId")))
            if not tournament:
                continue
            prices, catalogs = odds_for_fixture(g)
            if not prices and not catalogs:
                continue
            # Preservar o formato 1X2 já utilizado pela COPABET.
            legacy_odds = ([{
                "key": "1x2",
                "positions": ["Casa", "Empate", "Fora"],
                "quotes": [{
                    "companyName": BOOKMAKER,
                    "latest": [prices.get("Casa"), prices.get("Empate"), prices.get("Fora")],
                }],
            }] if prices else [])
            full_markets = []
            for item in catalogs:
                m = market_meta.get(item["id"]) or {}
                labels = {
                    str(o.get("outcomeId")): str(o.get("outcomeName") or "")
                    for o in (m.get("outcomes") or [])
                    if isinstance(o, dict)
                }
                full_markets.append({
                    "id": item["id"],
                    "name": str(m.get("marketName") or "Mercado " + item["id"])[:100],
                    "period": str(m.get("period") or "")[:40],
                    "marketType": str(m.get("marketType") or "")[:40],
                    "handicap": m.get("handicap"),
                    "outcomes": [{**outcome, "name": labels.get(outcome["id"], outcome["id"])}
                                 for outcome in item["outcomes"]],
                })
            db.collection("jogos").document("oddspapi_" + fid).set({
                "id": "oddspapi_" + fid,
                "oddsPapiId": fid,
                "fonte": "OddsPapi",
                "source": "oddspapi",
                "sport": "football",
                "competition": str(tournament.get("tournamentName") or ""),
                "tournamentId": str(g["tournamentId"]),
                "homeTeam": str(home),
                "awayTeam": str(away),
                "status": "scheduled",
                "startTime": start.isoformat(),
                "odds": legacy_odds,
                "marketCatalog": full_markets,
                "marketCatalogBookmaker": BOOKMAKER,
                "marketCatalogAvailable": len(full_markets),
                "updatedAt": firestore.SERVER_TIMESTAMP,
                "providerUpdatedAt": str(g.get("updatedAt") or ""),
            }, merge=True)
            written += 1
        # Endpoint usa cooldown de 1s.
        time.sleep(1.1)
    logging.info("Jogos OddsPapi atualizados: %d", written)


if __name__ == "__main__":
    main()
