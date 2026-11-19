"""Prepare a whole bookshelf through a running Learning2Game backend, in source order."""

import argparse
import json
import sys
import time

import httpx


def finish_job(client, receipt, expected):
    job_id = receipt["job_id"]
    print(f"Job {job_id}", file=sys.stderr, flush=True)
    while True:
        job = client.get(f"/jobs/{job_id}").raise_for_status().json()
        if job["status"] == expected:
            return job["result"]
        if job["status"] == "failed":
            raise RuntimeError(f"{job_id}: {job.get('error')}")
        time.sleep(0.5)


def prepare_plans(client, material_ids, concepts, scenes):
    request = {"sources": [{"material_id": mid} for mid in material_ids],
               "concepts_per_volume": concepts, "scenes_per_volume": scenes}
    outline = client.post("/rpg/expedition-outline", json=request).raise_for_status().json()
    plans = []
    for volume in outline["volumes"]:
        receipt = client.post("/rpg/plans", json=volume["plan_request"]).raise_for_status().json()
        result = finish_job(client, receipt, "awaiting_confirmation")
        plans.append({"plan_id": result["plan_id"], "number": volume["number"], "terms": volume["terms"],
                      "title": result["plan"]["title"], "scenes": result["plan"]["scene_outlines"]})
        print(f"Volume {volume['number']} ready: {result['plan_id']}", file=sys.stderr, flush=True)
    return plans


def publish(client, plan_ids, hero_class, kit, request_id):
    game_ids = []
    for plan_id in plan_ids:
        receipt = client.post("/rpg/games", json={"plan_id": plan_id, "confirmed": True}).raise_for_status().json()
        game_ids.append(finish_job(client, receipt, "completed")["game_id"])
    return client.post("/rpg/expeditions", json={"game_ids": game_ids, "hero_class": hero_class,
                       "kit": kit, "request_id": request_id}).raise_for_status().json()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", default="http://127.0.0.1:8000", help="Base URL of an already running backend")
    commands = parser.add_subparsers(dest="operation", required=True)
    plan = commands.add_parser("plan", help="Plan volumes for extracted materials and print the plans for review")
    plan.add_argument("material_ids", nargs="+")
    plan.add_argument("--concepts-per-volume", type=int, default=8, choices=range(3, 9))
    plan.add_argument("--scenes-per-volume", type=int, default=4, choices=range(1, 5))
    play = commands.add_parser("publish", help="Confirm reviewed plans and open their expedition")
    play.add_argument("plan_ids", nargs="+")
    play.add_argument("--hero-class", choices=["arcanist", "vanguard", "ranger"], default="arcanist")
    play.add_argument("--kit", choices=["trail", "ward"], default="trail")
    play.add_argument("--request-id", help="Use the same identifier when retrying publication")
    args = parser.parse_args()
    with httpx.Client(base_url=args.server, timeout=60) as client:
        if args.operation == "plan":
            result = prepare_plans(client, args.material_ids, args.concepts_per_volume, args.scenes_per_volume)
        else:
            if not 1 <= len(args.plan_ids) <= 8 or len(set(args.plan_ids)) != len(args.plan_ids):
                parser.error("Pass one to eight distinct reviewed plan IDs in course order.")
            result = publish(client, args.plan_ids, args.hero_class, args.kit, args.request_id)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
