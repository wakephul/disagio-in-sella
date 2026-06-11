/* ============================================================
   VIA FRANCIGENA — full map · accommodations · GPX generator
   ============================================================ */

/* representative Italian route, Gran San Bernardo -> Roma [lat,lon] */
const VF_ROUTE = [
  [45.8693,7.1707],[45.7350,7.3136],[45.4677,7.8757],[45.3686,8.1737],[45.3201,8.4188],
  [45.2503,8.7378],[45.1847,9.1582],[45.0526,9.6929],[44.8667,10.0608],[44.6906,10.0987],
  [44.4565,9.9272],[44.3760,9.8800],[44.2100,9.9700],[43.8430,10.5020],[43.6797,10.8503],
  [43.4682,11.0431],[43.3188,11.3308],[43.0583,11.6049],[42.7430,11.8650],[42.6433,11.9858],
  [42.4175,12.1057],[42.2433,12.2208],[42.0167,12.4000],[41.9022,12.4539]
];
const VF_TAPPE = [
  [45.8693,7.1707,'Gran San Bernardo'],[45.7350,7.3136,'Aosta'],[45.3201,8.4188,'Vercelli'],
  [45.1847,9.1582,'Pavia'],[45.0526,9.6929,'Piacenza'],[44.4565,9.9272,'Passo della Cisa'],
  [43.8430,10.5020,'Lucca'],[43.4682,11.0431,'San Gimignano'],[43.3188,11.3308,'Siena'],
  [42.4175,12.1057,'Viterbo'],[41.9022,12.4539,'Roma']
];

/* ---------- 1 · FULL MAP ---------- */
(function fullMap() {
  const el = document.getElementById('vf-fullmap');
  if (!el) return;
  const map = DIS.makeMap(el);
  const line = L.polyline(VF_ROUTE, { color: '#e8643c', weight: 4, opacity: .95 }).addTo(map);
  L.polyline(VF_ROUTE, { color: '#e8643c', weight: 14, opacity: .12 }).addTo(map);
  VF_TAPPE.forEach(([la, lo, name]) =>
    L.circleMarker([la, lo], { radius: 6, color: '#14110d', weight: 2, fillColor: '#93a06a', fillOpacity: 1 })
      .addTo(map).bindPopup(`<b>${name}</b>`));
  map.fitBounds(line.getBounds().pad(0.08));
})();

/* ---------- shared accommodations load ---------- */
const accReady = fetch('data/accommodations.json').then(r => r.json()).then(j => j.places).catch(() => []);

/* ---------- 2 · ACCOMMODATIONS FINDER ---------- */
accReady.then(places => {
  const grid = document.getElementById('acc-grid');
  if (!grid) return;
  const $search = document.getElementById('acc-search');
  const $state = document.getElementById('acc-state');
  const $region = document.getElementById('acc-region');
  const $city = document.getElementById('acc-city');
  const $count = document.getElementById('acc-count');

  const uniq = (arr) => [...new Set(arr)].sort((a, b) => a.localeCompare(b, 'it'));
  function fillSelect(sel, values, keepFirst) {
    const cur = sel.value;
    sel.innerHTML = keepFirst + values.map(v => `<option value="${v}">${v}</option>`).join('');
    if (values.includes(cur)) sel.value = cur;
  }
  fillSelect($state, uniq(places.map(p => p.country)), '<option value="">Tutti</option>');
  fillSelect($region, uniq(places.map(p => p.region)), '<option value="">Tutte</option>');
  fillSelect($city, uniq(places.map(p => p.city)), '<option value="">Tutte</option>');

  function refreshDependents() {
    // cascade region/city options based on chosen state/region
    const byState = places.filter(p => !$state.value || p.country === $state.value);
    fillSelect($region, uniq(byState.map(p => p.region)), '<option value="">Tutte</option>');
    const byRegion = byState.filter(p => !$region.value || p.region === $region.value);
    fillSelect($city, uniq(byRegion.map(p => p.city)), '<option value="">Tutte</option>');
  }

  function render() {
    const q = $search.value.trim().toLowerCase();
    const list = places.filter(p =>
      (!$state.value || p.country === $state.value) &&
      (!$region.value || p.region === $region.value) &&
      (!$city.value || p.city === $city.value) &&
      (!q || `${p.name} ${p.city} ${p.region} ${p.country} ${p.address} ${p.type}`.toLowerCase().includes(q))
    );
    $count.innerHTML = `<b>${list.length}</b> accoglienz${list.length === 1 ? 'a' : 'e'} su ${places.length}`;
    grid.innerHTML = list.length ? list.map(p => `
      <article class="acc-card">
        <h4>${p.name}</h4>
        <p class="where">${p.city} · ${p.region} · ${p.country}</p>
        <div class="meta"><span class="tag coral">${p.type}</span></div>
        <p class="addr">${p.address}</p>
        <div class="links">
          <a href="https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=16/${p.lat}/${p.lon}" target="_blank" rel="noopener">📍 Mappa</a>
          ${p.phone ? `<a href="tel:${p.phone.replace(/\s/g, '')}">☎ ${p.phone}</a>` : ''}
        </div>
      </article>`).join('')
      : '<p class="acc-empty">Nessuna accoglienza trovata. Allarga la ricerca.</p>';
  }

  [$state, $region].forEach(s => s.addEventListener('change', () => { refreshDependents(); render(); }));
  $city.addEventListener('change', render);
  $search.addEventListener('input', render);
  render();
});

/* ---------- 3 · GPX GENERATOR ---------- */
accReady.then(places => {
  const goBtn = document.getElementById('gpx-go');
  if (!goBtn) return;
  const dlBtn = document.getElementById('gpx-dl');
  const status = document.getElementById('gpx-status');
  const info = document.getElementById('gpx-info');
  const distEl = document.getElementById('gpx-dist');
  const ptsEl = document.getElementById('gpx-pts');

  const state = { start: { type: 'station' }, end: { type: 'station' } };
  let lastGpx = null, lastName = '';

  // populate hostel selects
  const hostelOpts = places.filter(p => p.country === 'Italia')
    .map((p, i) => `<option value="${i}">${p.name} — ${p.city}</option>`).join('');
  ['start', 'end'].forEach(leg => {
    document.getElementById(leg + '-hostel').innerHTML = '<option value="">Seleziona…</option>' + hostelOpts;
  });
  const itHostels = places.filter(p => p.country === 'Italia');

  // segmented controls (station / hostel)
  document.querySelectorAll('.seg').forEach(seg => {
    const leg = seg.dataset.leg;
    seg.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      seg.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
      state[leg].type = b.dataset.type;
      document.querySelector(`[data-input="${leg}-station"]`).hidden = b.dataset.type !== 'station';
      document.querySelector(`[data-input="${leg}-hostel"]`).hidden = b.dataset.type !== 'hostel';
    });
  });

  // map
  const map = DIS.makeMap(document.getElementById('gpx-map'));
  map.setView([43.3, 11.3], 6);
  let routeLayer = null, markers = [];

  function setStatus(msg, cls = '') { status.className = 'gpx-status ' + cls; status.innerHTML = msg; }

  async function geocode(query) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=it,ch,fr,gb&q=${encodeURIComponent(query)}`;
    const r = await fetch(url, { headers: { 'Accept-Language': 'it' } });
    const j = await r.json();
    if (!j.length) return null;
    return { lat: +j[0].lat, lon: +j[0].lon, label: j[0].display_name.split(',').slice(0, 2).join(',') };
  }

  // OSM tags rail stops in English; that form is far more accurate than "Stazione di X"
  async function geocodeStation(city) {
    const hit = await geocode(`${city} railway station`) || await geocode(`Stazione di ${city}, ${city}`);
    if (!hit) throw new Error(`Stazione non trovata per “${city}”. Controlla il nome della città.`);
    hit.label = `Stazione di ${city}`;
    return hit;
  }

  // resolve one endpoint -> {lat,lon,label}
  async function resolve(leg) {
    const t = state[leg].type;
    if (t === 'station') {
      const city = document.getElementById(leg + '-city').value.trim();
      if (!city) throw new Error(`Inserisci la città della stazione di ${leg === 'start' ? 'partenza' : 'arrivo'}.`);
      return await geocodeStation(city);
    } else {
      const idx = document.getElementById(leg + '-hostel').value;
      if (idx === '') throw new Error(`Scegli l'accoglienza di ${leg === 'start' ? 'partenza' : 'arrivo'}.`);
      const p = itHostels[+idx];
      // prefer known coords; fall back to geocoding the address
      if (p.lat && p.lon) return { lat: p.lat, lon: p.lon, label: `${p.name}, ${p.city}` };
      const hit = await geocode(`${p.address}, ${p.city}`);
      if (!hit) throw new Error(`Indirizzo non trovato per ${p.name}.`);
      return hit;
    }
  }

  async function brouter(a, b) {
    const lonlats = `${a.lon},${a.lat}|${b.lon},${b.lat}`;
    const url = `https://brouter.de/brouter?lonlats=${lonlats}&profile=trekking&alternativeidx=0&format=gpx`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('BRouter non ha trovato una rotta ciclabile fra i due punti.');
    return await r.text();
  }

  function parseGpx(xml) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const nodes = [...doc.getElementsByTagName('trkpt')];
    return nodes.map(n => [parseFloat(n.getAttribute('lat')), parseFloat(n.getAttribute('lon'))]);
  }

  function draw(coords, a, b) {
    if (routeLayer) map.removeLayer(routeLayer);
    markers.forEach(m => map.removeLayer(m)); markers = [];
    L.polyline(coords, { color: '#e8643c', weight: 13, opacity: .14 }).addTo(map);
    routeLayer = L.polyline(coords, { color: '#e8643c', weight: 4.5, opacity: 1 }).addTo(map);
    markers.push(L.circleMarker([a.lat, a.lon], { radius: 8, color: '#fff', weight: 2, fillColor: '#93a06a', fillOpacity: 1 })
      .addTo(map).bindPopup(`<b>A · Partenza</b><br>${a.label}`));
    markers.push(L.circleMarker([b.lat, b.lon], { radius: 8, color: '#fff', weight: 2, fillColor: '#e8643c', fillOpacity: 1 })
      .addTo(map).bindPopup(`<b>B · Arrivo</b><br>${b.label}`));
    map.fitBounds(routeLayer.getBounds().pad(0.12));
  }

  goBtn.addEventListener('click', async () => {
    try {
      goBtn.disabled = true;
      setStatus('<span class="spinner"></span> Cerco gli indirizzi…');
      const a = await resolve('start');
      const b = await resolve('end');
      setStatus('<span class="spinner"></span> Calcolo la rotta ciclabile (BRouter)…');
      const gpx = await brouter(a, b);
      const coords = parseGpx(gpx);
      if (coords.length < 2) throw new Error('Rotta vuota: prova punti più vicini al tracciato.');
      draw(coords, a, b);
      lastGpx = gpx;
      lastName = `francigena_${slug(a.label)}-${slug(b.label)}`;
      distEl.textContent = DIS.lengthKm(coords).toFixed(1);
      ptsEl.textContent = coords.length;
      info.hidden = false;
      dlBtn.disabled = false; dlBtn.style.opacity = 1;
      setStatus(`Rotta pronta: <b>${a.label}</b> → <b>${b.label}</b>. Scaricala in GPX.`, 'ok');
    } catch (err) {
      setStatus('⚠ ' + err.message, 'err');
    } finally {
      goBtn.disabled = false;
    }
  });

  dlBtn.addEventListener('click', () => {
    if (!lastGpx) return;
    DIS.downloadText(lastName + '.gpx', lastGpx);
  });

  function slug(s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 24); }
});
