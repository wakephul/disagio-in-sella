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
/* ---------- shared routing / geocoding helpers ---------- */
const VF = (function () {
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'").trim();
  const slug = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 28);

  function haversine(la1, lo1, la2, lo2) {
    const R = 6371, dLa = (la2 - la1) * Math.PI / 180, dLo = (lo2 - lo1) * Math.PI / 180;
    const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  async function geocode(query) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=it,ch,fr,gb&q=${encodeURIComponent(query)}`;
    const r = await fetch(url, { headers: { 'Accept-Language': 'it' } });
    const j = await r.json();
    if (!j.length) return null;
    return { lat: +j[0].lat, lon: +j[0].lon, label: j[0].display_name.split(',').slice(0, 2).join(',') };
  }
  // OSM tags rail stops in English → far more accurate than "Stazione di X"
  async function geocodeStation(city) {
    const hit = await geocode(`${city} railway station`) || await geocode(`Stazione di ${city}, ${city}`);
    if (!hit) throw new Error(`Stazione non trovata per “${city}”.`);
    return { lat: hit.lat, lon: hit.lon, label: `Stazione di ${city}` };
  }
  // accType: 'both' | 'pellegrina' | 'turistica'
  function filterByAccType(places, accType) {
    if (!accType || accType === 'both') return places;
    return places.filter(p => p.type.toLowerCase().includes(accType));
  }
  async function resolveHostel(places, city, accType) {
    const pool = filterByAccType(places, accType);
    const want = norm(city);
    let inCity = pool.filter(p => norm(p.city) === want);
    if (!inCity.length) inCity = pool.filter(p => norm(p.city).includes(want) && want.length > 3);
    if (inCity.length) {
      const p = inCity.sort((a, b) => (a.type.includes('pellegrina') ? -1 : 1) - (b.type.includes('pellegrina') ? -1 : 1))[0];
      return { lat: p.lat, lon: p.lon, label: `${p.name}, ${p.city}`, hostel: p };
    }
    const c = await geocode(`${city}, Italia`);
    if (!c) throw new Error(`Città “${city}” non trovata e nessuna accoglienza con quel nome.`);
    let best = null, bd = Infinity;
    pool.forEach(p => { const d = haversine(c.lat, c.lon, p.lat, p.lon); if (d < bd) { bd = d; best = p; } });
    if (!best) throw new Error(`Nessuna accoglienza disponibile per il tipo selezionato.`);
    return { lat: best.lat, lon: best.lon, label: `${best.name}, ${best.city}`, hostel: best,
      note: `Nessuna accoglienza a ${city}: scelta la più vicina, ${best.city} (${bd.toFixed(0)} km).` };
  }
  async function resolve(places, type, city, role, accType) {
    if (!city) throw new Error(`Inserisci la città di ${role}.`);
    return type === 'station' ? await geocodeStation(city) : await resolveHostel(places, city, accType);
  }

  async function brouter(a, b) {
    const url = `https://brouter.de/brouter?lonlats=${a.lon},${a.lat}|${b.lon},${b.lat}&profile=trekking&alternativeidx=0&format=gpx`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('BRouter non ha trovato una rotta ciclabile fra i due punti.');
    const xml = await r.text();
    const coords = parseGpx(xml);
    if (coords.length < 2) throw new Error('Rotta vuota: prova punti più vicini al tracciato.');
    return { xml, coords };
  }
  function parseGpx(xml) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    return [...doc.getElementsByTagName('trkpt')].map(n => [+n.getAttribute('lat'), +n.getAttribute('lon')]);
  }

  // cumulative km along a route + project a point onto it → {along, dist}
  function cumulative(route) {
    const cum = [0];
    for (let i = 1; i < route.length; i++) cum[i] = cum[i - 1] + haversine(route[i - 1][0], route[i - 1][1], route[i][0], route[i][1]);
    return cum;
  }
  function project(route, cum, lat, lon) {
    let bd = Infinity, along = 0;
    for (let i = 0; i < route.length; i++) {
      const d = haversine(lat, lon, route[i][0], route[i][1]);
      if (d < bd) { bd = d; along = cum[i]; }
    }
    return { along, dist: bd };
  }
  return { norm, slug, haversine, geocode, geocodeStation, resolve, filterByAccType, brouter, parseGpx, cumulative, project };
})();

/* ---------- blocking loader ---------- */
const Loader = {
  el: () => document.getElementById('loader'),
  show(title, sub) { const l = this.el(); document.getElementById('loader-title').textContent = title; document.getElementById('loader-sub').textContent = sub || ''; l.hidden = false; document.body.style.overflow = 'hidden'; },
  step(sub) { document.getElementById('loader-sub').textContent = sub; },
  hide() { this.el().hidden = true; document.body.style.overflow = ''; }
};

/* segmented station/hostel toggles (shared, all panels) */
const segState = {};
document.querySelectorAll('.seg').forEach(seg => {
  const leg = seg.dataset.leg; segState[leg] = 'station';
  seg.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    seg.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
    segState[leg] = b.dataset.type;
    const isStation = b.dataset.type === 'station';
    const lbl = document.getElementById(leg + '-lbl');
    if (lbl) lbl.textContent = isStation ? 'Città della stazione' : "Città dell'accoglienza";
    const cityInput = seg.parentElement.querySelector('input[type="text"]');
    if (cityInput) cityInput.placeholder = isStation ? 'es. Siena (stazione)' : 'es. Siena (ostello)';
  });
});

/* ---------- 3 · SINGLE GPX GENERATOR ---------- */
accReady.then(places => {
  const goBtn = document.getElementById('gpx-go');
  if (!goBtn) return;
  const dlBtn = document.getElementById('gpx-dl');
  const status = document.getElementById('gpx-status');
  const info = document.getElementById('gpx-info');
  const distEl = document.getElementById('gpx-dist');
  const ptsEl = document.getElementById('gpx-pts');
  let lastGpx = null, lastName = '';

  // city autocomplete datalist
  const cities = [...new Set(places.map(p => p.city))].sort((a, b) => a.localeCompare(b, 'it'));
  const dl = document.getElementById('vf-cities');
  if (dl) dl.innerHTML = cities.map(c => `<option value="${c}">`).join('');

  const map = DIS.makeMap(document.getElementById('gpx-map'));
  map.setView([43.3, 11.3], 6);
  let routeLayer = null, markers = [];
  const setStatus = (m, c = '') => { status.className = 'gpx-status ' + c; status.innerHTML = m; };

  function draw(coords, a, b) {
    if (routeLayer) map.removeLayer(routeLayer);
    markers.forEach(m => map.removeLayer(m)); markers = [];
    L.polyline(coords, { color: '#e8643c', weight: 13, opacity: .14 }).addTo(map);
    routeLayer = L.polyline(coords, { color: '#e8643c', weight: 4.5, opacity: 1 }).addTo(map);
    markers.push(L.circleMarker([a.lat, a.lon], { radius: 8, color: '#fff', weight: 2, fillColor: '#93a06a', fillOpacity: 1 }).addTo(map).bindPopup(`<b>A · Partenza</b><br>${a.label}`));
    markers.push(L.circleMarker([b.lat, b.lon], { radius: 8, color: '#fff', weight: 2, fillColor: '#e8643c', fillOpacity: 1 }).addTo(map).bindPopup(`<b>B · Arrivo</b><br>${b.label}`));
    map.fitBounds(routeLayer.getBounds().pad(0.12));
  }

  goBtn.addEventListener('click', async () => {
    try {
      goBtn.disabled = true;
      const accType = document.getElementById('gpx-acc-type').value;
      setStatus('<span class="spinner"></span> Cerco gli indirizzi…');
      const a = await VF.resolve(places, segState.start, document.getElementById('start-city').value.trim(), 'partenza', accType);
      const b = await VF.resolve(places, segState.end, document.getElementById('end-city').value.trim(), 'arrivo', accType);
      setStatus('<span class="spinner"></span> Calcolo la rotta ciclabile (BRouter)…');
      const { xml, coords } = await VF.brouter(a, b);
      draw(coords, a, b);
      lastGpx = xml; lastName = `francigena_${VF.slug(a.label)}-${VF.slug(b.label)}`;
      distEl.textContent = DIS.lengthKm(coords).toFixed(1); ptsEl.textContent = coords.length; info.hidden = false;
      dlBtn.disabled = false; dlBtn.style.opacity = 1;
      const notes = [a.note, b.note].filter(Boolean).join(' ');
      setStatus(`Rotta pronta: <b>${a.label}</b> → <b>${b.label}</b>.${notes ? ' ' + notes : ''}`, 'ok');
    } catch (err) { setStatus('⚠ ' + err.message, 'err'); }
    finally { goBtn.disabled = false; }
  });
  dlBtn.addEventListener('click', () => lastGpx && DIS.downloadText(lastName + '.gpx', lastGpx));
});

/* ---------- 4 · MULTI-DAY ITINERARY ENGINE ---------- */
accReady.then(places => {
  const goBtn = document.getElementById('t-go');
  if (!goBtn) return;
  const zipBtn = document.getElementById('t-zip');
  const status = document.getElementById('t-status');
  const stagesEl = document.getElementById('t-stages');
  const setStatus = (m, c = '') => { status.className = 'gpx-status ' + c; status.innerHTML = m; };

  const map = DIS.makeMap(document.getElementById('t-map'));
  map.setView([43.3, 11.3], 6);
  let layers = [];
  const clear = () => { layers.forEach(l => map.removeLayer(l)); layers = []; };
  const STAGE_COLORS = ['#e8643c', '#93a06a', '#e6b035', '#f08a64', '#7aa6b0', '#c98a4b'];

  let zipStages = null, zipName = '';

  function pickStops(route, cum, total, n, accType) {
    const pool = VF.filterByAccType(places, accType);
    const buffer = 14;
    const cand = pool.map(p => {
      const pr = VF.project(route, cum, p.lat, p.lon);
      return { p, along: pr.along, dist: pr.dist };
    }).filter(c => c.dist <= buffer).sort((a, b) => a.along - b.along);

    const stops = [];
    let prevAlong = 0;
    for (let k = 1; k < n; k++) {
      const target = total * k / n;
      const minAlong = prevAlong + total / n * 0.45;
      let best = null, bs = Infinity;
      for (const c of cand) {
        if (c.along <= minAlong || c.along >= total - 1) continue;
        if (stops.some(s => VF.norm(s.p.city) === VF.norm(c.p.city))) continue;
        const score = Math.abs(c.along - target) + c.dist * 2.5;
        if (score < bs) { bs = score; best = c; }
      }
      if (best) { stops.push(best); prevAlong = best.along; }
    }
    return stops;
  }

  function renderStages(stages) {
    stagesEl.innerHTML = `<h3 class="stages-title">${stages.length} tappe</h3>` + stages.map((s, i) => `
      <article class="stage-card reveal in" style="--c:${STAGE_COLORS[i % STAGE_COLORS.length]}">
        <div class="stage-day">Giorno ${i + 1}</div>
        <div class="stage-body">
          <h4>${s.from.label} <span class="arrowto">→</span> ${s.to.label}</h4>
          <div class="stage-stats">
            <span><b>${s.km.toFixed(1)}</b> km</span>
            <span>${s.to.hostel ? '🛏 ' + s.to.hostel.type.replace('Accoglienza ', '') : '🏁 arrivo'}</span>
            ${s.to.hostel && s.to.hostel.phone ? `<span>☎ ${s.to.hostel.phone}</span>` : ''}
          </div>
        </div>
        <button class="stage-dl" data-i="${i}" title="Scarica GPX tappa">↓ GPX</button>
      </article>`).join('');
    stagesEl.querySelectorAll('.stage-dl').forEach(b =>
      b.addEventListener('click', () => DIS.downloadText(`tappa-${+b.dataset.i + 1}.gpx`, stages[+b.dataset.i].gpx)));
  }

  goBtn.addEventListener('click', async () => {
    try {
      goBtn.disabled = true; zipBtn.disabled = true; zipBtn.style.opacity = .5;
      const n = Math.max(2, Math.min(20, +document.getElementById('t-days').value || 4));
      const accType = document.getElementById('t-acc-type').value;
      Loader.show('Sto disegnando il viaggio…', 'Cerco partenza e arrivo');
      const a = await VF.resolve(places, segState['t-start'], document.getElementById('t-start-city').value.trim(), 'partenza', accType);
      const b = await VF.resolve(places, segState['t-end'], document.getElementById('t-end-city').value.trim(), 'arrivo', accType);

      Loader.step('Calcolo il percorso completo…');
      const full = await VF.brouter(a, b);
      const cum = VF.cumulative(full.coords);
      const total = cum[cum.length - 1];
      if (total / n < 8) throw new Error('Troppi giorni per un percorso così corto. Riduci le tappe.');

      Loader.step('Scelgo le soste con un letto…');
      const stops = pickStops(full.coords, cum, total, n, accType);

      // build waypoint chain A → stops → B and route each leg
      const chain = [{ lat: a.lat, lon: a.lon, label: a.label, hostel: a.hostel },
        ...stops.map(s => ({ lat: s.p.lat, lon: s.p.lon, label: `${s.p.name}, ${s.p.city}`, hostel: s.p })),
        { lat: b.lat, lon: b.lon, label: b.label, hostel: b.hostel }];

      const stages = [];
      for (let i = 0; i < chain.length - 1; i++) {
        Loader.step(`Traccio la tappa ${i + 1} di ${chain.length - 1}…`);
        const leg = await VF.brouter(chain[i], chain[i + 1]);
        stages.push({ from: chain[i], to: chain[i + 1], coords: leg.coords, km: DIS.lengthKm(leg.coords),
          gpx: DIS.buildGpx(leg.coords, `Tappa ${i + 1}: ${chain[i].label} → ${chain[i + 1].label}`) });
      }

      // draw
      clear();
      stages.forEach((s, i) => {
        const col = STAGE_COLORS[i % STAGE_COLORS.length];
        layers.push(L.polyline(s.coords, { color: col, weight: 4.5, opacity: 1 }).addTo(map)
          .bindPopup(`<b>Giorno ${i + 1}</b><br>${s.from.label} → ${s.to.label}<br>${s.km.toFixed(1)} km`));
      });
      chain.forEach((c, i) => {
        const isEnd = i === chain.length - 1;
        layers.push(L.circleMarker([c.lat, c.lon], { radius: i === 0 || isEnd ? 8 : 6, color: '#fff', weight: 2,
          fillColor: i === 0 ? '#93a06a' : isEnd ? '#e8643c' : '#e6b035', fillOpacity: 1 })
          .addTo(map).bindPopup(`<b>${i === 0 ? 'Partenza' : isEnd ? 'Arrivo' : 'Sosta ' + i}</b><br>${c.label}`));
      });
      const all = L.featureGroup(layers); map.fitBounds(all.getBounds().pad(0.1));

      renderStages(stages);

      // assemble total gpx + stash for zip
      const allCoords = stages.flatMap(s => s.coords);
      zipStages = { stages, totalGpx: DIS.buildGpx(allCoords, `Itinerario ${a.label} → ${b.label}`) };
      zipName = `itinerario_${VF.slug(a.label)}-${VF.slug(b.label)}_${n}gg`;
      zipBtn.disabled = false; zipBtn.style.opacity = 1;

      const notes = [a.note, b.note].filter(Boolean).join(' ');
      setStatus(`Itinerario pronto: <b>${stages.length} tappe</b>, ${total.toFixed(0)} km totali, media ${(total / n).toFixed(0)} km/giorno.${notes ? ' ' + notes : ''}`, 'ok');
      Loader.hide();
    } catch (err) { Loader.hide(); setStatus('⚠ ' + err.message, 'err'); }
    finally { goBtn.disabled = false; }
  });

  zipBtn.addEventListener('click', async () => {
    if (!zipStages || typeof JSZip === 'undefined') return;
    const zip = new JSZip();
    const folder = zip.folder(zipName);
    zipStages.stages.forEach((s, i) => folder.file(`tappa-${String(i + 1).padStart(2, '0')}.gpx`, s.gpx));
    folder.file('itinerario-completo.gpx', zipStages.totalGpx);
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const aEl = document.createElement('a'); aEl.href = url; aEl.download = zipName + '.zip';
    document.body.appendChild(aEl); aEl.click(); aEl.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  });
});
