// Access from outside the user's computer. With ACCESS_TOKEN set, every request needs it: the app sends it as a
// bearer token, a browser gets a cookie from the login page. The cookie holds a digest of the token rather than the
// token itself. Without ACCESS_TOKEN the server is open, as it is on localhost.

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

export const SESSION_COOKIE = 'budget_session';

/** A year: the login is for a device the user keeps. */
const SESSION_SECONDS = 365 * 24 * 60 * 60;

function sessionValue(token: string): string {
  return createHmac('sha256', token).update('budget session').digest('hex');
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function cookies(header: string | undefined): Map<string, string> {
  const pairs = (header ?? '').split(';').map((part) => part.trim().split('='));
  return new Map(pairs.filter((p) => p.length >= 2).map(([name, ...value]) => [name!, value.join('=')]));
}

/** Whether a token typed on the login page is the access token. */
export function isAccessToken(typed: string, token: string): boolean {
  return same(typed.trim(), token);
}

/** Whether the request may read and change data; always true when no access token is set. */
export function isAuthorized(headers: IncomingHttpHeaders, token: string | undefined): boolean {
  if (!token) return true;
  const bearer = /^Bearer\s+(.+)$/i.exec(headers.authorization ?? '')?.[1];
  if (bearer !== undefined && same(bearer.trim(), token)) return true;
  const session = cookies(headers.cookie).get(SESSION_COOKIE);
  return session !== undefined && same(session, sessionValue(token));
}

/** The Set-Cookie header of a login; `secure` when the page came over HTTPS. */
export function sessionCookie(token: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${sessionValue(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure ? '; Secure' : ''}`;
}
