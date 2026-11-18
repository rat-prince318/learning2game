"""Summarize recorded jobs without starting the app or reading course content."""

import argparse
import json
import sqlite3
from contextlib import closing
from pathlib import Path


def summarize(data_dir: Path) -> dict:
    """Aggregate each recorded stage time, including measurements from failed jobs."""
    path = (data_dir / "edugame.sqlite3").resolve()
    if not path.is_file():
        raise FileNotFoundError("No edugame.sqlite3 was found in this data directory.")

    totals: dict = {}
    with closing(sqlite3.connect(f"{path.as_uri()}?mode=ro", uri=True)) as conn:
        columns = {row[1] for row in conn.execute("PRAGMA table_info(jobs)")}
        # A store from before recording service mode cannot establish provenance.
        mode_column = "mode" if "mode" in columns else "'unknown'"
        rows = conn.execute(f"SELECT {mode_column}, kind, status, stages_json FROM jobs")
        for mode, kind, status, raw_stages in rows:
            kinds = totals.setdefault(mode or "unknown", {})
            counts = kinds.setdefault(kind, {"succeeded": 0, "failed": 0, "pending": 0, "stage_ms": {}})
            if status == "failed":
                counts["failed"] += 1
            elif status == "completed" or (kind in {"planning", "practice"} and status == "awaiting_confirmation"):
                counts["succeeded"] += 1
            else:
                counts["pending"] += 1
            for stage, ms in json.loads(raw_stages).items():
                timings = counts["stage_ms"].setdefault(stage, {"n": 0, "total_ms": 0.0})
                timings["n"] += 1
                timings["total_ms"] += ms

    for kinds in totals.values():
        # A run can stop before planning or generation. Surface those empty denominators.
        for kind in ("extraction", "planning", "generation"):
            kinds.setdefault(kind, {"succeeded": 0, "failed": 0, "pending": 0, "stage_ms": {}})
        for counts in kinds.values():
            terminal = counts["succeeded"] + counts["failed"]
            counts["terminal"] = terminal
            counts["total"] = terminal + counts["pending"]
            counts["success_rate"] = counts["succeeded"] / terminal if terminal else None
            for timings in counts["stage_ms"].values():
                timings["mean_ms"] = round(timings.pop("total_ms") / timings["n"], 3)
    return {"by_mode": totals}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", required=True, type=Path, help="Directory containing edugame.sqlite3")
    args = parser.parse_args()
    try:
        summary = summarize(args.data_dir)
    except (OSError, sqlite3.Error, ValueError) as exc:
        parser.exit(2, f"Could not read the experiment data: {exc}\n")
    print(json.dumps(summary, indent=2, sort_keys=True, ensure_ascii=False))


if __name__ == "__main__":
    main()
