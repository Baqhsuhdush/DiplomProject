import pytest
from fastapi.testclient import TestClient
from typing import Callable

from app.database import get_db
from app.main import app


@pytest.fixture(autouse=True)
def _clear_dependency_overrides() -> None:
    """Чтобы подмены get_db не «течь» между тестами при падении без finally."""
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def override_db() -> Callable[[object], None]:
    """Подменяет get_db на сессию-заглушку в конкретном тесте."""

    def _apply(session: object) -> None:
        def _gen():
            try:
                yield session
            finally:
                close = getattr(session, "close", None)
                if callable(close):
                    close()

        app.dependency_overrides[get_db] = _gen

    return _apply


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)
