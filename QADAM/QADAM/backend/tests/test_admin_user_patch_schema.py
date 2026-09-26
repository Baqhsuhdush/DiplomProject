import pytest
from pydantic import ValidationError

from app.schemas.admin import AdminUserPatch


def test_admin_user_patch_requires_field() -> None:
    with pytest.raises(ValidationError):
        AdminUserPatch()


def test_admin_user_patch_active_only() -> None:
    m = AdminUserPatch(is_active=False)
    assert m.is_active is False
    assert m.is_superuser is None


def test_admin_user_patch_both() -> None:
    m = AdminUserPatch(is_active=True, is_superuser=True)
    assert m.model_dump(exclude_unset=True) == {"is_active": True, "is_superuser": True}
