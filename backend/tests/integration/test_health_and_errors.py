import logging

from app.main import app


def test_health_reports_database_ok(client):
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}
    assert len(response.headers["x-request-id"]) == 32


def test_unknown_route_uses_standard_error_format(client):
    response = client.get("/api/v1/khong-ton-tai")

    assert response.status_code == 404
    assert response.json() == {"error": {"code": "NOT_FOUND", "message": "Không tìm thấy tài nguyên"}}


def test_validation_error_lists_fields_without_echoing_input(client):
    response = client.post("/api/v1/auth/login", json={"username": "ab", "password": "bi-mat-123"})

    assert response.status_code == 422
    body = response.json()["error"]
    assert body["code"] == "VALIDATION_ERROR"
    assert body["details"][0]["field"] == "username"
    assert "bi-mat-123" not in response.text


def test_unhandled_exception_returns_generic_500_without_stack_trace(client, caplog):
    def boom():
        raise RuntimeError("chi tiết nội bộ: connection string postgresql://...")

    app.add_api_route("/api/v1/_test/boom", boom)
    with caplog.at_level(logging.ERROR):
        response = client.get("/api/v1/_test/boom")

    assert response.status_code == 500
    error = response.json()["error"]
    assert error["code"] == "INTERNAL_ERROR"
    assert error["details"]["request_id"] == response.headers["x-request-id"]
    assert "postgresql" not in response.text
    assert "Traceback" not in response.text
    # Chi tiết vẫn có trong log server để debug
    assert "chi tiết nội bộ" in caplog.text
