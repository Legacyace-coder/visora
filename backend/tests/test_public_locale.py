from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_locale_maps_cdn_country_header_to_language():
    response = client.get("/public/locale", headers={"CF-IPCountry": "de"})

    assert response.status_code == 200
    assert response.json() == {"country": "DE", "language": "de"}


def test_locale_defaults_to_english_for_unmapped_country():
    response = client.get("/public/locale", headers={"X-Vercel-IP-Country": "BR"})

    assert response.json() == {"country": "BR", "language": "en"}


def test_locale_without_country_header_has_no_language():
    response = client.get("/public/locale", headers={"CF-IPCountry": "XX"})

    assert response.json() == {"country": None, "language": None}
