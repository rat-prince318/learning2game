"""Bounded multipart uploads, format checks and local storage."""

from io import BytesIO
from pathlib import Path, PureWindowsPath
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from PIL import Image
from pypdf import PdfReader
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException, MultiPartParser

from .db import connection
from .models import StrictModel
from .pipeline import insert_job, run_extraction

router = APIRouter(tags=["materials"])
FORM_BODY = {"requestBody": {"required": True, "content": {"multipart/form-data": {
    "schema": {"type": "object", "required": ["file"],
               "properties": {"file": {"type": "string", "format": "binary"}}}
}}}}
MEDIA = {".txt": "text/plain", ".pdf": "application/pdf", ".jpg": "image/jpeg",
         ".jpeg": "image/jpeg", ".png": "image/png"}
MAX_PAGES = 80
MAX_PIXELS = 16_000_000


class UploadAccepted(StrictModel):
    material_id: str
    job_id: str
    mode: str


def validate_file(file, suffix: str):
    try:
        if suffix == ".txt":
            text = file.read().decode("utf-8-sig")
            if not text.strip() or any(ord(c) < 32 and c not in "\r\n\t\f" for c in text):
                raise ValueError("Invalid text")
        elif suffix == ".pdf":
            if file.read(5) != b"%PDF-":
                raise ValueError("Invalid PDF header")
            file.seek(0)
            reader = PdfReader(file, strict=True)
            if reader.is_encrypted:
                raise HTTPException(422, "Please supply a PDF without password protection.")
            if not 1 <= len(reader.pages) <= MAX_PAGES:
                raise HTTPException(422, f"PDF must contain between 1 and {MAX_PAGES} pages.")
        else:
            expected = "PNG" if suffix == ".png" else "JPEG"
            # Pass a detached bytes buffer: Pillow may close its input on verify().
            data = file.read()
            with Image.open(BytesIO(data), formats=[expected]) as picture:
                if picture.width * picture.height > MAX_PIXELS or getattr(picture, "n_frames", 1) != 1:
                    raise HTTPException(422, "Supply one still image of up to 16 megapixels.")
                picture.verify()
            with Image.open(BytesIO(data), formats=[expected]) as picture:
                picture.load()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(422, "File contents are unreadable or do not match the extension.") from None
    finally:
        file.seek(0)


def _store(app, upload: UploadFile):
    name = PureWindowsPath(upload.filename or "").name
    suffix = Path(name).suffix.lower()
    if not name or len(name) > 255 or any(ord(c) < 32 for c in name) or suffix not in MEDIA:
        raise HTTPException(415, "Supply a PDF, UTF-8 TXT, PNG or JPEG file.")
    if not upload.size or upload.size > app.state.max_upload_bytes:
        raise HTTPException(413 if upload.size else 422, "File is empty or exceeds the file size limit.")
    validate_file(upload.file, suffix)
    material_id = uuid4().hex
    dest = app.state.upload_dir / (material_id + suffix)
    try:
        with dest.open("xb") as out:
            while chunk := upload.file.read(64 * 1024):
                out.write(chunk)
        with connection(app, write=True) as conn:
            conn.execute("INSERT INTO materials(id,original_name,path,media_type) VALUES (?,?,?,?)",
                         (material_id, name, str(dest), MEDIA[suffix]))
            job_id = insert_job(conn, "extraction", material_id, app.state.mode)
    except BaseException:
        dest.unlink(missing_ok=True)
        raise
    return material_id, job_id


@router.post("/materials", status_code=202, openapi_extra=FORM_BODY, response_model=UploadAccepted)
async def upload_material(request: Request, background_tasks: BackgroundTasks):
    """Upload one file. Poll the returned job ID for extraction progress."""
    app = request.app
    if app.state.services is None:
        raise HTTPException(503, "No course-material service configured. See the backend README.")
    if request.headers.get("content-type", "").split(";")[0].strip().lower() != "multipart/form-data":
        raise HTTPException(415, "Send multipart/form-data with a file field named file.")
    # Count the actual incoming bytes too; chunked requests may omit Content-Length.
    limit = app.state.max_upload_bytes + 64 * 1024
    length = request.headers.get("content-length")
    if length is not None:
        if not length.isascii() or not length.isdecimal() or len(length) > 20:
            raise HTTPException(400, "Invalid Content-Length.")
        if int(length) > limit:
            raise HTTPException(413, "Upload exceeds the request limit.")

    async def limited_stream():
        received = 0
        async for chunk in request.stream():
            received += len(chunk)
            if received > limit:
                raise HTTPException(413, "Upload exceeds the request limit.")
            yield chunk

    try:
        form = await MultiPartParser(request.headers, limited_stream(), max_files=1, max_fields=0).parse()
    except MultiPartException:
        raise HTTPException(400, "Expected one multipart file named file.") from None
    try:
        upload = form.get("file")
        if not isinstance(upload, UploadFile):
            raise HTTPException(422, "Missing multipart file field named file.")
        material_id, job_id = await run_in_threadpool(_store, app, upload)
    finally:
        await form.close()
    background_tasks.add_task(run_extraction, app, job_id, material_id)
    return {"material_id": material_id, "job_id": job_id, "mode": app.state.mode}
