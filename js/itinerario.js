/* ============ itinerario detail page ============ */
(async function () {
  const id = new URLSearchParams(location.search).get('id');
  if (!id) { location.href = 'itinerari.html'; return; }

  let data;
  try { data = await (await fetch('data/itineraries.json')).json(); }
  catch { document.getElementById('detail-title').textContent = 'Errore nel caricamento.'; return; }

  const d = data.find(x => x.id === id);
  if (!d) { location.href = 'itinerari.html'; return; }

  // meta
  document.getElementById('page-title').textContent = `${d.title} — Disagio in Sella`;
  document.getElementById('page-desc').content = d.description;

  // hero
  const img = document.getElementById('detail-img');
  img.src = d.image; img.alt = d.title;

  document.getElementById('detail-region').textContent = d.region;
  document.getElementById('detail-title').textContent = d.title;

  const diffColor = { Facile: 'olive', Media: 'gold', Difficile: 'coral' };
  document.getElementById('detail-badges').innerHTML = `
    <span class="tag ${diffColor[d.difficulty] || ''}">${d.difficulty}</span>
    <span class="tag">${d.days} ${d.days === 1 ? 'giorno' : 'giorni'}</span>
    ${d.camping ? '<span class="tag olive">🏕 Campeggio</span>' : ''}
  `;

  // stats bar
  document.getElementById('d-dist').textContent = d.distance;
  document.getElementById('d-days').textContent = d.days;
  document.getElementById('d-ascent').textContent = d.ascent.toLocaleString('it');
  document.getElementById('d-diff').textContent = d.difficulty;
  document.getElementById('d-surface').textContent = d.surface;

  // body
  document.getElementById('detail-desc').textContent = d.description;

  document.getElementById('detail-highlights').innerHTML =
    `<h3 class="detail-section-title">Tappe imperdibili</h3><ul class="highlights-list">${
      d.highlights.map(h => `<li>${h}</li>`).join('')
    }</ul>`;

  document.getElementById('d-start').textContent = d.start;
  document.getElementById('d-end').textContent = d.end;

  // map + GPX
  const mapEl = document.getElementById('detail-map');
  const statusEl = document.getElementById('detail-map-status');
  const gpxStatus = document.getElementById('detail-gpx-status');
  const gpxBtn = document.getElementById('detail-gpx-dl');

  const map = DIS.makeMap(mapEl, {});
  let routeCoords = d.coords;

  // try BRouter for accurate route
  try {
    const s = d.coords[0], e = d.coords[d.coords.length - 1];
    const url = `https://brouter.de/brouter?lonlats=${s[1]},${s[0]}|${e[1]},${e[0]}&profile=trekking&alternativeidx=0&format=gpx`;
    const xml = await (await fetch(url)).text();
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const pts = [...doc.getElementsByTagName('trkpt')].map(n => [+n.getAttribute('lat'), +n.getAttribute('lon')]);
    if (pts.length > 1) routeCoords = pts;
  } catch { /* fall back to d.coords */ }

  const line = L.polyline(routeCoords, { color: '#e8643c', weight: 4, opacity: .95 }).addTo(map);
  L.polyline(routeCoords, { color: '#e8643c', weight: 14, opacity: .1 }).addTo(map);
  L.circleMarker(routeCoords[0], { radius: 8, color: '#fff', fillColor: '#93a06a', fillOpacity: 1, weight: 2.5 })
    .addTo(map).bindPopup(`<b>Partenza</b><br>${d.start}`);
  L.circleMarker(routeCoords[routeCoords.length - 1], { radius: 8, color: '#fff', fillColor: '#e8643c', fillOpacity: 1, weight: 2.5 })
    .addTo(map).bindPopup(`<b>Arrivo</b><br>${d.end}`);
  map.fitBounds(line.getBounds().pad(0.1));
  statusEl.hidden = true;

  const km = Math.round(DIS.lengthKm(routeCoords));
  gpxStatus.textContent = `${km} km · ${routeCoords.length} punti`;
  gpxBtn.disabled = false; gpxBtn.style.opacity = '';
  gpxBtn.addEventListener('click', () => {
    DIS.downloadText(`${d.id}.gpx`, DIS.buildGpx(routeCoords, d.title));
  });
})();
