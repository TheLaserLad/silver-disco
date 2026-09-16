# championship.py
#
# WEEKLY CHAMPIONSHIP ENGINE — Phase 1 (retention / progression).
#
# Kept out of main.py on purpose: main.py is already 2k+ lines and mixes admin
# HTML, detection webhooks and game scheduling. Everything championship-related
# lives here and is mounted onto the app with a single include_router() call.
#
# COLLECTIONS
#   championships        queue + currently running + completed championship definitions
#   championship_entries one row per (championship, user) — the weekly standings
#   championship_history permanent archive of finished championships (Feature 8)
#
# TIMESTAMPS
#   The existing codebase is inconsistent (games.createdAt is milliseconds,
#   users.points[].timestamp is seconds). Championship documents store
#   milliseconds throughout — every field named *Date or *At below is ms UTC —
#   so the frontend can feed them straight into new Date().
#
# A championship owns exactly one week: Monday 00:00:00.000 UTC through
# Sunday 23:59:59.999 UTC. Admins queue several up front and order them; when
# one ends the next in the queue takes the following Monday automatically.

import os
import asyncio
import traceback
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException, Request, Form, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import UpdateOne, ASCENDING, DESCENDING
from dotenv import load_dotenv

from auth import require_self
from avatars import avatar_for

load_dotenv()

router = APIRouter()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "pinballrace_com")

mongo = AsyncIOMotorClient(MONGO_URI)
db = mongo[DB_NAME]

templates = Jinja2Templates(directory="templates")

# How often the championship scheduler wakes up to check for rollover.
TICK_SECONDS = int(os.getenv("CHAMPIONSHIP_TICK_SECONDS", "20"))

# Feature 2 defaults — overridable per championship from the admin panel.
DEFAULT_BONUS_RACES = int(os.getenv("DAILY_BONUS_RACES", "3"))
DEFAULT_BONUS_POINTS = int(os.getenv("DAILY_BONUS_POINTS", "5"))

MS_DAY = 86_400_000

# The single definition of "who is ahead of whom". Ties break on points, then
# wins, then who joined the championship first, so ordering is stable rather
# than arbitrary. Standings queries, the per-player rank count, the end-of-week
# crowning and the stored-rank refresh all sort by this — if they disagreed,
# a player's rank would contradict their row in the table.
RANK_SORT = [("weeklyPoints", DESCENDING), ("wins", DESCENDING), ("joinedAt", ASCENDING)]

# Status values for a championship document.
STATUS_QUEUED = "queued"
STATUS_ACTIVE = "active"
STATUS_COMPLETED = "completed"
STATUS_CANCELLED = "cancelled"

# Start behaviour chosen by the admin when queueing a championship.
MODE_NEXT_MONDAY = "next_monday"   # default — waits for a fresh, unused week
MODE_IMMEDIATE = "immediate"       # starts on the next scheduler tick
MODE_SCHEDULED = "scheduled"       # starts once scheduledStart has passed

# Injected by main.py at startup so /api/leaderboard/active can fall back to the
# original all-time leaderboard. Done as injection rather than an import because
# main.py imports this module — importing back would be circular.
_fallback_leaderboard = None


def set_fallback_leaderboard(fn):
    """Register main.py's all-time leaderboard builder for the swap endpoint."""
    global _fallback_leaderboard
    _fallback_leaderboard = fn


# ---------------------------------------------------------------- time helpers

def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def to_ms(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)


def from_ms(ms: int) -> datetime:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc)


def day_key(dt: datetime) -> str:
    """Calendar day in UTC, e.g. '2026-08-18'. Used for streaks and daily bonus."""
    return dt.strftime("%Y-%m-%d")


def week_window(dt: datetime):
    """Monday 00:00:00.000 UTC .. Sunday 23:59:59.999 UTC for the week holding dt."""
    start = (dt - timedelta(days=dt.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    end = start + timedelta(days=7) - timedelta(milliseconds=1)
    return start, end


def country_flag(code: Optional[str]) -> str:
    """ISO-3166 alpha-2 -> flag emoji, built from regional indicator symbols."""
    if not code or len(code) != 2 or not code.isalpha():
        return ""
    return "".join(chr(0x1F1E6 + ord(c) - ord("A")) for c in code.upper())


def effective_streak(user: Dict[str, Any], now: Optional[datetime] = None) -> int:
    """
    Stored currentStreak is only meaningful while the player is still current.
    A player who last raced three days ago has a broken streak even though
    nothing has written to their document since — so decide at read time.
    """
    last = user.get("lastActiveDate")
    if not last:
        return 0
    now = now or utc_now()
    if last in (day_key(now), day_key(now - timedelta(days=1))):
        return int(user.get("currentStreak", 0) or 0)
    return 0


def _oid(value: str, label: str = "id") -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=400, detail=f"Invalid {label}: {value}")


# ------------------------------------------------------------------- indexes

async def ensure_indexes():
    """Idempotent — safe to call on every boot."""
    try:
        await db.championships.create_index([("status", ASCENDING), ("queueOrder", ASCENDING)])
        await db.championships.create_index([("weekStart", ASCENDING)])
        await db.championship_entries.create_index(
            [("championshipId", ASCENDING), ("userId", ASCENDING)], unique=True
        )
        await db.championship_entries.create_index(
            [("championshipId", ASCENDING), ("weeklyPoints", DESCENDING)]
        )
        await db.championship_history.create_index([("weekNumber", DESCENDING)])
        await db.users.create_index([("lastActiveDate", ASCENDING)])
    except Exception as e:
        print(f"⚠️ championship index setup: {e}")


# ------------------------------------------------------------ core lifecycle

async def get_active_championship() -> Optional[Dict[str, Any]]:
    return await db.championships.find_one({"status": STATUS_ACTIVE})


async def _next_week_number() -> int:
    """Site-wide sequential week counter — 'Week 1', 'Week 2' in the Hall of Champions."""
    r = await db.counters.find_one_and_update(
        {"_id": "championship_week"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    return r["seq"]


async def _week_already_used(week_start_ms: int) -> bool:
    """True if some championship already owns (or owned) this calendar week."""
    doc = await db.championships.find_one(
        {"status": {"$in": [STATUS_ACTIVE, STATUS_COMPLETED]}, "weekStart": week_start_ms}
    )
    return doc is not None


async def start_championship(champ: Dict[str, Any], start_dt: datetime, end_dt: datetime):
    week_start, _ = week_window(start_dt)
    week_number = await _next_week_number()

    await db.championships.update_one(
        {"_id": champ["_id"]},
        {"$set": {
            "status": STATUS_ACTIVE,
            "weekNumber": week_number,
            "isoWeek": start_dt.isocalendar()[1],
            "isoYear": start_dt.isocalendar()[0],
            "startDate": to_ms(start_dt),
            "endDate": to_ms(end_dt),
            "weekStart": to_ms(week_start),
            "startedAt": to_ms(utc_now()),
            "lastRankSnapshotDay": day_key(utc_now()),
            "updatedAt": to_ms(utc_now()),
        }},
    )
    print(f"🏆 Championship '{champ.get('name')}' started — week {week_number}, "
          f"{start_dt.isoformat()} → {end_dt.isoformat()}")


async def _award_prize_points(
    champ: Dict[str, Any], winner: Dict[str, Any], now: datetime
) -> Optional[Dict[str, Any]]:
    """
    Pay a points prize to the champion.

    The prize text itself is free-form and purely cosmetic ("$320 gift card") —
    only prizePoints is machine-actionable. When an admin sets it, a prize of
    "20 points" is actually credited instead of being a label someone has to
    honour by hand.

    The points go onto users.points[] because that array is what both the
    all-time leaderboard and the profile career total are summed from. Nothing
    is pushed onto racesPlayed[]: the legacy stats endpoint infers a finishing
    position from the size of a points entry whose timestamp matches a race
    entry, so a prize masquerading as a race would show up as a phantom win.
    """
    points = int(champ.get("prizePoints", 0) or 0)
    if points <= 0 or not winner.get("userId"):
        return None
    if champ.get("prizeAwardedAt"):
        return None  # already paid — never double-pay if this is somehow re-run

    try:
        uid = ObjectId(winner["userId"])
    except (InvalidId, TypeError):
        return None

    await db.users.update_one(
        {"_id": uid},
        {
            "$push": {"points": {
                "points": points,
                "timestamp": int(now.timestamp()),   # seconds — the legacy format
                "source": "championship_prize",
                "championshipId": str(champ["_id"]),
            }},
            "$inc": {"totalPoints": points},
        },
    )

    print(f"🎁 Prize +{points} pts to champion {winner.get('username')}")
    return {
        "userId": winner["userId"],
        "username": winner.get("username"),
        "points": points,
        "awardedAt": to_ms(now),
    }


async def end_championship(champ: Dict[str, Any], reason: str = "scheduled"):
    """
    Crown the winner, write the permanent archive, fold results into player
    career stats, then clear the denormalised weekly mirror on users.

    Lifetime statistics (users.points[] etc.) are otherwise untouched — the one
    exception is a configured points prize, which is credited to the champion
    here because that is the moment the week's result becomes final.
    """
    champ_id = champ["_id"]
    now = utc_now()

    entries = await db.championship_entries.find(
        {"championshipId": champ_id}
    ).sort(RANK_SORT).to_list(None)

    # Freeze the final placing onto every entry so archived standings stay stable.
    if entries:
        await db.championship_entries.bulk_write(
            [UpdateOne({"_id": e["_id"]}, {"$set": {"currentRank": i + 1, "finalRank": i + 1}})
             for i, e in enumerate(entries)],
            ordered=False,
        )

    def podium(idx: int) -> Dict[str, Any]:
        if idx >= len(entries):
            return {}
        e = entries[idx]
        return {
            "userId": e.get("userId"),
            "username": e.get("username"),
            "country": e.get("country", ""),
            "pfp": avatar_for(e.get("userId"), e.get("pfp"), e.get("username")),
            "score": int(e.get("weeklyPoints", 0)),
        }

    first, second, third = podium(0), podium(1), podium(2)

    prize_awarded = await _award_prize_points(champ, first, now)

    result = {
        "championUserId": first.get("userId"),
        "championUsername": first.get("username"),
        "winningScore": first.get("score", 0),
        "secondPlaceUserId": second.get("userId"),
        "secondPlaceUsername": second.get("username"),
        "runnerUpScore": second.get("score", 0),
        "thirdPlaceUserId": third.get("userId"),
        "thirdPlaceUsername": third.get("username"),
        "thirdPlaceScore": third.get("score", 0),
        "participantCount": len(entries),
    }

    closing: Dict[str, Any] = {
        **result,
        "status": STATUS_COMPLETED,
        "endedAt": to_ms(now),
        "endReason": reason,
        "updatedAt": to_ms(now),
    }
    if prize_awarded:
        closing["prizeAwarded"] = prize_awarded
        closing["prizeAwardedAt"] = prize_awarded["awardedAt"]

    await db.championships.update_one({"_id": champ_id}, {"$set": closing})

    # Feature 8 — the separate, permanent history table.
    await db.championship_history.update_one(
        {"championshipId": champ_id},
        {"$set": {
            "championshipId": champ_id,
            "name": champ.get("name"),
            "sponsor": champ.get("sponsor", ""),
            "weekNumber": champ.get("weekNumber"),
            "startDate": champ.get("startDate"),
            "endDate": champ.get("endDate"),
            "endedAt": to_ms(now),
            "endReason": reason,
            "champion": first,
            "secondPlace": second,
            "thirdPlace": third,
            # Frozen onto the archive so the Hall of Champions can still say what
            # the week was played for, even after the championship is edited.
            "prize": champ.get("prize", ""),
            "prizePoints": int(champ.get("prizePoints", 0) or 0),
            "prizeAwarded": prize_awarded,
            **result,
        }},
        upsert=True,
    )

    # Fold the week's outcome into each player's career championship stats.
    ops = []
    for i, e in enumerate(entries):
        rank = i + 1
        try:
            uid = ObjectId(e["userId"])
        except (InvalidId, TypeError, KeyError):
            continue
        update: Dict[str, Any] = {
            "$min": {"bestWeeklyFinish": rank},
            "$set": {"weeklyPoints": 0, "weeklyRank": 0},
        }
        inc: Dict[str, int] = {}
        if rank == 1:
            inc["championshipWins"] = 1
        if rank <= 10:
            inc["top10Finishes"] = 1
        if inc:
            update["$inc"] = inc
        ops.append(UpdateOne({"_id": uid}, update))
    if ops:
        await db.users.bulk_write(ops, ordered=False)

    print(f"🏁 Championship '{champ.get('name')}' ended ({reason}) — "
          f"champion: {first.get('username') or 'nobody'} "
          f"with {first.get('score', 0)} pts across {len(entries)} players")


async def _try_start_next(now: datetime):
    """Promote the head of the queue if the calendar allows it."""
    champ = await db.championships.find_one(
        {"status": STATUS_QUEUED}, sort=[("queueOrder", ASCENDING), ("createdAt", ASCENDING)]
    )
    if not champ:
        return

    mode = champ.get("startMode", MODE_NEXT_MONDAY)
    week_start, week_end = week_window(now)

    if mode == MODE_IMMEDIATE:
        # Admin override: take whatever is left of the current week.
        await start_championship(champ, now, week_end)
        return

    if mode == MODE_SCHEDULED:
        scheduled = champ.get("scheduledStart")
        if not scheduled or to_ms(now) < scheduled:
            return
        await start_championship(champ, now, week_end)
        return

    # MODE_NEXT_MONDAY (default): only claim a week nobody has used yet, so a
    # championship force-ended on Wednesday doesn't immediately burn the next
    # one on a three-day stub week.
    if await _week_already_used(to_ms(week_start)):
        return
    await start_championship(champ, week_start, week_end)


async def _daily_rank_snapshot(champ: Dict[str, Any], now: datetime):
    """
    Feature 9 wants 'position change'. Snapshot each player's rank once per UTC
    day so the number means 'places gained since the day started' rather than
    flickering after every single race.
    """
    today = day_key(now)
    if champ.get("lastRankSnapshotDay") == today:
        return
    try:
        await db.championship_entries.update_many(
            {"championshipId": champ["_id"]},
            [{"$set": {"previousRank": {"$ifNull": ["$currentRank", 0]}}}],
        )
    except Exception:
        # Pipeline updates need MongoDB 4.2+; fall back to a read/write loop.
        entries = await db.championship_entries.find(
            {"championshipId": champ["_id"]}, {"currentRank": 1}
        ).to_list(None)
        if entries:
            await db.championship_entries.bulk_write(
                [UpdateOne({"_id": e["_id"]},
                           {"$set": {"previousRank": e.get("currentRank", 0)}})
                 for e in entries],
                ordered=False,
            )
    await db.championships.update_one(
        {"_id": champ["_id"]}, {"$set": {"lastRankSnapshotDay": today}}
    )


async def championship_scheduler():
    """
    Background task started alongside the existing game scheduler.

    Deliberately NOT folded into main.py's scheduler(): that loop sleeps for the
    entire countdown of the next game (potentially 30 minutes), which would make
    the Monday 00:00 rollover fire late by up to that long.
    """
    await ensure_indexes()
    print("🗓️ Championship scheduler started")
    while True:
        try:
            now = utc_now()
            active = await get_active_championship()

            if active and to_ms(now) >= active.get("endDate", 0):
                await end_championship(active, reason="scheduled")
                active = None

            if not active:
                await _try_start_next(now)
            else:
                # Kept off the race hot path — see recompute_ranks().
                await recompute_ranks(active["_id"])
                await _daily_rank_snapshot(active, now)
                await sync_rank_mirrors(active["_id"])

        except Exception as e:
            print(f"❌ championship_scheduler: {e}")
            traceback.print_exc()

        await asyncio.sleep(TICK_SECONDS)


# ------------------------------------------------------------- ranking helper

async def recompute_ranks(championship_id: ObjectId):
    """
    Refresh the stored currentRank on every entry.

    Deliberately NOT called per race: displayed ranks are always derived fresh
    (list position for standings, an indexed count for one player), so this only
    has to keep the stored value good enough to seed the daily previousRank
    snapshot. The scheduler runs it on a fixed tick instead, which keeps race
    processing O(1) per player no matter how many people entered the week.
    """
    entries = await db.championship_entries.find(
        {"championshipId": championship_id}, {"currentRank": 1}, sort=RANK_SORT
    ).to_list(None)

    ops = [
        UpdateOne({"_id": e["_id"]}, {"$set": {"currentRank": i + 1}})
        for i, e in enumerate(entries)
        if e.get("currentRank") != i + 1
    ]
    if ops:
        await db.championship_entries.bulk_write(ops, ordered=False)


async def exact_rank(championship_id: ObjectId, entry: Dict[str, Any]) -> int:
    """
    One player's live rank: count everyone strictly ahead of them under
    RANK_SORT and add one. Mirrors the list ordering exactly, including the
    tiebreakers, so a player never sees a rank that disagrees with the table.
    """
    points = int(entry.get("weeklyPoints", 0))
    wins = int(entry.get("wins", 0))
    joined = entry.get("joinedAt", 0)
    ahead = await db.championship_entries.count_documents({
        "championshipId": championship_id,
        "$or": [
            {"weeklyPoints": {"$gt": points}},
            {"weeklyPoints": points, "wins": {"$gt": wins}},
            {"weeklyPoints": points, "wins": wins, "joinedAt": {"$lt": joined}},
        ],
    })
    return ahead + 1


async def sync_rank_mirrors(championship_id: ObjectId):
    """
    Feature 7 asks for weeklyPoints/weeklyRank on the user record. Nothing reads
    them on a hot path, so they are refreshed on the scheduler tick rather than
    on every race — bounded cost, independent of race volume.
    """
    entries = await db.championship_entries.find(
        {"championshipId": championship_id}, {"userId": 1, "weeklyPoints": 1, "currentRank": 1}
    ).to_list(None)

    ops = []
    for e in entries:
        try:
            uid = ObjectId(e["userId"])
        except (InvalidId, TypeError, KeyError):
            continue
        ops.append(UpdateOne({"_id": uid}, {"$set": {
            "weeklyPoints": int(e.get("weeklyPoints", 0)),
            "weeklyRank": int(e.get("currentRank", 0)),
        }}))
    if ops:
        await db.users.bulk_write(ops, ordered=False)


# ------------------------------------------------- the hook main.py calls into

async def record_race_result(
    user: Dict[str, Any],
    position: Optional[int],
    points: int,
    game_type: str = "live",
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    """
    Single entry point for 'a player finished a race'.

    Called from both submit_rankings (live races) and process_off_game
    (on-demand races) in main.py. Safe to call when no championship is running —
    streaks and career totals are global and update either way.

    `user` is the full users document. `position` may be None/0 when the player
    did not place. Returns a summary the caller can surface to the frontend.
    """
    now = now or utc_now()
    today = day_key(now)
    user_id = user["_id"]
    placed = isinstance(position, int) and position > 0

    # ---- Feature 3: daily participation streak (global, not per championship)
    last_active = user.get("lastActiveDate")
    if last_active == today:
        new_streak = int(user.get("currentStreak", 0) or 0)          # already counted today
    elif last_active == day_key(now - timedelta(days=1)):
        new_streak = int(user.get("currentStreak", 0) or 0) + 1      # consecutive day
    else:
        new_streak = 1                                               # first race, or streak broken

    # ---- Feature 7: career counters kept alongside the legacy arrays
    career_inc = {"totalRaces": 1, "totalPoints": points}
    if placed and position == 1:
        career_inc["totalWins"] = 1
    if placed and position <= 3:
        career_inc["totalPodiums"] = 1

    await db.users.update_one(
        {"_id": user_id},
        {
            "$set": {"currentStreak": new_streak, "lastActiveDate": today},
            "$max": {"longestStreak": new_streak},
            "$inc": career_inc,
        },
    )

    summary = {
        "currentStreak": new_streak,
        "championshipPoints": 0,
        "bonusAwarded": 0,
        "championshipActive": False,
    }

    champ = await get_active_championship()
    if not champ:
        return summary

    summary["championshipActive"] = True
    champ_id = champ["_id"]
    uid = str(user_id)

    # ---- Feature 1: accrue this race into the weekly standings
    entry_inc = {
        "weeklyPoints": points,
        "racesPlayed": 1,
        f"dailyRaceCounts.{today}": 1,
    }
    if placed and position == 1:
        entry_inc["wins"] = 1
    if placed and position <= 3:
        entry_inc["podiums"] = 1

    res = await db.championship_entries.update_one(
        {"championshipId": champ_id, "userId": uid},
        {
            "$setOnInsert": {
                "championshipId": champ_id,
                "userId": uid,
                "joinedAt": to_ms(now),
                "bonusPointsAwarded": 0,
                "dailyBonusDates": [],
                "previousRank": 0,
                "currentRank": 0,
            },
            "$set": {
                "username": user.get("username", "Unknown"),
                "country": user.get("country", ""),
                "pfp": user.get("pfp", ""),
                "updatedAt": to_ms(now),
            },
            "$inc": entry_inc,
        },
        upsert=True,
    )

    if res.upserted_id is not None:
        await db.users.update_one({"_id": user_id}, {"$inc": {"championshipsEntered": 1}})

    # ---- Feature 2: daily participation bonus, once per calendar day
    entry = await db.championship_entries.find_one({"championshipId": champ_id, "userId": uid})
    required = int(champ.get("dailyBonusRaces", DEFAULT_BONUS_RACES))
    bonus_points = int(champ.get("dailyBonusPoints", DEFAULT_BONUS_POINTS))
    races_today = int((entry.get("dailyRaceCounts") or {}).get(today, 0))
    already_paid = today in (entry.get("dailyBonusDates") or [])

    if races_today >= required and not already_paid:
        await db.championship_entries.update_one(
            {"_id": entry["_id"]},
            {"$inc": {"weeklyPoints": bonus_points, "bonusPointsAwarded": bonus_points},
             "$addToSet": {"dailyBonusDates": today}},
        )
        summary["bonusAwarded"] = bonus_points
        print(f"🎁 Daily bonus +{bonus_points} to {user.get('username')} "
              f"({races_today} races on {today})")

    summary["championshipPoints"] = points + summary["bonusAwarded"]

    # Re-read this player's own row only — no table-wide re-rank on the hot
    # path. Their live rank comes from an indexed count, and the stored ranks
    # for everyone else are refreshed by the scheduler tick.
    fresh = await db.championship_entries.find_one(
        {"_id": entry["_id"]}, {"weeklyPoints": 1, "wins": 1, "joinedAt": 1}
    )
    if fresh:
        rank = await exact_rank(champ_id, fresh)
        await db.users.update_one(
            {"_id": user_id},
            {"$set": {"weeklyPoints": int(fresh.get("weeklyPoints", 0)), "weeklyRank": rank}},
        )
        summary["weeklyPoints"] = int(fresh.get("weeklyPoints", 0))
        summary["weeklyRank"] = rank

    return summary


# ------------------------------------------------------------ view formatting

async def _decorate(
    entries: List[Dict[str, Any]],
    now: datetime,
    ranks: Optional[List[int]] = None,
) -> List[Dict[str, Any]]:
    """
    Attach live streaks to standings rows in one batched users lookup.

    `entries` must already be sorted by RANK_SORT — rank comes from list
    position, not the stored currentRank, so the number shown always agrees with
    the order shown even between scheduler ticks. Pass `ranks` explicitly when
    decorating rows out of context (e.g. a single player's own row).
    """
    ids = []
    for e in entries:
        try:
            ids.append(ObjectId(e["userId"]))
        except (InvalidId, TypeError, KeyError):
            continue

    streaks: Dict[str, int] = {}
    if ids:
        cursor = db.users.find(
            {"_id": {"$in": ids}},
            {"currentStreak": 1, "lastActiveDate": 1, "country": 1, "pfp": 1},
        )
        async for u in cursor:
            streaks[str(u["_id"])] = effective_streak(u, now)

    rows = []
    for i, e in enumerate(entries):
        rank = ranks[i] if ranks else i + 1
        prev = int(e.get("previousRank", 0) or 0)
        rows.append({
            "rank": rank,
            "userId": e.get("userId"),
            "username": e.get("username", "Unknown"),
            "country": e.get("country", ""),
            "flag": country_flag(e.get("country")),
            "pfp": avatar_for(e.get("userId"), e.get("pfp"), e.get("username")),
            "weeklyPoints": int(e.get("weeklyPoints", 0)),
            "races": int(e.get("racesPlayed", 0)),
            "wins": int(e.get("wins", 0)),
            "podiums": int(e.get("podiums", 0)),
            "bonusPoints": int(e.get("bonusPointsAwarded", 0)),
            "currentStreak": streaks.get(e.get("userId"), 0),
            # positive = climbed. 0 when there is no snapshot to compare against.
            "positionChange": (prev - rank) if prev and rank else 0,
        })
    return rows


def _time_remaining(end_ms: int, now: datetime) -> Dict[str, int]:
    remaining = max(0, end_ms - to_ms(now))
    total_seconds = remaining // 1000
    return {
        "days": int(total_seconds // 86400),
        "hours": int((total_seconds % 86400) // 3600),
        "minutes": int((total_seconds % 3600) // 60),
        "seconds": int(total_seconds % 60),
        "totalMs": int(remaining),
    }


def _champ_public(champ: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(champ["_id"]),
        "name": champ.get("name"),
        "sponsor": champ.get("sponsor", ""),
        "description": champ.get("description", ""),
        "weekNumber": champ.get("weekNumber"),
        "startDate": champ.get("startDate"),
        "endDate": champ.get("endDate"),
        "dailyBonusRaces": int(champ.get("dailyBonusRaces", DEFAULT_BONUS_RACES)),
        "dailyBonusPoints": int(champ.get("dailyBonusPoints", DEFAULT_BONUS_POINTS)),
        # Free text for display; prizePoints is the part that actually pays out.
        "prize": champ.get("prize", ""),
        "prizePoints": int(champ.get("prizePoints", 0) or 0),
    }


async def _standings(champ_id: ObjectId, limit: Optional[int] = None) -> List[Dict[str, Any]]:
    cursor = db.championship_entries.find({"championshipId": champ_id}, sort=RANK_SORT)
    if limit:
        cursor = cursor.limit(limit)
    return await cursor.to_list(None)


# ------------------------------------------------------------- public API

@router.get("/api/championship/current")
async def championship_current():
    """Feature 6 — everything the homepage widget needs in one call."""
    now = utc_now()
    champ = await get_active_championship()

    if not champ:
        nxt = await db.championships.find_one(
            {"status": STATUS_QUEUED}, sort=[("queueOrder", ASCENDING), ("createdAt", ASCENDING)]
        )
        return {
            "active": False,
            "championship": None,
            "timeRemaining": None,
            "leader": None,
            "topTen": [],
            "participantCount": 0,
            "nextUp": {"name": nxt.get("name"), "startMode": nxt.get("startMode")} if nxt else None,
        }

    top = await _decorate(await _standings(champ["_id"], limit=10), now)
    total = await db.championship_entries.count_documents({"championshipId": champ["_id"]})

    return {
        "active": True,
        "championship": _champ_public(champ),
        "timeRemaining": _time_remaining(champ.get("endDate", 0), now),
        "leader": top[0] if top else None,
        "topTen": top,
        "participantCount": total,
    }


@router.get("/api/championship/leaderboard")
async def championship_leaderboard(
    limit: int = Query(100, ge=1, le=500),
    userId: Optional[str] = Query(None),
):
    """
    Feature 9 — Top 10 weekly, Top N weekly, current leader, and (when userId is
    supplied) that player's rank and position change.
    """
    now = utc_now()
    champ = await get_active_championship()
    if not champ:
        return {"active": False, "championship": None, "leader": None,
                "top10": [], "entries": [], "total": 0, "player": None}

    rows = await _decorate(await _standings(champ["_id"], limit=limit), now)
    total = await db.championship_entries.count_documents({"championshipId": champ["_id"]})

    player = None
    if userId:
        entry = await db.championship_entries.find_one(
            {"championshipId": champ["_id"], "userId": userId}
        )
        if entry:
            # A single row has no list position to rank from — count who is ahead.
            rank = await exact_rank(champ["_id"], entry)
            player = (await _decorate([entry], now, ranks=[rank]))[0]
            player["previousRank"] = int(entry.get("previousRank", 0) or 0)

    return {
        "active": True,
        "championship": _champ_public(champ),
        "leader": rows[0] if rows else None,
        "top10": rows[:10],
        "entries": rows,
        "total": total,
        "player": player,
    }


@router.get("/api/leaderboard/active")
async def leaderboard_active(timeline: str = Query("All time")):
    """
    The 'swap' from the spec: serve championship standings while a championship
    is live, otherwise fall back to the original all-time leaderboard. The
    response keeps the existing {data: [...]} envelope so the current frontend
    can read it unchanged; `mode` tells a newer frontend which one it got.
    """
    now = utc_now()
    champ = await get_active_championship()

    if champ:
        rows = await _decorate(await _standings(champ["_id"]), now)
        return {
            "mode": "championship",
            "championship": _champ_public(champ),
            "timeRemaining": _time_remaining(champ.get("endDate", 0), now),
            "data": [{
                "username": r["username"],
                "points": r["weeklyPoints"],
                "races": r["races"],
                "numberOfWins": r["wins"],
                "country": r["country"],
                "flag": r["flag"],
                "currentStreak": r["currentStreak"],
                "rank": r["rank"],
                "positionChange": r["positionChange"],
                "userId": r["userId"],
            } for r in rows],
        }

    if _fallback_leaderboard is None:
        raise HTTPException(status_code=503, detail="Leaderboard fallback not registered")
    data = await _fallback_leaderboard(timeline)
    return {"mode": "alltime", "championship": None, "timeRemaining": None, "data": data}


@router.get("/api/championship/history")
async def championship_history(
    limit: int = Query(50, ge=1, le=200),
    userId: Optional[str] = Query(None),
):
    """
    Feature 5 — Hall of Champions.

    With `userId`, each archived championship also carries `you`: where that
    player finished. Resolved in one query across the whole page of history
    rather than one per championship, so opening the Competitions tab costs the
    same whether a player has one past championship or fifty.

    Unauthenticated on purpose — it reads the same final placings the archive
    already publishes, and requiring a session would blank the list for a
    logged-out visitor browsing past weeks.
    """
    docs = await db.championship_history.find({}).sort("weekNumber", DESCENDING).limit(limit).to_list(None)

    mine: Dict[str, Dict[str, Any]] = {}
    if userId and docs:
        champ_ids = [d["championshipId"] for d in docs if d.get("championshipId")]
        if champ_ids:
            cursor = db.championship_entries.find(
                {"championshipId": {"$in": champ_ids}, "userId": userId}
            )
            async for e in cursor:
                mine[str(e["championshipId"])] = {
                    # finalRank is frozen when a championship ends. currentRank is
                    # the fallback for one archived before that field existed.
                    "rank": int(e.get("finalRank") or e.get("currentRank") or 0),
                    "points": int(e.get("weeklyPoints", 0)),
                    "races": int(e.get("racesPlayed", 0)),
                    "wins": int(e.get("wins", 0)),
                }

    def side(p: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not p or not p.get("userId"):
            return None
        return {**p, "flag": country_flag(p.get("country"))}

    return {"history": [{
        "championshipId": str(d.get("championshipId")),
        "name": d.get("name"),
        "sponsor": d.get("sponsor", ""),
        "weekNumber": d.get("weekNumber"),
        "startDate": d.get("startDate"),
        "endDate": d.get("endDate"),
        "champion": side(d.get("champion")),
        "secondPlace": side(d.get("secondPlace")),
        "thirdPlace": side(d.get("thirdPlace")),
        "winningScore": d.get("winningScore", 0),
        "runnerUpScore": d.get("runnerUpScore", 0),
        "thirdPlaceScore": d.get("thirdPlaceScore", 0),
        "participantCount": d.get("participantCount", 0),
        "prize": d.get("prize", ""),
        "prizePoints": int(d.get("prizePoints", 0) or 0),
        # None when no userId was supplied, or when that player never entered
        # this one — the card then simply omits the "you finished" line.
        "you": mine.get(str(d.get("championshipId"))),
    } for d in docs]}


@router.get("/api/championship/{championship_id}")
async def championship_detail(championship_id: str):
    """Full final standings for one archived (or running) championship."""
    champ = await db.championships.find_one({"_id": _oid(championship_id, "championship id")})
    if not champ:
        raise HTTPException(status_code=404, detail="Championship not found")

    rows = await _decorate(await _standings(champ["_id"]), utc_now())
    return {
        "championship": {**_champ_public(champ), "status": champ.get("status")},
        "standings": rows,
        "participantCount": len(rows),
    }


@router.get("/api/player/{user_id}/profile")
async def player_profile(user_id: str):
    """Feature 4 — the public profile behind every clickable username."""
    now = utc_now()
    user = await db.users.find_one({"_id": _oid(user_id, "user id")})
    if not user:
        raise HTTPException(status_code=404, detail="Player not found")

    # Career totals: prefer the maintained counters, fall back to the legacy
    # arrays so profiles work for players who predate the backfill.
    total_races = user.get("totalRaces")
    if total_races is None:
        total_races = sum(r.get("races", 0) for r in (user.get("racesPlayed") or []))
    total_wins = user.get("totalWins")
    if total_wins is None:
        total_wins = sum(w.get("wins", 0) for w in (user.get("numberOfWins") or []))
    total_points = user.get("totalPoints")
    if total_points is None:
        total_points = sum(p.get("points", 0) for p in (user.get("points") or []))
    total_podiums = int(user.get("totalPodiums", 0) or 0)

    total_races = int(total_races or 0)
    total_wins = int(total_wins or 0)
    total_points = int(total_points or 0)

    champ = await get_active_championship()
    weekly_points, weekly_rank = 0, 0
    if champ:
        entry = await db.championship_entries.find_one(
            {"championshipId": champ["_id"], "userId": str(user["_id"])}
        )
        if entry:
            weekly_points = int(entry.get("weeklyPoints", 0))
            weekly_rank = int(entry.get("currentRank", 0))

    pct = lambda n: round((n / total_races) * 100, 1) if total_races else 0.0

    return {
        "identity": {
            "userId": str(user["_id"]),
            "username": user.get("username", "Unknown"),
            "country": user.get("country", ""),
            "flag": country_flag(user.get("country")),
            "joinDate": user.get("createdAt"),
            "profileImage": avatar_for(
                user["_id"], user.get("pfp"), user.get("username")
            ),
        },
        "currentStatus": {
            "weeklyRank": weekly_rank,
            "weeklyPoints": weekly_points,
            "currentStreak": effective_streak(user, now),
            "longestStreak": int(user.get("longestStreak", 0) or 0),
            "championshipActive": champ is not None,
        },
        "career": {
            "totalRaces": total_races,
            "totalWins": total_wins,
            "totalPodiums": total_podiums,
            "totalPoints": total_points,
            "winPercentage": pct(total_wins),
            "podiumPercentage": pct(total_podiums),
        },
        "championships": {
            "entered": int(user.get("championshipsEntered", 0) or 0),
            "wins": int(user.get("championshipWins", 0) or 0),
            "bestWeeklyFinish": user.get("bestWeeklyFinish"),
            "top10Finishes": int(user.get("top10Finishes", 0) or 0),
        },
    }


@router.post("/api/user/country")
async def set_country(
    request: Request,
    country: str = Form(...),
    userId: str = Form(""),
):
    """
    Country is user-selected — nothing in the login providers supplies it.

    The account acted on comes from the verified session, never from the form,
    so a caller cannot set someone else's flag. `userId` is accepted only so an
    inconsistent client gets a clear 403 instead of silently editing itself.
    """
    authenticated_id = await require_self(request, userId)

    code = (country or "").strip().upper()
    if len(code) != 2 or not code.isalpha():
        raise HTTPException(status_code=400, detail="country must be an ISO 3166-1 alpha-2 code")

    uid = _oid(authenticated_id, "user id")
    res = await db.users.update_one({"_id": uid}, {"$set": {"country": code}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")

    # Keep the active championship standings row in sync so the flag shows up
    # immediately instead of after the player's next race.
    champ = await get_active_championship()
    if champ:
        await db.championship_entries.update_one(
            {"championshipId": champ["_id"], "userId": str(uid)},
            {"$set": {"country": code}},
        )

    return {"status": "success", "country": code, "flag": country_flag(code)}


# Avatars are stored inline on the user document as data URIs, so an oversized
# upload would bloat both the document and every leaderboard payload that
# carries a pfp. The browser downscales to 256px before sending, which lands
# around 40KB — this cap only exists to stop a hand-rolled request.
MAX_PFP_CHARS = 700_000

ALLOWED_PFP_PREFIXES = (
    "data:image/png;base64,",
    "data:image/jpeg;base64,",
    "data:image/jpg;base64,",
    "data:image/webp;base64,",
    "data:image/gif;base64,",
)


@router.post("/api/user/profile")
async def update_profile(
    request: Request,
    username: Optional[str] = Form(None),
    pfp: Optional[str] = Form(None),
    userId: str = Form(""),
):
    """
    Edit the two profile fields a player owns: their name and their avatar.

    Same trust model as set_country above — the account written to comes from
    the verified session, and `userId` is accepted only so a client that has
    drifted out of sync gets a clear 403 instead of silently editing itself.

    Either field may be omitted; only what is sent gets written. An empty `pfp`
    clears the avatar back to the default. `pfp` must be a data URI rather than
    a link because OAuth logins already park a provider URL in this same field
    and readers just drop whichever string they find into an <img src> — letting
    a client write an arbitrary URL there would make every leaderboard fetch an
    attacker-chosen host.
    """
    authenticated_id = await require_self(request, userId)

    updates: Dict[str, Any] = {}

    if username is not None:
        name = " ".join(username.split())  # collapses whitespace and strips newlines
        if not 2 <= len(name) <= 30:
            raise HTTPException(status_code=400, detail="Name must be 2-30 characters")
        updates["username"] = name

    if pfp is not None:
        image = pfp.strip()
        if image:
            if not image.startswith(ALLOWED_PFP_PREFIXES):
                raise HTTPException(
                    status_code=400,
                    detail="Profile image must be a PNG, JPEG, WebP or GIF data URI",
                )
            if len(image) > MAX_PFP_CHARS:
                raise HTTPException(status_code=413, detail="Profile image is too large")
        updates["pfp"] = image

    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")

    uid = _oid(authenticated_id, "user id")
    res = await db.users.update_one({"_id": uid}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")

    # championship_entries keeps its own copy of the name and avatar, refreshed
    # on each race. Without this the standings would keep showing the old ones
    # until the player next races.
    champ = await get_active_championship()
    if champ:
        await db.championship_entries.update_one(
            {"championshipId": champ["_id"], "userId": str(uid)},
            {"$set": updates},
        )

    return {"status": "success", **updates}


# --------------------------------------------------------------- admin panel
#
# require_admin duplicates main.py's require_login rather than importing it —
# main.py imports this module, so importing back would be circular. Both read
# the same db.sessions collection, so a single login covers the whole dashboard.

async def require_admin(request: Request) -> str:
    sid = request.cookies.get("session_id")
    if not sid:
        raise HTTPException(status_code=401, detail="Authentication required")
    session = await db.sessions.find_one({"_id": sid})
    if not session:
        raise HTTPException(status_code=401, detail="Authentication required")
    expires = session.get("expires_at")
    if expires and expires < datetime.utcnow():
        await db.sessions.delete_one({"_id": sid})
        raise HTTPException(status_code=401, detail="Session expired")
    return session["username"]


def _fmt(ms: Optional[int]) -> str:
    if not ms:
        return "—"
    return from_ms(ms).strftime("%Y-%m-%d %H:%M UTC")


@router.get("/championships", response_class=HTMLResponse)
async def championships_page(request: Request):
    try:
        username = await require_admin(request)
    except HTTPException:
        return RedirectResponse("/login")

    active = await get_active_championship()
    queued = await db.championships.find({"status": STATUS_QUEUED}).sort(
        [("queueOrder", ASCENDING), ("createdAt", ASCENDING)]
    ).to_list(None)
    finished = await db.championships.find(
        {"status": {"$in": [STATUS_COMPLETED, STATUS_CANCELLED]}}
    ).sort("endedAt", DESCENDING).limit(25).to_list(None)

    now = utc_now()
    active_view = None
    if active:
        active_view = {
            **active,
            "id": str(active["_id"]),
            "startPretty": _fmt(active.get("startDate")),
            "endPretty": _fmt(active.get("endDate")),
            "remaining": _time_remaining(active.get("endDate", 0), now),
            "participants": await db.championship_entries.count_documents(
                {"championshipId": active["_id"]}
            ),
        }

    # Preview which calendar week each queued championship will land on, so the
    # admin can see the consequence of the ordering before committing to it.
    week_start, _ = week_window(now)
    cursor_week = week_start
    if await _week_already_used(to_ms(week_start)):
        cursor_week = week_start + timedelta(days=7)
    if active and active.get("weekStart"):
        cursor_week = from_ms(active["weekStart"]) + timedelta(days=7)

    queued_view = []
    for i, c in enumerate(queued):
        mode = c.get("startMode", MODE_NEXT_MONDAY)
        if mode == MODE_IMMEDIATE:
            eta = "On next tick" if not active else "When current ends"
        elif mode == MODE_SCHEDULED:
            eta = _fmt(c.get("scheduledStart"))
        else:
            eta = cursor_week.strftime("%Y-%m-%d") + " (Mon 00:00 UTC)"
            cursor_week = cursor_week + timedelta(days=7)
        queued_view.append({**c, "id": str(c["_id"]), "position": i + 1, "eta": eta})

    finished_view = [{
        **c,
        "id": str(c["_id"]),
        "startPretty": _fmt(c.get("startDate")),
        "endPretty": _fmt(c.get("endDate")),
    } for c in finished]

    return templates.TemplateResponse("championships.html", {
        "request": request,
        "username": username,
        "active": active_view,
        "queued": queued_view,
        "finished": finished_view,
        "defaultBonusRaces": DEFAULT_BONUS_RACES,
        "defaultBonusPoints": DEFAULT_BONUS_POINTS,
    })


@router.post("/api/admin/championships/new")
async def admin_create_championship(
    request: Request,
    name: str = Form(...),
    sponsor: str = Form(""),
    description: str = Form(""),
    startMode: str = Form(MODE_NEXT_MONDAY),
    scheduledStart: str = Form(""),
    dailyBonusRaces: int = Form(DEFAULT_BONUS_RACES),
    dailyBonusPoints: int = Form(DEFAULT_BONUS_POINTS),
    prize: str = Form(""),
    prizePoints: int = Form(0),
):
    await require_admin(request)

    if startMode not in (MODE_NEXT_MONDAY, MODE_IMMEDIATE, MODE_SCHEDULED):
        raise HTTPException(status_code=400, detail=f"Unknown startMode: {startMode}")

    scheduled_ms = None
    if startMode == MODE_SCHEDULED:
        if not scheduledStart:
            raise HTTPException(status_code=400, detail="scheduledStart required for scheduled mode")
        try:
            # datetime-local input, interpreted as UTC.
            scheduled_ms = to_ms(datetime.strptime(scheduledStart, "%Y-%m-%dT%H:%M").replace(tzinfo=timezone.utc))
        except ValueError:
            raise HTTPException(status_code=400, detail="scheduledStart must be YYYY-MM-DDTHH:MM")

    last = await db.championships.find_one({"status": STATUS_QUEUED}, sort=[("queueOrder", DESCENDING)])
    next_order = int(last.get("queueOrder", 0)) + 1 if last else 1

    await db.championships.insert_one({
        "name": name.strip(),
        "sponsor": sponsor.strip(),
        "description": description.strip(),
        "status": STATUS_QUEUED,
        "queueOrder": next_order,
        "startMode": startMode,
        "scheduledStart": scheduled_ms,
        "dailyBonusRaces": max(1, int(dailyBonusRaces)),
        "dailyBonusPoints": max(0, int(dailyBonusPoints)),
        "prize": prize.strip(),
        "prizePoints": max(0, int(prizePoints)),
        "createdAt": to_ms(utc_now()),
        "updatedAt": to_ms(utc_now()),
    })
    return RedirectResponse("/championships", status_code=303)


@router.post("/api/admin/championships/update")
async def admin_update_championship(
    request: Request,
    championship_id: str = Form(...),
    name: str = Form(...),
    sponsor: str = Form(""),
    description: str = Form(""),
    dailyBonusRaces: int = Form(DEFAULT_BONUS_RACES),
    dailyBonusPoints: int = Form(DEFAULT_BONUS_POINTS),
    prize: str = Form(""),
    prizePoints: int = Form(0),
    startMode: str = Form(""),
):
    """
    Queued championships are fully editable. A running one can still have its
    branding and bonus rules changed, but not its start behaviour — that week is
    already underway. Completed ones are a permanent archive and are read-only.
    """
    await require_admin(request)
    cid = _oid(championship_id, "championship id")

    champ = await db.championships.find_one({"_id": cid})
    if not champ:
        raise HTTPException(status_code=404, detail="Championship not found")
    if champ.get("status") in (STATUS_COMPLETED, STATUS_CANCELLED):
        raise HTTPException(status_code=400, detail="Finished championships are read-only")

    updates: Dict[str, Any] = {
        "name": name.strip(),
        "sponsor": sponsor.strip(),
        "description": description.strip(),
        "dailyBonusRaces": max(1, int(dailyBonusRaces)),
        "dailyBonusPoints": max(0, int(dailyBonusPoints)),
        "prize": prize.strip(),
        "prizePoints": max(0, int(prizePoints)),
        "updatedAt": to_ms(utc_now()),
    }
    if champ.get("status") == STATUS_QUEUED and startMode in (
        MODE_NEXT_MONDAY, MODE_IMMEDIATE, MODE_SCHEDULED
    ):
        updates["startMode"] = startMode

    await db.championships.update_one({"_id": cid}, {"$set": updates})
    return RedirectResponse("/championships", status_code=303)


@router.post("/api/admin/championships/reorder")
async def admin_reorder_championship(
    request: Request,
    championship_id: str = Form(...),
    direction: str = Form(...),
):
    """Swap a queued championship with its neighbour to change what rolls first."""
    await require_admin(request)
    if direction not in ("up", "down"):
        raise HTTPException(status_code=400, detail="direction must be 'up' or 'down'")

    cid = _oid(championship_id, "championship id")
    queue = await db.championships.find({"status": STATUS_QUEUED}).sort(
        [("queueOrder", ASCENDING), ("createdAt", ASCENDING)]
    ).to_list(None)

    idx = next((i for i, c in enumerate(queue) if c["_id"] == cid), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Championship is not in the queue")

    swap = idx - 1 if direction == "up" else idx + 1
    if swap < 0 or swap >= len(queue):
        return RedirectResponse("/championships", status_code=303)

    queue[idx], queue[swap] = queue[swap], queue[idx]

    # Rewrite the whole queue's ordering — cheap, and self-heals any duplicate
    # or missing queueOrder values left behind by earlier edits.
    await db.championships.bulk_write(
        [UpdateOne({"_id": c["_id"]}, {"$set": {"queueOrder": i + 1}})
         for i, c in enumerate(queue)],
        ordered=False,
    )
    return RedirectResponse("/championships", status_code=303)


@router.post("/api/admin/championships/delete")
async def admin_delete_championship(request: Request, championship_id: str = Form(...)):
    """
    Deleting a queued championship removes it outright. Deleting the running one
    is treated as 'end it now': results are still crowned and archived, because
    players already earned those points.
    """
    await require_admin(request)
    cid = _oid(championship_id, "championship id")

    champ = await db.championships.find_one({"_id": cid})
    if not champ:
        raise HTTPException(status_code=404, detail="Championship not found")

    status = champ.get("status")
    if status == STATUS_ACTIVE:
        await end_championship(champ, reason="deleted")
    elif status == STATUS_QUEUED:
        await db.championships.delete_one({"_id": cid})
    else:
        raise HTTPException(status_code=400, detail="Archived championships cannot be deleted")

    return RedirectResponse("/championships", status_code=303)


@router.post("/api/admin/championships/end")
async def admin_end_championship(request: Request, championship_id: str = Form(...)):
    """Crown the winner early and let the queue roll on to the next one."""
    await require_admin(request)
    cid = _oid(championship_id, "championship id")

    champ = await db.championships.find_one({"_id": cid, "status": STATUS_ACTIVE})
    if not champ:
        raise HTTPException(status_code=404, detail="No active championship with that id")

    await end_championship(champ, reason="ended_by_admin")
    return RedirectResponse("/championships", status_code=303)
