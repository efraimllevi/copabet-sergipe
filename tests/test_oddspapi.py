"""Testes offline do adaptador OddsPapi: nenhum consumo de quota e sem chave."""
import importlib.util
import pathlib
import unittest

MODULE = pathlib.Path(__file__).parents[1] / "scripts" / "oddspapi_import.py"
spec = importlib.util.spec_from_file_location("oddspapi_import", MODULE)
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


class OddsPapiImportTests(unittest.TestCase):
    def test_pick_requested_tournaments(self):
        data = [
            {"tournamentId": 7, "tournamentSlug": "uefa-champions-league", "categorySlug": "international-clubs"},
            {"tournamentId": 44, "tournamentSlug": "uefa-nations-league", "categorySlug": "international"},
            {"tournamentId": 90, "tournamentSlug": "brasileirao-serie-a", "categorySlug": "brazil"},
            {"tournamentId": 91, "tournamentSlug": "brasileirao-serie-b", "categorySlug": "brazil"},
            {"tournamentId": 92, "tournamentSlug": "u20-serie-a", "categorySlug": "brazil"},
        ]
        self.assertEqual({x["tournamentId"] for x in api.pick_tournaments(data)}, {7, 44, 90})

    def test_only_primary_competitions(self):
        data = [
            {"tournamentId": 8, "tournamentSlug": "uefa-champions-league-women",
             "categorySlug": "international-clubs"},
            {"tournamentId": 9, "tournamentSlug": "uefa-champions-league-srl",
             "categorySlug": "international-clubs"},
            {"tournamentId": 11, "tournamentSlug": "uefa-nations-league-srl",
             "categorySlug": "international"},
            {"tournamentId": 21, "tournamentSlug": "uefa-champions-league",
             "categorySlug": "international-clubs"},
            {"tournamentId": 33, "tournamentSlug": "uefa-nations-league",
             "categorySlug": "international"},
            {"tournamentId": 47, "tournamentSlug": "serie-a", "categorySlug": "italy"},
            {"tournamentId": 50, "tournamentSlug": "serie-a", "categorySlug": "brazil"},
            {"tournamentId": 51, "tournamentSlug": "brasileiro-serie-a",
             "categorySlug": "brazil"},
            {"tournamentId": 52, "tournamentSlug": "paulista-serie-a1",
             "categorySlug": "brazil"},
        ]
        self.assertEqual({t["tournamentId"] for t in api.pick_tournaments(data)}, {21, 33, 51})

    def test_no_fixtures_404_returns_empty(self):
        from unittest.mock import Mock, patch
        response = Mock()
        response.status_code = 404
        with patch.object(api.session, "get", return_value=response):
            self.assertEqual(api.fetch("/odds-by-tournaments",
                                       {"bookmaker": "pinnacle", "tournamentIds": "21"}), [])

    def test_extract_real_prices_from_active_market(self):
        fixture = {
            "bookmakerOdds": {
                "pinnacle": {
                    "bookmakerIsActive": True,
                    "suspended": False,
                    "markets": {
                        "101": {
                            "marketActive": True,
                            "outcomes": {
                                "101": {"players": {"0": {"active": True, "price": 2.1}}},
                                "102": {"players": {"0": {"active": True, "price": 3.3}}},
                                "103": {"players": {"0": {"active": True, "price": 3.4}}},
                            },
                        },
                        "104": {
                            "marketActive": True,
                            "outcomes": {
                                "104": {"players": {"0": {"active": True, "price": 1.8}}},
                                "105": {"players": {"0": {"active": True, "price": 2.02}}},
                            },
                        },
                        "106": {
                            "marketActive": False,
                            "outcomes": {"106": {"players": {"0": {"active": True, "price": 3.0}}}},
                        },
                    },
                }
            }
        }
        prices, markets = api.odds_for_fixture(fixture)
        self.assertEqual(prices, {"Casa": 2.1, "Empate": 3.3, "Fora": 3.4})
        self.assertEqual({m["id"] for m in markets}, {"101", "104"})

    def test_suspend_and_player_props_not_imported(self):
        self.assertEqual(api.odds_for_fixture({"bookmakerOdds": {"pinnacle": {"suspended": True}}}), ({}, []))
        fixture = {"bookmakerOdds": {"pinnacle": {"markets": {
            "501": {"outcomes": {"501": {"players": {"123": {"active": True, "price": 4.0}}}}}
        }}}}
        self.assertEqual(api.odds_for_fixture(fixture), ({}, []))


if __name__ == "__main__":
    unittest.main()
