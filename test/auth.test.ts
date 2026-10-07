import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isAccessToken, isAuthorized, SESSION_COOKIE, sessionCookie } from '../src/web/auth.ts';

const token = 'secret-access-token';

describe('auth', () => {
  it('lets everyone in when no access token is set, as on localhost', () => {
    assert.equal(isAuthorized({}, undefined), true);
  });

  it('takes the token as a bearer token from the app', () => {
    assert.equal(isAuthorized({ authorization: `Bearer ${token}` }, token), true);
    assert.equal(isAuthorized({ authorization: 'Bearer wrong' }, token), false);
    assert.equal(isAuthorized({ authorization: token }, token), false);
    assert.equal(isAuthorized({}, token), false);
  });

  it('takes the cookie the login page sets, which holds a digest rather than the token', () => {
    const cookie = sessionCookie(token, true);
    const value = /^budget_session=([0-9a-f]+);/.exec(cookie)?.[1];

    assert.ok(value && !cookie.includes(token));
    assert.ok(cookie.includes('HttpOnly') && cookie.includes('SameSite=Lax') && cookie.includes('; Secure'));
    assert.ok(!sessionCookie(token, false).includes('Secure'), 'plain HTTP, as on a home network, gets no Secure');
    assert.equal(isAuthorized({ cookie: `other=1; ${SESSION_COOKIE}=${value}` }, token), true);
    assert.equal(isAuthorized({ cookie: `${SESSION_COOKIE}=${value}` }, 'another-token'), false);
    assert.equal(isAuthorized({ cookie: `${SESSION_COOKIE}=0000` }, token), false);
  });

  it('checks a token typed on the login page, spaces around it aside', () => {
    assert.equal(isAccessToken(`  ${token}\n`, token), true);
    assert.equal(isAccessToken('secret', token), false);
  });
});
