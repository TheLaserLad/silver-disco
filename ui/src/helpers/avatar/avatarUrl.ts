/**
 * Where to point an <img> for a player's avatar.
 *
 * Players who signed up by email, or through a provider that handed back no
 * picture, have an empty pfp. The Python API draws a deterministic one per user
 * id — see api2/avatars.py — so those rows show something recognisable instead
 * of a blank circle.
 *
 * Only needed for data that comes from the Node API (/api/user/me), which has
 * no fallback applied. Payloads built by the Python API — championship
 * standings, player profiles — already carry a drawn avatar in `pfp`, so pass
 * those straight to <img> rather than through this.
 */
export const avatarUrl = (userId: string, pfp?: string): string =>
  pfp && pfp.trim() !== ""
    ? pfp
    : `${import.meta.env.VITE_PY_SERVER_URL}/api/avatar/${userId}`;
