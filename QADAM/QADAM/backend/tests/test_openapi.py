def test_openapi_json_available(client) -> None:
    res = client.get("/openapi.json")
    assert res.status_code == 200
    data = res.json()
    assert data.get("openapi")
    assert isinstance(data.get("paths"), dict)
    assert len(data["paths"]) > 0
