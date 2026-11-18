"""Offline, per-material cleanup of private files, games, sessions and jobs."""

import argparse
from pathlib import Path

from .db import exclusive_store, open_database


def drain_file_deletions(data_dir: Path, db_path: Path):
    """Retry committed deletions after an interruption without touching other files."""
    uploads = (data_dir / "uploads").resolve()
    pending = set()
    with open_database(db_path, write=True) as conn:
        for row in conn.execute("SELECT filename FROM pending_file_deletions").fetchall():
            name = row["filename"]
            path = uploads / name
            if path.parent != uploads or path.is_symlink() or path.resolve().parent != uploads:
                raise ValueError("Invalid upload path in cleanup queue.")
            try:
                path.unlink(missing_ok=True)
            except PermissionError:
                # Windows can retain a file handle after a provider timeout.
                pending.add(name)
                continue
            conn.execute("DELETE FROM pending_file_deletions WHERE filename=?", (name,))
    return pending


_RELATED_JOBS = """(kind IN ('extraction','planning') AND resource_id=?)
    OR (kind='generation' AND resource_id IN (SELECT id FROM plans WHERE material_id=?))
    OR (kind IN ('practice','feedback') AND resource_id IN
        (SELECT s.id FROM sessions s JOIN games g ON g.id=s.game_id
         JOIN plans p ON p.id=g.plan_id WHERE p.material_id=?))"""


def queue_material_deletion(conn, root, material_id, stored_path, *, require_idle=False):
    path = Path(stored_path)
    if path.parent != root / "uploads" or path.stem != material_id or path.is_symlink():
        raise ValueError("Invalid material path.")
    params = (material_id, material_id, material_id)
    if require_idle and conn.execute(
        f"SELECT 1 FROM jobs WHERE ({_RELATED_JOBS}) AND status NOT IN "
        "('completed','failed','awaiting_confirmation') LIMIT 1", params
    ).fetchone():
        return False
    conn.execute(f"DELETE FROM jobs WHERE {_RELATED_JOBS}", params)
    conn.execute("INSERT INTO pending_file_deletions(filename) VALUES (?)", (path.name,))
    conn.execute("DELETE FROM materials WHERE id=?", (material_id,))
    return True


def delete_material(data_dir: Path, material_id: str) -> bool:
    root = data_dir.resolve(strict=True)
    db_path = root / "edugame.sqlite3"
    if not db_path.is_file():
        raise ValueError("No EduGame database in the supplied directory.")
    with exclusive_store(root):
        pending = drain_file_deletions(root, db_path)
        with open_database(db_path, write=True) as conn:
            material = conn.execute("SELECT path FROM materials WHERE id=?", (material_id,)).fetchone()
            if not material:
                if any(Path(name).stem == material_id for name in pending):
                    raise PermissionError("The upload is in use. Close the file and retry cleanup.")
                return False
            queue_material_deletion(conn, root, material_id, material["path"])
        pending = drain_file_deletions(root, db_path)
        if Path(material["path"]).name in pending:
            raise PermissionError("The upload is in use. Close the file and retry cleanup.")
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", required=True, type=Path)
    parser.add_argument("--material", required=True, help="material_id returned by POST /materials")
    args = parser.parse_args()
    print("Deleted." if delete_material(args.data_dir, args.material) else "Already absent.")
