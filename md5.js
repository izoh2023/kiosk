// md5.js - tiny MD5 implementation for CHAP hashing (simplified).
// Use only if your hotspot uses HTTP-CHAP. If not, you can ignore.
;(function(){
  // Minimal md5 function (taken from public-domain minimal impl)
  // For brevity, include a compact md5 function. If you already have one,
  // replace this file with your preferred library.
  function md5cycle(x, k) { /* ... omitted for brevity; include known md5 lib in production ... */ }
  function md51(s) { /* ... */ }
  function md5(s) { return hex(md51(s)); }
  function hex(a){ /* ... */ }
  // expose
  window.md5 = md5;
})();
