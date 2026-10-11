import { admin_id, logo_filename, phoneNumber, router_id, router_api, admin_api, payment_api, captive_api, currency } from "./config.js";
// Namespace import (not a named one) for access_mode specifically: a
// router that hasn't had its captive portal resynced since this field was
// added still has an OLDER config.js with no such export at all, and a
// named import of a genuinely missing export throws a SyntaxError at
// module-load time — which would take down the ENTIRE page, not just
// degrade gracefully. Property access on a namespace object never throws,
// so this falls back to "both" (today's only behavior) until that router
// is resynced.
import * as configModule from "./config.js";
const access_mode = configModule.access_mode ?? "both";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────
const config = {
  packagesEndpoint:     `${router_api}/api/package?kiosk&router_id=${router_id}`,
  adminPackageEndpoint: `${admin_api}/api/package?admin=${admin_id}&kiosk=true`,
  payEndpoint:          `${payment_api}/api/payment`,
  statusEndpoint:       `${payment_api}/payment-status`,
  // RouterOS expands login.html, not this separately-served module file.
  linkLoginOnly:        window._linkLoginOnly,

  captiveApiBase:  `${captive_api}/captive`,
  routerApiBase:   router_api,
  hotspotProfile:  'default',
  hotspotRouterId: router_id,
};

// ─────────────────────────────────────────────────────────────────────────────
// BRANDING
// ─────────────────────────────────────────────────────────────────────────────
const logoEl = document.querySelector('.logo');
logoEl.style.background = `url('${logo_filename}') center / cover no-repeat`;

const telEl = document.getElementById('tel');
telEl.innerHTML = phoneNumber;

// access_mode only ever hides the self-serve M-Pesa "plans" card — in
// 'seller' mode there's no STK push configured, so buying a plan directly
// isn't an option and customers must get a voucher from a seller instead.
// The sign-in card is NEVER hidden, even in 'self_serve' mode: a customer
// who just paid via STK push but whose auto-login (showVoucher's form
// submit, above) failed or was interrupted still needs a way back in, and
// their payment reference code (the M-Pesa receipt — see showVoucher) IS
// their voucher username, so sign-in doubles as their retry path. The
// ad-supported "Free WiFi" card is a third, independent monetization path
// and isn't affected by this toggle either way.
const plansCard = document.querySelector('.card--plans');
if (access_mode === 'seller' && plansCard) plansCard.style.display = 'none';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function el(q, root = document) { return root.querySelector(q); }
function show(elm) { elm.classList.add('show'); }
function hide(elm) { elm.classList.remove('show'); }
function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function chapHash(pwd) {
  if (window._chapId && window.hexMD5) {
    return window.hexMD5(window._chapId + pwd + (window._chapChallenge || ''));
  }
  return pwd;
}

function getPostRedemptionDestination(ctaUrl) {
  if (ctaUrl) {
    try {
      const url = new URL(ctaUrl);
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
    } catch (_) {
      // Invalid advertiser URLs fall through to the hotspot's original target.
    }
  }
  return new URLSearchParams(window.location.search).get('dst')
    || window._linkOrig
    || 'http://google.com';
}

// ─────────────────────────────────────────────────────────────────────────────
// PACKAGE RENDERING  (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
let packages = null;

async function loadPackages() {
  try {
    const [adminRes, routerRes] = await Promise.all([
      fetch(config.adminPackageEndpoint),
      fetch(config.packagesEndpoint),
    ]);
    if (!adminRes.ok || !routerRes.ok) throw new Error('Failed to load packages');

    const adminData  = await adminRes.json();
    const routerData = await routerRes.json();

    const adminPackages  = adminData;
    const routerProfiles = routerData.profiles;

    packages = adminPackages.map((adminPkg) => {
      const name     = adminPkg.name.split('||')[0];
      const comments = JSON.parse(adminPkg.name.split('||')[1]);

      const match = routerProfiles.find((rp) => rp.name === name);

      return {
        id:              adminPkg.id,
        name,
        price:           Number(comments.price),
        rate_limit:      match?.['rate-limit']       || '',
        session_timeout: match?.['session-timeout']  || '',
        theme:           comments.theme,
        status:          comments.status,
        quota_value:     comments.quota_value ? Number(comments.quota_value) : undefined,
        quota_unit:      comments.quota_unit,
        type:            comments.type,
      };
    });

    renderPackages(packages);
  } catch (err) {
    console.error(err);
    document.getElementById('packs').innerHTML = '<div class="small">Could not load packages.</div>';
  }
}

function getDescription(p) {
  const quotaLabel = p.quota_unit !== 'unlimited'
    ? `${p.quota_value} ${p.quota_unit.toUpperCase()}B`
    : 'Unlimited Data';

  const durationLabel = p.session_timeout
    ? p.session_timeout.replace('h', ' Hour').replace('d', ' Day').replace('m', ' Minutes')
    : 'No Expiry';

  return { quotaLabel, durationLabel };
}

function renderPackages(packs) {
  const container = el('#packs');
  container.innerHTML = '';
  packs.forEach((p) => {
    const div = document.createElement('div');
    div.className = 'package-card';
    // Leave --tab-color unset when the package has no custom theme so the
    // CSS default (a graffiti-style multi-color strip) shows through,
    // instead of every untethemed package flattening to the same blue.
    if (p.theme) div.style.setProperty('--tab-color', p.theme);
    const { quotaLabel, durationLabel } = getDescription(p);

    div.innerHTML = `
      <h3 class="package-name">${escapeHtml(p.name)}</h3>
      <div class="package-details">${quotaLabel} • ${durationLabel}</div>
      <div class="package-price"><span class="package-price-currency">${currency || 'KES'}</span> ${p.price}</div>
      <div class="package-actions">
        <button class="btn" data-id="${p.id}">Buy Now</button>
      </div>
    `;
    container.appendChild(div);
  });
  container.querySelectorAll('.btn').forEach((b) => b.addEventListener('click', onBuyClick));
}

// ─────────────────────────────────────────────────────────────────────────────
// BUY FLOW  (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
let selectedPackage = null;

function onBuyClick(e) {
  const id = e.currentTarget.dataset.id;
  selectedPackage = packages.find((x) => x.id == id);
  if (!selectedPackage) return alert('Package not found');
  const { quotaLabel, durationLabel } = getDescription(selectedPackage);
  el('#modal-title').textContent  = `Buy ${selectedPackage.name}`;
  el('#modal-desc').textContent   = `${quotaLabel} • ${durationLabel}`;
  el('#modal-price').textContent  = `${currency || 'KES'} ${selectedPackage.price_display || selectedPackage.price}`;
  show(el('#modal'));
}

document.addEventListener('click', (ev) => {
  if (ev.target.matches('.modal-close') || ev.target.matches('.modal')) {
    hide(el('#modal'));
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT SUBMIT  (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener('submit', async (ev) => {
  if (ev.target.id !== 'pay-form') return;
  ev.preventDefault();
  if (!selectedPackage) return;

  const { durationLabel } = getDescription(selectedPackage);
  const phone = el('#phone').value.trim();
  if (!phone) { alert('Enter phone number'); return; }

  el('#pay-submit').disabled    = true;
  el('#pay-submit').textContent = 'Processing...';

  try {
    const resp = await fetch(config.payEndpoint, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        admin_id:          admin_id,
        router_id:         router_id,
        profile_type:      selectedPackage.type,
        profile_name:      selectedPackage.name,
        customer_number:   phone,
        price:             selectedPackage.price,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Payment failed');

    let attempts = 0;
    const maxAttempts = 10;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(interval);
        console.log('Stopped polling: maximum attempts reached.');
        return;
      }
      try {
        const statusResp = await fetch(`${config.statusEndpoint}/${data.CheckoutRequestID}`);
        const statusData = await statusResp.json();
        if (statusData.status === 'found') {
          clearInterval(interval);
          console.log('Payment confirmed:', statusData.payment.mpesa_receipt);
          showVoucher(statusData.payment.mpesa_receipt, durationLabel);
          hide(el('#modal'));
        } else {
          console.log(`Payment pending… (attempt ${attempts})`);
        }
      } catch (err) {
        console.error('Error polling payment status:', err);
      }
    }, 3500);

  } catch (err) {
    alert('Payment failed: ' + err.message);
    console.error(err);
  } finally {
    el('#pay-submit').disabled    = false;
    el('#pay-submit').textContent = 'Pay';
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SHOW VOUCHER + AUTO-LOGIN  (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
function showVoucher(receiptNo, duration) {
  el('#voucher-code').textContent   = receiptNo || 'N/A';
  el('#voucher-expiry').textContent = duration;
  show(el('#voucher-card'));

  if (receiptNo) {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = config.linkLoginOnly;
    form.style.display = 'none';

    const u   = document.createElement('input'); u.name = 'username'; u.value = receiptNo;
    const p   = document.createElement('input'); p.name = 'password'; p.value = chapHash(receiptNo);
    const dst = document.createElement('input'); dst.name = 'dst';    dst.value = '$(link-orig)';
    form.appendChild(u); form.appendChild(p); form.appendChild(dst);
    document.body.appendChild(form);

    setTimeout(() => form.submit(), 3000);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AD FLOW — FREE WIFI
// ─────────────────────────────────────────────────────────────────────────────

/** Read the device MAC injected by MikroTik as a URL query param */
function getMac() {
  const params = new URLSearchParams(window.location.search);
  const queryMac = params.get('mac') || params.get('mac_address');
  const injectedMac = window._hotspotMac;
  // Outside MikroTik (for example local file development), the template
  // token remains literally "$(mac)". Never send that or a shared all-zero
  // fallback to the tracking API because it merges every device's limits.
  if (queryMac) return queryMac;
  if (injectedMac && injectedMac !== '$(mac)') return injectedMac;
  return null;
}

/** Random hex password for the throwaway hotspot user */
function randomPass(len = 12) {
  return Array.from(crypto.getRandomValues(new Uint8Array(len)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, len);
}

// Ad-flow state
let _adData    = null;   // object returned by GET /captive/ad
let _adTimer   = null;
let _adElapsed = 0;
const IMAGE_AD_SECONDS = 7;
let _adTotal   = IMAGE_AD_SECONDS;
let _adUser    = null;  // { username, password } for MikroTik login
let _adClaiming = false;

/** Switch the inline ad-card step */
function adShowStep(id) {
  document.querySelectorAll('.ad-step').forEach((s) => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

/** Reset to the start step */
function adFlowReset() {
  adShowStep('ad-step-start');
}
window.adFlowReset = adFlowReset;

/** Show an inline error */
function adShowError(msg) {
  const msgEl = document.getElementById('ad-error-msg');
  if (msgEl) msgEl.textContent = msg;
  adShowStep('ad-step-error');
}

// ── Step 1: user taps "Watch ad" ──────────────────────────────────────────────
async function adFlowStart() {
  adShowStep('ad-step-loading');
  const mac = getMac();
  if (!mac) {
    adShowError('This device could not be identified by the hotspot. Reload the login page and try again.');
    return;
  }

  let ad;
  try {
    const res = await fetch(`${config.captiveApiBase}/ad?mac_address=${encodeURIComponent(mac)}`);
    if (res.status === 404) {
      adShowError('No ads available right now. Please use a voucher or try again later.');
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    ad = await res.json();
  } catch (e) {
    adShowError('Could not load an ad. Check your connection and try again.');
    return;
  }

  _adData  = ad;
  _adTotal = IMAGE_AD_SECONDS;

  // Populate the modal media
  const img = document.getElementById('ad-img');
  const vid = document.getElementById('ad-vid');
  const isVideo = ad.media_content_type?.startsWith('video/')
    || /\.(mp4|webm)(\?|$)/i.test(ad.media_url);

  clearInterval(_adTimer);
  img.onload = null;
  img.onerror = null;
  vid.onloadedmetadata = null;
  vid.onerror = null;
  vid.pause();
  vid.removeAttribute('src');
  vid.load();

  if (isVideo) {
    vid.style.display = 'block';
    vid.controls = true;
    img.style.display = 'none';
    vid.onloadedmetadata = () => {
      _adTotal = Number.isFinite(vid.duration) && vid.duration > 0
        ? Math.ceil(vid.duration)
        : 30;
      document.getElementById('ad-countdown-text').textContent = _adTotal;
      document.getElementById('ad-claim-btn').textContent = `Watching… ${_adTotal}s remaining`;
      vid.play().catch(() => {});
      _adStartCountdown(_adTotal, vid);
    };
    vid.onerror = () => {
      hide(document.getElementById('ad-modal'));
      adShowError('This video could not be loaded. Please try another ad.');
    };
    vid.src = ad.media_url;
    vid.load();
  } else {
    img.style.display = 'block';
    vid.style.display = 'none';
    img.onload = () => _adStartCountdown(IMAGE_AD_SECONDS);
    img.onerror = () => {
      hide(document.getElementById('ad-modal'));
      adShowError('This image could not be loaded. Please try another ad.');
    };
    img.src = ad.media_url;
  }

  // The fetch already recorded an impression. X is the only dismissal path;
  // backdrop clicks do not close this modal and therefore cannot accidentally
  // masquerade as a redemption.
  const closeBtn = document.getElementById('ad-modal-close');
  closeBtn.style.opacity       = '1';
  closeBtn.style.pointerEvents = 'auto';

  // Reset claim button
  const claimBtn = document.getElementById('ad-claim-btn');
  claimBtn.disabled    = true;
  claimBtn.textContent = `Watching… ${_adTotal}s remaining`;

  // Reset progress
  document.getElementById('ad-progress-fill').style.width = '0%';
  document.getElementById('ad-countdown-text').textContent = _adTotal;
  document.getElementById('ad-claiming-msg').style.display = 'none';

  // Show the modal
  show(document.getElementById('ad-modal'));

}
window.adFlowStart = adFlowStart;

// Countdown timer running inside the modal
function _adStartCountdown(totalSecs, mediaElement = null) {
  _adElapsed = 0;
  clearInterval(_adTimer);

  const fill      = document.getElementById('ad-progress-fill');
  const cdText    = document.getElementById('ad-countdown-text');
  const claimBtn  = document.getElementById('ad-claim-btn');

  _adTimer = setInterval(() => {
    // A video only earns watch time while it is actually playing in the
    // foreground. Images remain a short, fixed seven-second exposure.
    if (mediaElement && (mediaElement.paused || document.hidden)) return;
    _adElapsed++;
    const pct = (_adElapsed / totalSecs) * 100;
    fill.style.width   = pct.toFixed(1) + '%';
    cdText.textContent = Math.max(0, totalSecs - _adElapsed);
    claimBtn.textContent = `Watching… ${Math.max(0, totalSecs - _adElapsed)}s remaining`;

    if (_adElapsed >= totalSecs) {
      clearInterval(_adTimer);
      claimBtn.textContent = 'Activating free WiFi…';
      void adFlowClaim();
    }
  }, 1000);
}

// Close the ad modal (only reachable after countdown unlocks the button)
function adModalClose() {
  if (_adClaiming) return;
  clearInterval(_adTimer);
  document.getElementById('ad-vid').pause();
  hide(document.getElementById('ad-modal'));
  adFlowReset();
}
window.adModalClose = adModalClose;

// ── Step 2: user taps "Claim free WiFi" ──────────────────────────────────────
async function adFlowClaim() {
  if (_adClaiming || !_adData) return;
  _adClaiming = true;
  const claimBtn  = document.getElementById('ad-claim-btn');
  const claimMsg  = document.getElementById('ad-claiming-msg');
  claimBtn.disabled    = true;
  claimBtn.textContent = 'Activating…';
  claimMsg.style.display = 'block';

  const mac = getMac();
  if (!mac) {
    _adClaiming = false;
    adShowError('This device could not be identified by the hotspot. Reload the login page and try again.');
    return;
  }

  // 2a. Redeem with captive API
  let redeemData;
  try {
    const res = await fetch(`${config.captiveApiBase}/redeem`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ad_id:                 _adData.id,
        mac_address:           mac,
        media_watched_seconds: _adElapsed,
        country_code:          navigator.language?.split('-')[1] || null,
        router_id:              config.hotspotRouterId,
      }),
    });
    if (res.status === 429) {
      hide(document.getElementById('ad-modal'));
      adShowStep('ad-step-used');
      _adClaiming = false;
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    redeemData = await res.json();
  } catch (e) {
    hide(document.getElementById('ad-modal'));
    adShowError('Redemption failed. Please try again or ask an attendant for a voucher.');
    _adClaiming = false;
    return;
  }

  const rewardMinutes = redeemData.reward_minutes || _adData.reward_minutes || 30;
  _adUser = { username: redeemData.username, password: redeemData.password };
  if (!_adUser.username || !_adUser.password) {
    hide(document.getElementById('ad-modal'));
    adShowError('The reward was recorded but no login credentials were returned. Please ask an attendant for help.');
    _adClaiming = false;
    return;
  }

  // 2c. Close modal, show success card
  hide(document.getElementById('ad-modal'));
  document.getElementById('ad-reward-text').textContent =
    `${rewardMinutes} minute${rewardMinutes !== 1 ? 's' : ''} of free`;
  adShowStep('ad-step-done');

  // 2d. Auto-login via MikroTik hotspot form (3 s delay so user sees the success state)
  setTimeout(() => _adAutoLogin(), 3000);
}
window.adFlowClaim = adFlowClaim;

/** Programmatically POST to MikroTik's $(link-login-only) endpoint */
function _adAutoLogin() {
  if (!_adUser) return;
  const nativeLoginUrl = document.forms.login?.action;
  const isResolvedHotspotUrl = (value) =>
    Boolean(value && !value.includes('$(') && /^https?:\/\//i.test(value));
  const loginUrl = isResolvedHotspotUrl(nativeLoginUrl)
    ? nativeLoginUrl
    : config.linkLoginOnly;

  if (!isResolvedHotspotUrl(loginUrl)) {
    _adClaiming = false;
    adShowError('Free WiFi was activated, but the router login address is unavailable. Reload the portal and sign in again.');
    return;
  }

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = loginUrl;
  form.style.display = 'none';

  const fields = {
    username: _adUser.username,
    password: chapHash(_adUser.password),
    // RouterOS follows this only after accepting the reward credentials, so
    // advertisers do not need to be added to the pre-auth walled garden.
    dst: getPostRedemptionDestination(_adData?.cta_url),
  };
  for (const [k, v] of Object.entries(fields)) {
    const inp = document.createElement('input');
    inp.name  = k;
    inp.value = v;
    form.appendChild(inp);
  }
  document.body.appendChild(form);
  form.submit();
}

// ─────────────────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadPackages();
});
