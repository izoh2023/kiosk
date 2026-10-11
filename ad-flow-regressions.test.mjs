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

test('countdown automatically redeems and reward creation is bounded', () => {
  assert.match(app, /void adFlowClaim\(\)/);
  assert.match(app, /mac_address:\s+mac/);
  assert.match(app, /limit_uptime:\s+`\$\{rewardMinutes\}m`/);
  assert.doesNotMatch(login, /id="ad-claim-btn"[^>]+onclick=/);
});
