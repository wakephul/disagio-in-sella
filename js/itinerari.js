/* ============ itinerari page ============ */
(async function () {
  const grid = document.getElementById('grid');
  const filtersEl = document.getElementById('filters');
  let data = [];

  try {
    data = await (await fetch('data/itineraries.json')).json();
  } catch (e) {
    grid.innerHTML = '<p class="acc-empty">Impossibile caricare gli itinerari.</p>';
    return;
  }

  const macros = ['Tutti', ...new Set(data.map(d => d.macro))];
  let active = 'Tutti';

  filtersEl.innerHTML = macros.map(m =>
    `<button class="chip${m === 'Tutti' ? ' active' : ''}" data-m="${m}">${m}</button>`
  ).join('');
  filtersEl.addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    active = b.dataset.m;
    filtersEl.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === b));
    render();
  });

  const diffClass = d => d === 'Facile' ? 'olive' : d === 'Difficile' ? 'coral' : 'gold';
  const maps = {};

  function render() {
    const list = data.filter(d => active === 'Tutti' || d.macro === active);
    grid.innerHTML = list.map(d => `
      <article class="itin reveal" id="itin-${d.id}">
        <div class="itin-media">
          <img src="${d.image}" alt="${d.title}" loading="lazy" onerror="this.style.display='none'">
          <div class="tags">
            <span class="tag ${diffClass(d.difficulty)}">${d.difficulty}</span>
            <span class="tag">${d.days} giorni</span>
          </div>
        </div>
        <div class="itin-body">
          <p class="itin-region">${d.region}</p>
          <h3>${d.title}</h3>
          <p>${d.description}</p>
          <div class="itin-stats">
            <div><span class="n">${d.distance}</span><span class="k">km</span></div>
            <div><span class="n">${d.ascent}</span><span class="k">m D+</span></div>
            <div><span class="n">${d.start.split(' ')[0]}</span><span class="k">partenza</span></div>
            <div><span class="n">${d.end.split(' ')[0]}</span><span class="k">arrivo</span></div>
          </div>
          <div class="itin-actions">
            <button class="btn sm toggle-map" data-id="${d.id}">Mostra mappa</button>
            <button class="btn ghost sm dl-gpx" data-id="${d.id}">↓ GPX</button>
          </div>
          <div class="itin-map" id="map-${d.id}"></div>
        </div>
      </article>`).join('');

    document.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));

    grid.querySelectorAll('.toggle-map').forEach(btn =>
      btn.addEventListener('click', () => openMap(btn.dataset.id, btn).catch(() => {})));
    grid.querySelectorAll('.dl-gpx').forEach(btn =>
      btn.addEventListener('click', () => {
        const d = data.find(x => x.id === btn.dataset.id);
        const gpx = DIS.buildGpx(d.coords, d.title);
        DIS.downloadText(`${d.id}.gpx`, gpx);
      }));
  }

  async function fetchRoute(d) {
    const s = d.coords[0], e = d.coords[d.coords.length - 1];
    try {
      const url = `https://brouter.de/brouter?lonlats=${s[1]},${s[0]}|${e[1]},${e[0]}&profile=trekking&alternativeidx=0&format=gpx`;
      const xml = await (await fetch(url)).text();
      const pts = [...xml.matchAll(/<trkpt\b[^>]*lat="([\d.\-]+)"[^>]*lon="([\d.\-]+)"|<trkpt\b[^>]*lon="([\d.\-]+)"[^>]*lat="([\d.\-]+)"/g)]
        .map(m => m[1] ? [+m[1], +m[2]] : [+m[4], +m[3]]);
      return pts.length > 1 ? pts : d.coords;
    } catch { return d.coords; }
  }

  async function openMap(id, btn) {
    const wrap = document.getElementById('map-' + id);
    const d = data.find(x => x.id === id);
    const isOpen = wrap.classList.toggle('open');
    btn.textContent = isOpen ? 'Nascondi mappa' : 'Mostra mappa';
    if (!isOpen) return;
    if (!maps[id]) {
      btn.disabled = true; btn.textContent = '⏳ Carico…';
      const coords = await fetchRoute(d);
      const map = DIS.makeMap(wrap, {});
      const line = L.polyline(coords, { color: '#e8643c', weight: 4, opacity: .95 }).addTo(map);
      L.polyline(coords, { color: '#e8643c', weight: 12, opacity: .12 }).addTo(map);
      L.circleMarker(coords[0], { radius: 7, color: '#fff', fillColor: '#93a06a', fillOpacity: 1, weight: 2 })
        .addTo(map).bindPopup(`<b>Partenza</b><br>${d.start}`);
      L.circleMarker(coords[coords.length - 1], { radius: 7, color: '#fff', fillColor: '#e8643c', fillOpacity: 1, weight: 2 })
        .addTo(map).bindPopup(`<b>Arrivo</b><br>${d.end}`);
      map.fitBounds(line.getBounds().pad(0.08));
      maps[id] = map;
      btn.disabled = false; btn.textContent = 'Nascondi mappa';
    }
    setTimeout(() => maps[id].invalidateSize(), 580);
  }

  render();
})();
