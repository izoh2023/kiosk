import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const login = readFileSync(new URL('./login.html', import.meta.url), 'utf8');

test('RouterOS login URL is injected through processed HTML', () => {
  assert.match(login, /window\._linkLoginOnly = '\$\(link-login-only\)'/);
  assert.match(app, /linkLoginOnly:\s+window\._linkLoginOnly/);
  assert.doesNotMatch(app, /linkLoginOnly:\s+'\$\(link-login-only\)'/);
});

test('ad auto-login prefers the native RouterOS form action', () => {
  assert.match(app, /document\.forms\.login\?\.action/);
  assert.match(app, /isResolvedHotspotUrl/);
  assert.match(app, /form\.action = loginUrl/);
});

test('countdown automatically redeems through the backend orchestrator', () => {
  assert.match(app, /void adFlowClaim\(\)/);
  assert.match(app, /router_id:\s+config\.hotspotRouterId/);
  assert.match(app, /redeemData\.username/);
  assert.match(app, /redeemData\.password/);
  assert.doesNotMatch(app, /routerApiBase}\/api\/users/);
  assert.doesNotMatch(login, /id="ad-claim-btn"[^>]+onclick=/);
});

test('CTA is used only as the post-redemption login destination', () => {
  assert.doesNotMatch(login, /id="ad-cta-link"/);
  assert.doesNotMatch(app, /getElementById\('ad-cta-link'\)/);
  assert.match(app, /getPostRedemptionDestination\(_adData\?\.cta_url\)/);
  assert.match(app, /url\.protocol === 'https:' \|\| url\.protocol === 'http:'/);
});

test('image ads run for seven seconds and videos run for their real duration', () => {
  assert.match(app, /const IMAGE_AD_SECONDS = 7/);
  assert.match(app, /ad\.media_content_type\?\.startsWith\('video\/'\)/);
  assert.match(app, /Math\.ceil\(vid\.duration\)/);
  assert.match(app, /_adStartCountdown\(_adTotal, vid\)/);
  assert.match(app, /if \(mediaElement && \(mediaElement\.paused \|\| document\.hidden\)\) return/);
});

test('portal disables ad access while the device is in its reward cooldown', () => {
  assert.match(login, /id="ad-watch-button"/);
  assert.match(login, /id="ad-used-msg"/);
  assert.match(app, /\/eligibility\?mac_address=/);
  assert.match(app, /retry_after_seconds/);
  assert.match(app, /showAdIneligible/);
});
