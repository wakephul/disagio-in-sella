/* ============ gpx.html — free-form GPX generator ============ */
(function () {
  const STAGE_COLORS = ['#e8643c','#93a06a','#e6b035','#f08a64','#7aa6b0','#c98a4b'];

  // OSM tourism tags per accommodation type
  const ACC_TAGS = {
    camping: ['camp_site','caravan_site'],
    hostel:  ['hostel','guest_house'],
    hotel:   ['hotel','motel'],
    any:     ['camp_site','caravan_site','hostel','guest_house','hotel','motel']
  };
  const ACC_LABELS = {
    camp_site:'🏕 Campeggio', caravan_site:'🏕 Area camper',
    hostel:'🛏 Ostello', guest_house:'🏡 B&B',
    hotel:'🏨 Hotel', motel:'🏨 Motel'
  };

  // ---- UI refs ----
  const modeEl    = document.getElementById('gpx-mode');
  const multiOpts = document.getElementById('multi-opts');
  const goBtn     = document.getElementById('gpx-go');
  const dlBtn     = document.getElementById('gpx-dl');
  const zipBtn    = document.getElementById('gpx-zip');
  const statusEl  = document.getElementById('gpx-status');
  const infoEl    = document.getElementById('gpx-info');
  const stagesEl  = document.getElementById('gpx-stages');

  modeEl.addEventListener('change', () => { multiOpts.hidden = modeEl.value !== 'multi'; });

  const setStatus = (m, c='') => { statusEl.className = 'gpx-status ' + c; statusEl.innerHTML = m; };

  // ---- map ----
  const map = DIS.makeMap(document.getElementById('gpx-map'));
  map.setView([43.3, 11.3], 6);
  let layers = [];
  const clear = () => { layers.forEach(l => map.removeLayer(l)); layers = []; };

  let lastSingle = null, lastZip = null;

  // ---- geocode free address ----
  async function geocode(addr) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(addr)}`;
    const r = await fetch(url, { headers: { 'Accept-Language': 'it', 'User-Agent': 'disagio-in-sella/1.0' } });
    const j = await r.json();
    if (!j.length) throw new Error(`Indirizzo non trovato: "${addr}"`);
    return { lat: +j[0].lat, lon: +j[0].lon, label: j[0].display_name.split(',').slice(0,3).join(',') };
  }

  // ---- BRouter ----
  async function brouter(a, b) {
    const url = `https://brouter.de/brouter?lonlats=${a.lon},${a.lat}|${b.lon},${b.lat}&profile=trekking&alternativeidx=0&format=gpx`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('BRouter non ha trovato una rotta ciclabile tra i due punti.');
    const xml = await r.text();
    const coords = parseGpx(xml);
    if (coords.length < 2) throw new Error('Rotta vuota. Prova indirizzi più vicini a strade ciclabili.');
    return { xml, coords };
  }
  function parseGpx(xml) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    return [...doc.getElementsByTagName('trkpt')].map(n => [+n.getAttribute('lat'), +n.getAttribute('lon')]);
  }

  // ---- Overpass: find accommodations in bounding box ----
  async function fetchAccommodations(coords, accType) {
    const lats = coords.map(c => c[0]), lons = coords.map(c => c[1]);
    const pad = 0.15;
    const bbox = `${Math.min(...lats)-pad},${Math.min(...lons)-pad},${Math.max(...lats)+pad},${Math.max(...lons)+pad}`;
    const tags = ACC_TAGS[accType] || ACC_TAGS.any;
    const tagFilter = tags.map(t => `node["tourism"="${t}"](${bbox});`).join('');
    const query = `[out:json][timeout:25];(${tagFilter});out body;`;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('Overpass API non risponde. Riprova tra un momento.');
    const j = await r.json();
    return j.elements.map(el => ({
      lat: el.lat, lon: el.lon,
      name: el.tags.name || el.tags.tourism || 'Struttura',
      type: el.tags.tourism,
      label: el.tags.name || ACC_LABELS[el.tags.tourism] || el.tags.tourism,
      phone: el.tags['contact:phone'] || el.tags.phone || '',
      website: el.tags['contact:website'] || el.tags.website || '',
      addr: [el.tags['addr:street'], el.tags['addr:city']].filter(Boolean).join(', ')
    }));
  }

  // ---- haversine + route projection ----
  function hav(la1,lo1,la2,lo2){const R=6371,x=(la2-la1)*Math.PI/180,y=(lo2-lo1)*Math.PI/180;const a=Math.sin(x/2)**2+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(y/2)**2;return 2*R*Math.asin(Math.sqrt(a));}
  function cumulative(route){const c=[0];for(let i=1;i<route.length;i++)c[i]=c[i-1]+hav(route[i-1][0],route[i-1][1],route[i][0],route[i][1]);return c;}
  function project(route,cum,lat,lon){let bd=Infinity,al=0;for(let i=0;i<route.length;i++){const d=hav(lat,lon,route[i][0],route[i][1]);if(d<bd){bd=d;al=cum[i];}}return{along:al,dist:bd};}

  // ---- pick N-1 accommodation stops along route ----
  function pickStops(route, cum, total, n, places) {
    const buffer = 20; // km — generous for real OSM data density
    const cand = places.map(p => {
      const pr = project(route, cum, p.lat, p.lon);
      return { p, along: pr.along, dist: pr.dist };
    }).filter(c => c.dist <= buffer).sort((a,b) => a.along - b.along);

    const stops = []; let prev = 0;
    for (let k = 1; k < n; k++) {
      const target = total * k / n, minA = prev + total / n * 0.4;
      let best = null, bs = Infinity;
      for (const c of cand) {
        if (c.along <= minA || c.along >= total - 2) continue;
        if (stops.some(s => hav(s.p.lat,s.p.lon,c.p.lat,c.p.lon) < 3)) continue; // dedupe close ones
        const sc = Math.abs(c.along - target) + c.dist * 3;
        if (sc < bs) { bs = sc; best = c; }
      }
      if (best) { stops.push(best); prev = best.along; }
    }
    return stops;
  }

  // ---- draw ----
  function drawSingle(coords, a, b) {
    clear();
    layers.push(L.polyline(coords,{color:'#e8643c',weight:13,opacity:.13}).addTo(map));
    layers.push(L.polyline(coords,{color:'#e8643c',weight:4.5,opacity:1}).addTo(map));
    layers.push(L.circleMarker([a.lat,a.lon],{radius:9,color:'#fff',weight:2,fillColor:'#93a06a',fillOpacity:1}).addTo(map).bindPopup(`<b>Partenza</b><br>${a.label}`));
    layers.push(L.circleMarker([b.lat,b.lon],{radius:9,color:'#fff',weight:2,fillColor:'#e8643c',fillOpacity:1}).addTo(map).bindPopup(`<b>Arrivo</b><br>${b.label}`));
    map.fitBounds(L.featureGroup(layers).getBounds().pad(0.1));
  }

  function drawMulti(stages, chain, allPlaces) {
    clear();
    // faint dots for all found accommodations
    allPlaces.forEach(p => {
      layers.push(L.circleMarker([p.lat,p.lon],{radius:3,color:'#e6b035',weight:1,fillColor:'#e6b035',fillOpacity:.45})
        .addTo(map).bindPopup(`${ACC_LABELS[p.type]||p.type}<br><b>${p.label}</b>`));
    });
    stages.forEach((s,i) => {
      const col = STAGE_COLORS[i % STAGE_COLORS.length];
      layers.push(L.polyline(s.coords,{color:col,weight:4.5,opacity:1}).addTo(map)
        .bindPopup(`<b>Giorno ${i+1}</b><br>${s.from.label} → ${s.to.label}<br>${s.km.toFixed(1)} km`));
    });
    chain.forEach((c,i) => {
      const isEnd = i === chain.length-1;
      layers.push(L.circleMarker([c.lat,c.lon],{radius:i===0||isEnd?9:7,color:'#fff',weight:2,
        fillColor:i===0?'#93a06a':isEnd?'#e8643c':'#e6b035',fillOpacity:1})
        .addTo(map).bindPopup(`<b>${i===0?'Partenza':isEnd?'Arrivo':'Sosta '+i}</b><br>${c.label}${c.acc?'<br>'+ACC_LABELS[c.acc.type]+' · '+c.acc.label:''}`));
    });
    map.fitBounds(L.featureGroup(layers).getBounds().pad(0.1));
  }

  function renderStages(stages) {
    stagesEl.innerHTML = `<h3 class="stages-title">${stages.length} tappe</h3>` + stages.map((s,i) => `
      <article class="stage-card" style="--c:${STAGE_COLORS[i%STAGE_COLORS.length]}">
        <div class="stage-day">Giorno ${i+1}</div>
        <div class="stage-body">
          <h4>${s.from.label} <span class="arrowto">→</span> ${s.to.label}</h4>
          <div class="stage-stats">
            <span><b>${s.km.toFixed(1)}</b> km</span>
            ${s.to.acc ? `<span>${ACC_LABELS[s.to.acc.type]||s.to.acc.type} · ${s.to.acc.label}</span>` : '<span>🏁 arrivo</span>'}
            ${s.to.acc&&s.to.acc.phone ? `<span>☎ ${s.to.acc.phone}</span>` : ''}
            ${s.to.acc&&s.to.acc.website ? `<span><a href="${s.to.acc.website}" target="_blank" rel="noopener" style="color:var(--coral)">sito web</a></span>` : ''}
          </div>
        </div>
        <button class="stage-dl" data-i="${i}">↓ GPX</button>
      </article>`).join('');
    stagesEl.querySelectorAll('.stage-dl').forEach(b =>
      b.addEventListener('click', () => DIS.downloadText(`tappa-${+b.dataset.i+1}.gpx`, stages[+b.dataset.i].gpx)));
  }

  // ---- main ----
  goBtn.addEventListener('click', async () => {
    const addrA = document.getElementById('addr-start').value.trim();
    const addrB = document.getElementById('addr-end').value.trim();
    if (!addrA || !addrB) { setStatus('⚠ Inserisci partenza e arrivo.', 'err'); return; }
    try {
      goBtn.disabled = true; dlBtn.disabled = true; zipBtn.disabled = true;
      dlBtn.style.opacity = zipBtn.style.opacity = '.5';
      stagesEl.innerHTML = ''; infoEl.hidden = true; lastSingle = null; lastZip = null;

      const multi = modeEl.value === 'multi';

      if (!multi) {
        setStatus('<span class="spinner"></span> Geocoding…');
        const a = await geocode(addrA), b = await geocode(addrB);
        setStatus('<span class="spinner"></span> Calcolo rotta BRouter…');
        const { xml, coords } = await brouter(a, b);
        drawSingle(coords, a, b);
        lastSingle = { xml, name: `gpx_${slug(addrA)}-${slug(addrB)}` };
        infoEl.querySelector('#gpx-dist').textContent = DIS.lengthKm(coords).toFixed(1);
        infoEl.querySelector('#gpx-pts').textContent  = coords.length;
        infoEl.hidden = false;
        dlBtn.disabled = false; dlBtn.style.opacity = '1';
        setStatus(`Rotta pronta · <b>${DIS.lengthKm(coords).toFixed(1)} km</b> · ${coords.length} punti.`, 'ok');

      } else {
        const n       = Math.max(2, Math.min(20, +document.getElementById('gpx-days').value || 3));
        const accType = document.getElementById('gpx-acc-type').value;
        Loader.show('Sto pedalando i calcoli…', 'Geocoding indirizzi');
        const a = await geocode(addrA), b = await geocode(addrB);
        Loader.step('Rotta completa via BRouter…');
        const full = await brouter(a, b);
        const cum   = cumulative(full.coords);
        const total = cum[cum.length-1];
        if (total / n < 8) throw new Error(`Troppi giorni per ${total.toFixed(0)} km. Riduci le tappe.`);
        Loader.step(`Cerco ${ACC_TAGS[accType].map(t=>ACC_LABELS[t]||t).join(', ')} lungo il percorso (Overpass/OSM)…`);
        const places = await fetchAccommodations(full.coords, accType);
        if (!places.length) throw new Error(`Nessun alloggio trovato lungo il percorso per il tipo selezionato. Prova "Qualsiasi".`);
        Loader.step(`Trovate ${places.length} strutture. Scelgo le soste…`);
        const stops = pickStops(full.coords, cum, total, n, places);
        if (!stops.length && n > 2) {
          throw new Error(`Non ho trovato strutture abbastanza distribuite. Prova un tipo diverso o riduci i giorni.`);
        }
        const chain = [
          { lat:a.lat, lon:a.lon, label: shortLabel(a.label) },
          ...stops.map(s => ({ lat:s.p.lat, lon:s.p.lon, label:s.p.label, acc:s.p })),
          { lat:b.lat, lon:b.lon, label: shortLabel(b.label) }
        ];
        const stages = [];
        for (let i = 0; i < chain.length-1; i++) {
          Loader.step(`Rotta tappa ${i+1} di ${chain.length-1}…`);
          const leg = await brouter(chain[i], chain[i+1]);
          stages.push({ from:chain[i], to:chain[i+1], coords:leg.coords,
            km: DIS.lengthKm(leg.coords),
            gpx: DIS.buildGpx(leg.coords, `Tappa ${i+1}: ${chain[i].label} → ${chain[i+1].label}`) });
        }
        drawMulti(stages, chain, places);
        renderStages(stages);
        const allCoords = stages.flatMap(s => s.coords);
        const name = `itinerario_${slug(addrA)}-${slug(addrB)}_${n}gg`;
        lastZip = { stages, totalGpx: DIS.buildGpx(allCoords, `${addrA} → ${addrB}`), name };
        infoEl.querySelector('#gpx-dist').textContent = total.toFixed(1);
        infoEl.querySelector('#gpx-pts').textContent  = allCoords.length;
        infoEl.hidden = false;
        zipBtn.disabled = false; zipBtn.style.opacity = '1';
        setStatus(`<b>${stages.length} tappe</b> · ${total.toFixed(0)} km totali · ~${(total/n).toFixed(0)} km/giorno · ${places.length} strutture trovate lungo il percorso.`, 'ok');
        Loader.hide();
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

  function slug(s){return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'').slice(0,24);}
  function shortLabel(l){return l.split(',').slice(0,2).join(',').trim();}
})();
