import logging

from app.core.config import get_settings
from app.main import app


def test_health_reports_database_ok(client):
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}
    assert len(response.headers["x-request-id"]) == 32


def test_responses_carry_security_headers(client):
    response = client.get("/api/v1/health")

    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.headers["content-security-policy"] == "default-src 'none'; frame-ancestors 'none'"


def test_swagger_ui_is_not_blocked_by_api_csp(client):
    response = client.get("/docs")

    assert response.status_code == 200
    assert "content-security-policy" not in response.headers
    assert response.headers["x-content-type-options"] == "nosniff"


def test_cors_allows_only_configured_origins(client):
    preflight = {"Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "Content-Type"}

    origin = get_settings().cors_origin_list[0]
    allowed = client.options("/api/v1/auth/login", headers={"Origin": origin, **preflight})
    assert allowed.headers["access-control-allow-origin"] == origin
    assert allowed.headers["access-control-allow-credentials"] == "true"

    blocked = client.options("/api/v1/auth/login", headers={"Origin": "https://evil.example", **preflight})
    assert "access-control-allow-origin" not in blocked.headers
    simple = client.get("/api/v1/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in simple.headers


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


def test_malformed_json_body_gets_readable_error(client):
    response = client.post(
        "/api/v1/auth/login",
        content='{"username": "admin", "password": <id>}',
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 422
    detail = response.json()["error"]["details"][0]
    assert detail["field"] == "body"
    assert "JSON hợp lệ" in detail["message"]


def test_openapi_documents_real_error_format(client):
    schema = client.get("/openapi.json").json()

    login_422 = schema["paths"]["/api/v1/auth/login"]["post"]["responses"]["422"]
    assert login_422["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/ErrorResponse"
    assert "HTTPValidationError" not in schema["components"]["schemas"]
    error_body = schema["components"]["schemas"]["ErrorBody"]
    assert {"code", "message", "details"} <= set(error_body["properties"])


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
    assert response.headers["x-content-type-options"] == "nosniff"
    # Chi tiết vẫn có trong log server để debug
    assert "chi tiết nội bộ" in caplog.text
