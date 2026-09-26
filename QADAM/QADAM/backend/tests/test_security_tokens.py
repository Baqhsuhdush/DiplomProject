from uuid import uuid4

import pytest

from app.core.security import (
    create_access_token,
    create_refresh_token,
    get_user_id_from_token,
    hash_password,
    verify_password,
)


def test_hash_and_verify_password_roundtrip() -> None:
    h = hash_password("correct-horse-battery-staple-99")
    assert verify_password("correct-horse-battery-staple-99", h) is True
    assert verify_password("wrong-password", h) is False


def test_access_token_roundtrip_user_id() -> None:
    uid = uuid4()
    token = create_access_token(uid)
    assert get_user_id_from_token(token, "access") == uid


def test_refresh_token_roundtrip_user_id() -> None:
    uid = uuid4()
    token = create_refresh_token(uid)
    assert get_user_id_from_token(token, "refresh") == uid


def test_token_wrong_type_raises() -> None:
    uid = uuid4()
    access = create_access_token(uid)
    with pytest.raises(ValueError):
        get_user_id_from_token(access, "refresh")
