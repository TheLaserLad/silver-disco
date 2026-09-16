# auth.py
#
# PLAYER AUTHENTICATION for the Python API.
#
# Player logins are issued by the Node API (../api), not by this service. It
# signs {_id: <userId>} with JWT_SECRET_KEY using HS256 and stores the result in
# the `token` cookie. This module verifies that same token so Python endpoints
# can act on "the logged-in player" instead of trusting a user id supplied in
# the request body.
#
# Two deployment requirements, both of which must hold or every call 401s:
#
#   1. JWT_SECRET_KEY in api2/.env must be byte-identical to the Node API's.
#   2. The Node API must set the token cookie with domain=.pinballrace.com so
#      the browser sends it to admin.pinballrace.com as well. A host-only
#      cookie (the default) never reaches this service.
#
# Kept in its own module rather than in main.py or championship.py because both
# import it, and main.py already imports championship.py — putting it in either
# would create a cycle.

import os

from fastapi import HTTPException, Request
from jose import jwt, JWTError
from dotenv import load_dotenv

load_dotenv()

# Deliberately NOT defaulted. This is the Node API's signing secret; a fallback
# value would silently accept tokens forged against a known string.
PLAYER_JWT_SECRET = os.getenv("JWT_SECRET_KEY")

# Must match createJwt.ts in the Node API.
PLAYER_JWT_ALGORITHM = "HS256"


def _extract_token(request: Request) -> str:
    """Cookie first (how the browser sends it), then a bearer header."""
    token = request.cookies.get("token")
    if token:
        return token

    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:].strip()

    return ""


async def require_player(request: Request) -> str:
    """
    Return the authenticated player's user id, or raise 401.

    The id comes from the signed token and nowhere else, so a caller cannot act
    on an account they do not hold a session for.
    """
    if not PLAYER_JWT_SECRET:
        # Misconfiguration, not a client error — surface it as a server fault so
        # it shows up in logs rather than looking like a bad login.
        raise HTTPException(
            status_code=500,
            detail="JWT_SECRET_KEY is not configured on this service",
        )

    token = _extract_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        payload = jwt.decode(
            token, PLAYER_JWT_SECRET, algorithms=[PLAYER_JWT_ALGORITHM]
        )
    except JWTError:
        # Covers a bad signature, a wrong secret and an expired token alike.
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    user_id = payload.get("_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Malformed session token")

    return str(user_id)


async def require_self(request: Request, claimed_user_id: str) -> str:
    """
    For endpoints that still take a user id in the request.

    Verifies the session and that the id being acted on is the caller's own,
    so an authenticated player cannot modify someone else's account.
    """
    actual = await require_player(request)
    if claimed_user_id and str(claimed_user_id) != actual:
        raise HTTPException(status_code=403, detail="Not your account")
    return actual
