/**
 * Scope for the player session cookie.
 *
 * Without a domain attribute a cookie is *host-only*: the browser sends it back
 * only to the exact host that set it. That meant the `token` cookie set here on
 * pinballrace.com never reached the Python API on admin.pinballrace.com, so
 * that service had no way to identify the caller and fell back to trusting a
 * user id sent in the request body.
 *
 * Setting COOKIE_DOMAIN=.pinballrace.com widens the cookie to every subdomain
 * so both services see the same session.
 *
 * Note this does not weaken SameSite: pinballrace.com and admin.pinballrace.com
 * share a registrable domain, so requests between them are same-site and even
 * `sameSite: "lax"` cookies are sent.
 *
 * Left unset in development, where a host-only cookie on localhost is correct.
 *
 * Spread into existing cookie options rather than replacing them, so each call
 * site keeps its own httpOnly/sameSite settings:
 *
 *     res.cookie("token", jwt, { httpOnly: true, ...cookieDomain() });
 */
export default function cookieDomain(): { domain?: string } {
  const domain = process.env.COOKIE_DOMAIN;
  return domain ? { domain } : {};
}
