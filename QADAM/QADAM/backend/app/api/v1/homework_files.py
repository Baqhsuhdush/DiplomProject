from pathlib import Path
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.config import get_settings
from app.database import get_db
from app.models.homework import HomeworkSubmission
from app.models.user import User

router = APIRouter()


@router.get("/{submission_id}/file")
def download_homework_file(
    submission_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> FileResponse:
    row = db.get(HomeworkSubmission, submission_id)
    if row is None or row.user_id != current.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if not row.file_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No file")
    settings = get_settings()
    root = Path(settings.upload_dir).resolve()
    path = (root / row.file_path).resolve()
    user_root = (root / str(row.user_id)).resolve()
    try:
        path.relative_to(user_root)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid path") from None
    if not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Missing file on disk")
    name = row.original_filename or path.name
    return FileResponse(path, filename=name, media_type="application/octet-stream")
