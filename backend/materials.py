"""Bounded multipart uploads, format checks and local storage."""

from io import BytesIO
from hashlib import sha256
import json
from pathlib import Path, PureWindowsPath
import re
from secrets import compare_digest, token_urlsafe
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from PIL import Image
from pypdf import PdfReader
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException, MultiPartParser

from .db import connection
from .cleanup import drain_file_deletions, queue_material_deletion
from .material_processing import MAX_PAGE_COUNT
from .models import StrictModel
from .pipeline import insert_job, run_extraction

router = APIRouter(tags=["materials"])
FORM_BODY = {"requestBody": {"required": True, "content": {"multipart/form-data": {
    "schema": {"type": "object", "required": ["file"],
               "properties": {"file": {"type": "string", "format": "binary"},
                              "pages": {"type": "string", "description": "One-based PDF pages, e.g. 1,3"},
                              "include_images": {"type": "boolean", "default": True}}}
}}}}
MEDIA = {".txt": "text/plain", ".pdf": "application/pdf", ".jpg": "image/jpeg",
         ".jpeg": "image/jpeg", ".png": "image/png", ".md": "text/markdown",
         ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
         ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation"}
MAX_PIXELS = 16_000_000


class UploadAccepted(StrictModel):
    material_id: str
    job_id: str
    mode: str
    delete_token: str


def validate_file(file, suffix: str):
    try:
        if suffix in {".txt", ".md"}:
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
            count = len(reader.pages)
            if count < 1:
                raise HTTPException(422, "请上传包含正文的 PDF。")
            return count
        elif suffix in {".docx", ".pptx"}:
            from .material_adapter import MaterialError, validate_office_archive
            try:
                validate_office_archive(file, suffix)
            except MaterialError as exc:
                raise HTTPException(422, str(exc)) from None
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


def _store(app, upload: UploadFile, pages: str, images: str):
    name = PureWindowsPath(upload.filename or "").name
    suffix = Path(name).suffix.lower()
    if not name or len(name) > 255 or any(ord(c) < 32 for c in name) or suffix not in MEDIA:
        raise HTTPException(415, "支持 PDF、TXT、Markdown、DOCX、PPTX、PNG 和 JPEG。")
    if not upload.size or upload.size > app.state.max_upload_bytes:
        raise HTTPException(413 if upload.size else 422, "File is empty or exceeds the file size limit.")
    page_count = validate_file(upload.file, suffix)
    selected = None
    if pages:
        if suffix != ".pdf" or not re.fullmatch(rf"\d{{1,5}}(,\d{{1,5}}){{0,{MAX_PAGE_COUNT - 1}}}", pages):
            raise HTTPException(422, "请为 PDF 选择最多 80 页，以逗号分隔页码。")
        selected = sorted(set(map(int, pages.split(","))))
        if min(selected) < 1 or max(selected) > page_count:
            raise HTTPException(422, f"这份资料共有 {page_count} 页，请重新选择页码。")
    elif page_count and page_count > MAX_PAGE_COUNT:
        raise HTTPException(422, f"这本教材共有 {page_count} 页，请选择本次要学习的章节，每次最多 80 页。")
    if images not in {"true", "false"}:
        raise HTTPException(422, "include_images accepts true or false.")
    options = {"pages": selected, "include_images": images == "true"}
    material_id = uuid4().hex
    dest = app.state.upload_dir / (material_id + suffix)
    token = token_urlsafe(32)
    try:
        with dest.open("xb") as out:
            while chunk := upload.file.read(64 * 1024):
                out.write(chunk)
        with connection(app, write=True) as conn:
            conn.execute("""INSERT INTO materials(id,original_name,path,media_type,options_json,delete_token_hash)
                            VALUES (?,?,?,?,?,?)""", (material_id, name, str(dest), MEDIA[suffix],
                         json.dumps(options), sha256(token.encode()).hexdigest()))
            job_id = insert_job(conn, "extraction", material_id, app.state.mode)
    except BaseException:
        dest.unlink(missing_ok=True)
        raise
    return material_id, job_id, token


@router.post("/materials", status_code=202, openapi_extra=FORM_BODY, response_model=UploadAccepted)
async def upload_material(request: Request, background_tasks: BackgroundTasks):
    """Upload one file and poll the returned job ID for extraction progress."""
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
        form = await MultiPartParser(request.headers, limited_stream(), max_files=1,
                                     max_fields=2, max_part_size=1024).parse()
    except MultiPartException:
        raise HTTPException(400, "Expected one multipart file named file.") from None
    try:
        upload = form.get("file")
        if any(key not in {"file", "pages", "include_images"} for key in form):
            raise HTTPException(422, "Unknown upload option.")
        if any(len(form.getlist(key)) != 1 for key in form):
            raise HTTPException(422, "Submit each upload field once.")
        if not isinstance(upload, UploadFile):
            raise HTTPException(422, "Missing multipart file field named file.")
        pages = str(form.get("pages", "")).strip()
        images = str(form.get("include_images", "true")).strip().lower()
        material_id, job_id, token = await run_in_threadpool(_store, app, upload, pages, images)
    finally:
        await form.close()
    background_tasks.add_task(run_extraction, app, job_id, material_id)
    return {"material_id": material_id, "job_id": job_id, "mode": app.state.mode, "delete_token": token}


@router.delete("/materials/{material_id}", status_code=204, response_class=Response,
               responses={202: {"description": "Records removed. Locked upload queued for deletion."}})
def remove_material(material_id: str, request: Request):
    app = request.app
    supplied = sha256(request.headers.get("X-Material-Token", "").encode()).hexdigest()
    with connection(app, write=True) as conn:
        row = conn.execute("SELECT path,delete_token_hash FROM materials WHERE id=?", (material_id,)).fetchone()
        if row is None:
            raise HTTPException(404, "Material not found.")
        if not row["delete_token_hash"] or not compare_digest(row["delete_token_hash"], supplied):
            raise HTTPException(403, "请从上传这份资料的浏览器删除记录。")
        if not queue_material_deletion(conn, app.state.data_dir, material_id, row["path"], require_idle=True):
            raise HTTPException(409, "资料处理正在进行，请在任务结束后删除。")
    pending = drain_file_deletions(app.state.data_dir, app.state.db_path)
    if Path(row["path"]).name in pending:
        return JSONResponse({"file_pending": True}, status_code=202)
    return Response(status_code=204)
