import datetime as dt

import pytest
from fastapi.testclient import TestClient

from app import ingestion
from app.main import app

from .test_ingestion import SAMPLE_HTML


@pytest.fixture(name="client")
def client_fixture() -> TestClient:
    return TestClient(app)


@pytest.fixture(autouse=True)
def seed_data() -> None:
    draw_date = dt.date(2025, 3, 3)
    payload = ingestion.parse_html(SAMPLE_HTML, draw_date, "https://example.com/2025-03-03")
    ingestion.save_draw(payload)


def test_health_endpoint(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_list_results_endpoint(client: TestClient) -> None:
    response = client.get("/results")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    assert data["items"]
    assert data["items"][0]["draw_date"] == "2025-03-03"


def test_get_result_detail(client: TestClient) -> None:
    response = client.get("/results/2025-03-03")
    assert response.status_code == 200
    data = response.json()
    assert data["draw_date"] == "2025-03-03"
    assert len(data["prizes"]) > 0


def test_tail_frequency_endpoint(client: TestClient) -> None:
    response = client.get("/stats/tail-frequencies?limit=5")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert all("tail" in item and "count" in item for item in data)


def test_tail_frequency_by_prize_endpoint(client: TestClient) -> None:
    response = client.get("/stats/tail-frequencies/by-prize?limit=3")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert all("prize_name" in item and "frequencies" in item for item in data)
    if data:
        assert all("tail" in freq and "count" in freq for freq in data[0]["frequencies"])


def test_prediction_frequency(client: TestClient) -> None:
    response = client.get("/predictions/heads?algorithm=frequency&top_k=3&digits=1")
    assert response.status_code == 200
    data = response.json()
    assert data["algorithm"] == "frequency"
    assert data["metadata"]["top_k"] == 3
    assert len(data["recommended_heads"]) == 3
    assert data["results"]
    assert "probability" in data["results"][0]


def test_backtest_heads_endpoint(client: TestClient) -> None:
    response = client.get("/analytics/backtest/heads?algorithm=frequency&top_k=3&digits=1&evaluation_draws=5")
    assert response.status_code == 200
    data = response.json()
    assert data["algorithm"] == "frequency"
    assert "summary" in data
    assert data["summary"]["evaluated_draws"] >= 0
    assert isinstance(data["timeline"], list)


def test_ingest_day_endpoint(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    captured: dict[str, object] = {}

    def fake_ingest_day(date: dt.date, *, force: bool = False) -> dict[str, object]:  # noqa: ANN001
        captured["date"] = date
        captured["force"] = force
        return {"created": 1, "updated": 0, "skipped": 0, "failed": 0, "errors": []}

    monkeypatch.setattr(ingestion, "ingest_day", fake_ingest_day)

    response = client.post("/ingest/day", json={"date": "2024-02-29", "force": True})
    assert response.status_code == 200
    data = response.json()
    assert data["start_date"] == "2024-02-29"
    assert data["end_date"] == "2024-02-29"
    assert data["created"] == 1
    assert captured == {"date": dt.date(2024, 2, 29), "force": True}


def test_ingest_month_endpoint(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    captured: dict[str, object] = {}

    def fake_ingest_month(year: int, month: int, *, force: bool = False) -> dict[str, object]:  # noqa: ANN001
        captured["year"] = year
        captured["month"] = month
        captured["force"] = force
        return {"created": 10, "updated": 2, "skipped": 0, "failed": 0, "errors": []}

    monkeypatch.setattr(ingestion, "ingest_month", fake_ingest_month)

    response = client.post("/ingest/month", json={"year": 2024, "month": 3, "force": False})
    assert response.status_code == 200
    data = response.json()
    assert data["start_date"] == "2024-03-01"
    assert data["end_date"] == "2024-03-31"
    assert data["created"] == 10
    assert captured == {"year": 2024, "month": 3, "force": False}


def test_ingest_year_endpoint(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    captured: dict[str, object] = {}

    def fake_ingest_year(year: int, *, force: bool = False) -> dict[str, object]:  # noqa: ANN001
        captured["year"] = year
        captured["force"] = force
        return {"created": 120, "updated": 5, "skipped": 0, "failed": 0, "errors": []}

    monkeypatch.setattr(ingestion, "ingest_year", fake_ingest_year)

    response = client.post("/ingest/year", json={"year": 2023, "force": True})
    assert response.status_code == 200
    data = response.json()
    assert data["start_date"] == "2023-01-01"
    assert data["end_date"] == "2023-12-31"
    assert data["created"] == 120
    assert captured == {"year": 2023, "force": True}
