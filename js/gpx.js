/* ============ gpx.html — standalone GPX generator ============ */
(async function () {
  const STAGE_COLORS = ['#e8643c','#93a06a','#e6b035','#f08a64','#7aa6b0','#c98a4b'];

  // load VF accommodations for hostel resolution
  let places = [];
  try { places = (await (await fetch('data/accommodations.json')).json()).places; } catch {}

  // city datalist autocomplete
  const dl = document.getElementById('gpx-cities');
  if (dl && places.length) {
    const cities = [...new Set(places.map(p => p.city))].sort((a,b) => a.localeCompare(b,'it'));
    dl.innerHTML = cities.map(c => `<option value="${c}">`).join('');
  }

  // mode toggle: singola / itinerario
  const modeEl = document.getElementById('gpx-mode');
  const daysRow = document.getElementById('days-row');
  const accRow  = document.getElementById('acc-row');
  modeEl.addEventListener('change', () => {
    const multi = modeEl.value === 'multi';
    daysRow.hidden = !multi;
    accRow.hidden  = !multi;
  });

  // map
  const map = DIS.makeMap(document.getElementById('gpx-map'));
  map.setView([43.3, 11.3], 6);
  let layers = [];
  const clear = () => { layers.forEach(l => map.removeLayer(l)); layers = []; };

  const goBtn   = document.getElementById('gpx-go');
  const dlBtn   = document.getElementById('gpx-dl');
  const zipBtn  = document.getElementById('gpx-zip');
  const status  = document.getElementById('gpx-status');
  const infoEl  = document.getElementById('gpx-info');
  const stagesEl= document.getElementById('gpx-stages');
  const setStatus = (m, c='') => { status.className = 'gpx-status ' + c; status.innerHTML = m; };

  let lastSingle = null, lastZip = null;

  // ---- resolve endpoints ----
  async function endpoint(legPrefix, role) {
    const type = segState[legPrefix] || 'station';
    const city = document.getElementById(legPrefix + '-city').value.trim();
    const accType = document.getElementById('gpx-acc-type').value;
    return VF.resolve(places, type, city, role, accType);
  }

  // ---- draw single route ----
  function drawSingle(coords, a, b) {
    clear();
    layers.push(L.polyline(coords, { color:'#e8643c', weight:13, opacity:.13 }).addTo(map));
    layers.push(L.polyline(coords, { color:'#e8643c', weight:4.5, opacity:1  }).addTo(map));
    layers.push(L.circleMarker([a.lat,a.lon],{radius:8,color:'#fff',weight:2,fillColor:'#93a06a',fillOpacity:1}).addTo(map).bindPopup(`<b>A · Partenza</b><br>${a.label}`));
    layers.push(L.circleMarker([b.lat,b.lon],{radius:8,color:'#fff',weight:2,fillColor:'#e8643c',fillOpacity:1}).addTo(map).bindPopup(`<b>B · Arrivo</b><br>${b.label}`));
    if (layers.length) map.fitBounds(L.featureGroup(layers).getBounds().pad(0.1));
  }

  // ---- draw multi-day ----
  function drawMulti(stages, chain) {
    clear();
    stages.forEach((s,i) => {
      const col = STAGE_COLORS[i % STAGE_COLORS.length];
      layers.push(L.polyline(s.coords,{color:col,weight:4.5,opacity:1}).addTo(map)
        .bindPopup(`<b>Giorno ${i+1}</b><br>${s.from.label} → ${s.to.label}<br>${s.km.toFixed(1)} km`));
    });
    chain.forEach((c,i) => {
      const isEnd = i === chain.length-1;
      layers.push(L.circleMarker([c.lat,c.lon],{radius:i===0||isEnd?8:6,color:'#fff',weight:2,
        fillColor:i===0?'#93a06a':isEnd?'#e8643c':'#e6b035',fillOpacity:1})
        .addTo(map).bindPopup(`<b>${i===0?'Partenza':isEnd?'Arrivo':'Sosta '+i}</b><br>${c.label}`));
    });
    if (layers.length) map.fitBounds(L.featureGroup(layers).getBounds().pad(0.1));
  }

  function renderStages(stages) {
    stagesEl.innerHTML = `<h3 class="stages-title">${stages.length} tappe</h3>` + stages.map((s,i) => `
      <article class="stage-card" style="--c:${STAGE_COLORS[i%STAGE_COLORS.length]}">
        <div class="stage-day">Giorno ${i+1}</div>
        <div class="stage-body">
          <h4>${s.from.label} <span class="arrowto">→</span> ${s.to.label}</h4>
          <div class="stage-stats">
            <span><b>${s.km.toFixed(1)}</b> km</span>
            <span>${s.to.hostel?'🛏 '+s.to.hostel.type.replace('Accoglienza ',''):'🏁 arrivo'}</span>
            ${s.to.hostel&&s.to.hostel.phone?`<span>☎ ${s.to.hostel.phone}</span>`:''}
          </div>
        </div>
        <button class="stage-dl" data-i="${i}">↓ GPX</button>
      </article>`).join('');
    stagesEl.querySelectorAll('.stage-dl').forEach(b =>
      b.addEventListener('click', () => DIS.downloadText(`tappa-${+b.dataset.i+1}.gpx`, stages[+b.dataset.i].gpx)));
  }

  function pickStops(route, cum, total, n) {
    const accType = document.getElementById('gpx-acc-type').value;
    const pool = VF.filterByAccType(places, accType);
    const buffer = 14;
    const cand = pool.map(p => {
      const pr = VF.project(route, cum, p.lat, p.lon);
      return { p, along: pr.along, dist: pr.dist };
    }).filter(c => c.dist <= buffer).sort((a,b) => a.along - b.along);
    const stops = []; let prev = 0;
    for (let k = 1; k < n; k++) {
      const target = total * k / n, minA = prev + total / n * 0.45;
      let best = null, bs = Infinity;
      for (const c of cand) {
        if (c.along <= minA || c.along >= total-1) continue;
        if (stops.some(s => VF.norm(s.p.city) === VF.norm(c.p.city))) continue;
        const sc = Math.abs(c.along - target) + c.dist * 2.5;
        if (sc < bs) { bs = sc; best = c; }
      }
      if (best) { stops.push(best); prev = best.along; }
    }
    return stops;
  }

  // ---- main handler ----
  goBtn.addEventListener('click', async () => {
    try {
      goBtn.disabled = true; dlBtn.disabled = true; zipBtn.disabled = true;
      dlBtn.style.opacity = zipBtn.style.opacity = '.5';
      stagesEl.innerHTML = ''; infoEl.hidden = true;
      const multi = modeEl.value === 'multi';

      if (multi) {
        const n = Math.max(2, Math.min(20, +document.getElementById('gpx-days').value || 4));
        Loader.show('Calcolo il percorso…', 'Cerco partenza e arrivo');
        const a = await endpoint('start', 'partenza');
        const b = await endpoint('end', 'arrivo');
        Loader.step('Rotta completa via BRouter…');
        const full = await VF.brouter(a, b);
        const cum  = VF.cumulative(full.coords);
        const total = cum[cum.length-1];
        if (total / n < 8) throw new Error('Troppi giorni per un percorso così corto.');
        Loader.step('Scelgo le soste…');
        const stops = pickStops(full.coords, cum, total, n);
        const chain = [
          {lat:a.lat,lon:a.lon,label:a.label,hostel:a.hostel},
          ...stops.map(s=>({lat:s.p.lat,lon:s.p.lon,label:`${s.p.name}, ${s.p.city}`,hostel:s.p})),
          {lat:b.lat,lon:b.lon,label:b.label,hostel:b.hostel}
        ];
        const stages = [];
        for (let i = 0; i < chain.length-1; i++) {
          Loader.step(`Tappa ${i+1} di ${chain.length-1}…`);
          const leg = await VF.brouter(chain[i], chain[i+1]);
          stages.push({ from:chain[i], to:chain[i+1], coords:leg.coords, km:DIS.lengthKm(leg.coords),
            gpx: DIS.buildGpx(leg.coords, `Tappa ${i+1}: ${chain[i].label} → ${chain[i+1].label}`) });
        }
        drawMulti(stages, chain);
        renderStages(stages);
        const allCoords = stages.flatMap(s => s.coords);
        const totalGpx = DIS.buildGpx(allCoords, `Itinerario ${a.label} → ${b.label}`);
        const name = `itinerario_${VF.slug(a.label)}-${VF.slug(b.label)}_${n}gg`;
        lastZip = { stages, totalGpx, name };
        zipBtn.disabled = false; zipBtn.style.opacity = '1';
        const notes = [a.note,b.note].filter(Boolean).join(' ');
        setStatus(`<b>${stages.length} tappe</b>, ${total.toFixed(0)} km, ~${(total/n).toFixed(0)} km/giorno.${notes?' '+notes:''}`, 'ok');
        Loader.hide();
      } else {
        setStatus('<span class="spinner"></span> Cerco gli indirizzi…');
        const a = await endpoint('start', 'partenza');
        const b = await endpoint('end', 'arrivo');
        setStatus('<span class="spinner"></span> Calcolo la rotta (BRouter)…');
        const { xml, coords } = await VF.brouter(a, b);
        drawSingle(coords, a, b);
        lastSingle = { xml, name: `gpx_${VF.slug(a.label)}-${VF.slug(b.label)}` };
        infoEl.querySelector('#gpx-dist').textContent = DIS.lengthKm(coords).toFixed(1);
        infoEl.querySelector('#gpx-pts').textContent  = coords.length;
        infoEl.hidden = false;
        dlBtn.disabled = false; dlBtn.style.opacity = '1';
        const notes = [a.note,b.note].filter(Boolean).join(' ');
        setStatus(`Rotta pronta: <b>${a.label}</b> → <b>${b.label}</b>.${notes?' '+notes:''}`, 'ok');
      }
    } catch(err) { Loader.hide(); setStatus('⚠ ' + err.message, 'err'); }
    finally { goBtn.disabled = false; }
  });

  dlBtn.addEventListener('click', () => {
    if (lastSingle) DIS.downloadText(lastSingle.name + '.gpx', lastSingle.xml);
  });

  zipBtn.addEventListener('click', async () => {
    if (!lastZip || typeof JSZip === 'undefined') return;
    const zip = new JSZip(), folder = zip.folder(lastZip.name);
    lastZip.stages.forEach((s,i) => folder.file(`tappa-${String(i+1).padStart(2,'0')}.gpx`, s.gpx));
    folder.file('itinerario-completo.gpx', lastZip.totalGpx);
    const blob = await zip.generateAsync({type:'blob'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=lastZip.name+'.zip';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  });
})();
