# avatars.py
#
# GENERATED PROFILE PICTURES.
#
# Not every player arrives with an avatar. The email signup path never sets one
# (see demoSignUp.ts / signUp.ts in the Node API), and the Twitch, TikTok and
# Kick logins hand back an empty avatar field often enough that a visible share
# of any leaderboard renders as a blank circle. Rather than show one shared
# placeholder — which makes every such player look like the same person — this
# draws a per-player SVG so rows stay distinguishable at a glance.
#
# Drawn here rather than fetched from an avatar service (the Node seed script
# points at dicebear.com) so leaderboards do not depend on a third party being
# reachable, and so no player id is handed to one.
#
# NOTHING HERE IS EVER WRITTEN TO THE DATABASE. users.pfp stays empty for a
# player who has not set one, and the fallback is applied while a payload is
# built. That keeps "this player chose an avatar" distinguishable from "we drew
# one for them", which means:
#   * the generator can be redesigned later without stranding rows that captured
#     its old output,
#   * the Remove button in the edit-profile modal returns a player to a
#     generated avatar rather than to a blank circle,
#   * and a player who later connects Google does not have a generated image
#     sitting in the way of the real one.
#
# This module deliberately has no database or FastAPI dependency — it is pure
# rendering. The HTTP endpoint that serves it lives in main.py (which already
# holds a db handle) and the payload-time fallback is applied in championship.py.
# Keeping it dependency-free is what lets both import it without a cycle.

import hashlib
import re
from typing import Optional
from urllib.parse import quote
from xml.sax.saxutils import escape

# Gradient pairs picked to sit on the app's near-black panels (#0b0b0f/#1c1c22)
# without vibrating, and to stay legible under white text. The pair is chosen by
# hashing the player's id, so a player keeps the same colours forever — across
# renames, across devices, and across restarts of this service.
PALETTE = [
    ("#8b6fed", "#4c2fb8"),  # the app's own purple
    ("#ff5c8a", "#b82f5e"),
    ("#4c8dff", "#2a4fb8"),
    ("#2fd4c4", "#17857f"),
    ("#ffa23c", "#c26a12"),
    ("#4cd964", "#1f9e3e"),
    ("#ff6b5c", "#c2382a"),
    ("#3cc8ff", "#1a7fc2"),
    ("#ff4f9a", "#c21f6b"),
    ("#a78bfa", "#6d28d9"),
]

# Rotating the gradient gives two players who land on the same colour pair a
# visibly different avatar, at no extra cost.
GRADIENT_ANGLES = [
    ("0", "0", "1", "1"),
    ("1", "0", "0", "1"),
    ("0", "0", "0", "1"),
    ("0", "0", "1", "0"),
]

# Generic silhouette for a player with no usable name, so the avatar reads as a
# person rather than as a rendering failure.
_SILHOUETTE = (
    '<path d="M64 62a17 17 0 1 0 0-34 17 17 0 0 0 0 34zm0 10c-16 0-29 9-29 20v8h58v-8'
    'c0-11-13-20-29-20z" fill="#fff" fill-opacity=".9"/>'
)

# A data URI is its own document, so a fixed gradient id cannot collide with
# another avatar's on the same page.
_GRADIENT_ID = "g"


# Player names here are gamer tags far more often than they are real names, so
# the word boundary is rarely a space.
_SEPARATORS = re.compile(r"[\s_\-.|+~·]+")


def _lead_alnum(token: str) -> str:
    """Drop leading decoration so the initial is a character, not a bullet."""
    for i, ch in enumerate(token):
        if ch.isalnum():
            return token[i:]
    return ""


def _initials(name: Optional[str]) -> str:
    """
    Up to two characters, chosen to stay readable at leaderboard size (~30px).

    A single-word name contributes two letters rather than one, because one
    letter alone in a large circle reads as an accident.
    """
    tokens = [t for t in (_lead_alnum(t) for t in _SEPARATORS.split(name or "")) if t]

    # "x_Ravager_x" is one real word with filler either side — take the word.
    # Only when every token is a single character (a name like "A" or "J R") is
    # there nothing better to fall back on.
    meaningful = [t for t in tokens if len(t) > 1]
    if meaningful:
        tokens = meaningful

    if not tokens:
        return ""
    if len(tokens) == 1:
        return tokens[0][:2].upper()
    return (tokens[0][0] + tokens[-1][0]).upper()


def avatar_svg(seed: str, name: Optional[str] = None, size: int = 128) -> str:
    """
    A deterministic avatar for `seed`, captioned with the initials of `name`.

    Colour comes from `seed` (the user id) and only the lettering comes from
    `name`, so renaming a player recolours nothing — their avatar stays
    recognisable to everyone who has already learnt it.
    """
    digest = hashlib.sha256((seed or "").encode("utf-8")).digest()
    start, end = PALETTE[digest[0] % len(PALETTE)]
    x1, y1, x2, y2 = GRADIENT_ANGLES[digest[1] % len(GRADIENT_ANGLES)]
    initials = _initials(name)

    if initials:
        # Two characters need to be smaller than one to fit the same circle.
        font_size = 46 if len(initials) > 1 else 58
        mark = (
            f'<text x="64" y="64" text-anchor="middle" dominant-baseline="central" '
            f'font-family="system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif" '
            f'font-size="{font_size}" font-weight="600" fill="#fff" fill-opacity=".95">'
            f"{escape(initials)}</text>"
        )
    else:
        mark = _SILHOUETTE

    # viewBox is fixed at 128 so every coordinate above is written once; `size`
    # only changes the rendered dimensions.
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" '
        f'width="{size}" height="{size}">'
        f'<defs><linearGradient id="{_GRADIENT_ID}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">'
        f'<stop offset="0" stop-color="{start}"/><stop offset="1" stop-color="{end}"/>'
        f"</linearGradient></defs>"
        f'<rect width="128" height="128" fill="url(#{_GRADIENT_ID})"/>'
        f"{mark}</svg>"
    )


def avatar_data_uri(seed: str, name: Optional[str] = None, size: int = 128) -> str:
    """
    The same avatar, inlined so a payload can carry it with no second request.

    Percent-encoded rather than base64: the markup is near-identical between
    avatars, so gzip collapses a whole leaderboard's worth of these to very
    little, which base64 would defeat by destroying the shared byte alignment.

    `#` must stay encoded or the colour literals would truncate the URI at the
    first fragment marker, so it is kept out of the safe set below.
    """
    svg = avatar_svg(seed, name, size)
    return "data:image/svg+xml;charset=utf-8," + quote(svg, safe="/:=,.-_()'")


def avatar_for(user_id: str, pfp: Optional[str], name: Optional[str] = None) -> str:
    """
    The avatar to show for a player: their own if they have one, else a drawn one.

    Call this wherever a pfp is read for display. Do not call it on a write path
    — see the note at the top of this module about keeping the stored value
    honest.
    """
    if pfp and pfp.strip():
        return pfp.strip()
    return avatar_data_uri(str(user_id), name)
