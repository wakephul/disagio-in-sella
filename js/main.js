/* ============ shared behaviour ============ */
(function () {
  // ---- hamburger menu ----
  const burger = document.querySelector('.burger');
  const body = document.body;
  if (burger) {
    burger.addEventListener('click', () => {
      body.classList.toggle('menu-open');
      const open = body.classList.contains('menu-open');
      burger.setAttribute('aria-expanded', open);
      body.style.overflow = open ? 'hidden' : '';
    });
    document.querySelectorAll('.menu a').forEach(a =>
      a.addEventListener('click', () => {
        body.classList.remove('menu-open');
        body.style.overflow = '';
      })
    );
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && body.classList.contains('menu-open')) burger.click();
    });
  }

  // ---- footer year ----
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  // ---- reveal on scroll ----
  const io = new IntersectionObserver(
    entries => entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    }),
    { threshold: 0.12 }
  );
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
})();

/* ============ shared GPX + map helpers (window.DIS) ============ */
window.DIS = (function () {
  const TILES = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
  const ATTR = '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> &copy; <a href="https://carto.com">CARTO</a>';

  function makeMap(el, opts = {}) {
    const map = L.map(el, { scrollWheelZoom: false, ...opts });
    L.tileLayer(TILES, { attribution: ATTR, maxZoom: 19 }).addTo(map);
    map.on('focus', () => map.scrollWheelZoom.enable());
    map.on('blur', () => map.scrollWheelZoom.disable());
    return map;
  }

  // build a GPX (track) string from [[lat,lon],...]
  function buildGpx(coords, name) {
    const pts = coords.map(c => `      <trkpt lat="${c[0]}" lon="${c[1]}"></trkpt>`).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Disagio in Sella" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${escapeXml(name)}</name></metadata>
  <trk><name>${escapeXml(name)}</name><trkseg>
${pts}
  </trkseg></trk>
</gpx>`;
  }

  function escapeXml(s) {
    return String(s).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
  }

  function downloadText(filename, text, mime = 'application/gpx+xml') {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  // haversine length (km) of a [[lat,lon],...] line
  function lengthKm(coords) {
    let d = 0;
    for (let i = 1; i < coords.length; i++) {
      const [la1, lo1] = coords[i - 1], [la2, lo2] = coords[i];
      const R = 6371, dLa = (la2 - la1) * Math.PI / 180, dLo = (lo2 - lo1) * Math.PI / 180;
      const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
      d += 2 * R * Math.asin(Math.sqrt(a));
    }
    return d;
  }

  return { makeMap, buildGpx, downloadText, lengthKm, TILES, ATTR };
})();
