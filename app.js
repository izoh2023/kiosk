import { admin_id, logo_filename } from "./config.js";

// ----------------- configuration  -----------------
const config = {
  packagesEndpoint: `http://localhost:4000/api/package?kiosk`,
  adminPackageEndpoint: `http://localhost:5000/api/package?admin=${admin_id}&kiosk`,
  payEndpoint: 'https://93a64da0a7c2.ngrok-free.app/api/payment',
  statusEndpoint: 'http://localhost:5000/payment-status',
  // When backend returns voucher, it should include username/password to log into $(link-login-only)
  // MikroTik variable for login action:
  linkLoginOnly: '$(link-login-only)'  // MikroTik will replace this string server-side]

};

// branding
const logoEl = document.querySelector('.logo');
logoEl.style.background = `url('${logo_filename}') center / cover no-repeat`;

// ----------------- helper -----------------
function el(q,root=document){return root.querySelector(q)}
function show(elm){elm.classList.add('show')}
function hide(elm){elm.classList.remove('show')}


// ----------------- package rendering -----------------
let packages = null

async function loadPackages(){
  try{
    const [adminRes, routerRes] = await Promise.all([
        fetch(config.adminPackageEndpoint), // Admin DB data
        fetch(config.packagesEndpoint), // RouterOS profiles
      ]);
    if(!adminRes.ok || !routerRes.ok) throw new Error('Failed to load packages');
    
    const adminData = await adminRes.json();
    const routerData = await routerRes.json();

    const adminPackages = adminData;
    const routerProfiles = routerData.profiles;
    
    packages = adminPackages.map((adminPkg) => {
        const match = routerProfiles.find(
          (routerPkg) =>routerPkg.name === adminPkg.name);

        return {
          id: adminPkg.id,
          name: adminPkg.name,
          price: Number(adminPkg.price),
          rate_limit: match?.["rate-limit"] || "",
          session_timeout: match?.["session-timeout"] || "",
          theme: adminPkg.theme,
          status: adminPkg.status,
          quota_value: adminPkg.quota_value
            ? Number(adminPkg.quota_value)
            : undefined,
          quota_unit: adminPkg.quota_unit,
          type: adminPkg.type
        };
    });

    renderPackages(packages);
  }catch(err){
    console.error(err);
    document.getElementById('packs').innerHTML = '<div class="small">Could not load packages.</div>';
  }
}

function getDescription(p){
  const quotaLabel = p.quota_unit !== "unlimited"
    ? `${p.quota_value} ${p.quota_unit.toUpperCase()}`
    : 'Unlimited Data';

  const durationLabel = p.session_timeout
    ? p.session_timeout.replace('h', ' Hour').replace('d', ' Day').replace('m', 'Minutes')
    : 'No Expiry';

    return {
      quotaLabel,
      durationLabel
    }


}

function renderPackages(packs){
  const container = el('#packs');
  container.innerHTML = '';
  packs.forEach(p=>{
    const div = document.createElement('div');
      div.className = 'package-card';
      div.style.setProperty('--tab-color', p.theme || '#2196F3');
      const {quotaLabel, durationLabel} = getDescription(p)

      div.innerHTML = `
          <h3 class="package-name">${escapeHtml(p.name)}</h3>
          <div class="package-details">${quotaLabel} • ${durationLabel}</div>
          <div class="package-price">${p.price}</div>
          <div class="package-actions">
              <button class="btn" data-id="${p.id}">Buy Now</button>
          </div>
      `;

    container.appendChild(div);
  });
  container.querySelectorAll('.btn').forEach(b=>{
    b.addEventListener('click', onBuyClick);
  });
}

// ----------------- buy flow -----------------
let selectedPackage = null;

function onBuyClick(e){
  const id = e.currentTarget.dataset.id;
  // find package
  selectedPackage = packages.find(x=>x.id==id);
  if(!selectedPackage) return alert('Package not found');
  const {quotaLabel, durationLabel} = getDescription(selectedPackage)
  el('#modal-title').textContent = `Buy ${selectedPackage.name}`;
  el('#modal-desc').textContent = `${quotaLabel} • ${durationLabel}` || '';
  el('#modal-price').textContent = selectedPackage.price_display || selectedPackage.price;
  show(el('#modal'));
}

document.addEventListener('click', (ev) => {
  if (ev.target.matches('.modal-close') || ev.target.matches('.modal')) {
    hide(el('#modal'));
  }
});
// ----------------- payment submit -----------------
document.addEventListener('submit', async (ev) => {
  if(ev.target.id !== 'pay-form') return;
  ev.preventDefault();
  if(!selectedPackage) return;
  const {durationLabel} = getDescription(selectedPackage)
  const phone = el('#phone').value.trim();
  if(!phone) { alert('Enter phone number'); return; }
  el('#pay-submit').disabled = true;
  el('#pay-submit').textContent = 'Processing...';

  try{
    const resp = await fetch(config.payEndpoint, {
      method:'POST',
      headers:{'content-type':'application/json'},
      body: JSON.stringify({
        admin_id: admin_id,
        profile_type: selectedPackage.type,
        profile_name: selectedPackage.name,
        payment_method_id: 'b2683f45-ac72-453a-8601-8e739b4a196f',
        customer_number: phone,
        price: selectedPackage.price
      })
    });
    const data = await resp.json(); // parse response first
    if(!resp.ok) throw new Error(data.error || 'Payment failed');
    console.log(data)

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
          clearInterval(interval); // stop polling
          console.log('Payment confirmed:', statusData.payment.mpesa_receipt);
          showVoucher(statusData.payment.mpesa_receipt, durationLabel);
          hide(el('#modal'));
        } else {
          console.log(`Payment pending... (attempt ${attempts})`);
        }
      } catch (err) {
        console.error('Error polling payment status:', err);
      }
    }, 3500);


  }catch(err){
    alert('Payment failed: '+err.message);
    console.error(err);
  }finally{
    el('#pay-submit').disabled = false;
    el('#pay-submit').textContent = 'Pay';
  }
});

// ----------------- show voucher and auto-login -----------------
function showVoucher(receiptNo,duration){
  el('#voucher-code').textContent = receiptNo || 'N/A';
  el('#voucher-expiry').textContent = duration;
  show(el('#voucher-card'));

  // Auto-login: fill microsurf login form and POST to $(link-login-only)
  // Create a form and post to the MikroTik login endpoint (MikroTik substitutes $(link-login-only))
  if(receiptNo){
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = config.linkLoginOnly;
    form.style.display = 'none';

    const u = document.createElement('input'); u.name='username'; u.value = receiptNo;
    const p = document.createElement('input'); p.name='password'; p.value = receiptNo;
    const dst = document.createElement('input'); dst.name='dst'; dst.value = '$(link-orig)';
    form.appendChild(u); form.appendChild(p); form.appendChild(dst);
    document.body.appendChild(form);

    // small delay so the voucher is visible
    setTimeout(()=>form.submit(), 3000);
  }
}

// ----------------- util
function escapeHtml(s){ if(!s) return ''; return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }


// ----------------- initial load
document.addEventListener('DOMContentLoaded', ()=> {
  loadPackages();
});
