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

  const maxKmData = Math.max(...data.map(d => d.distance));

  // filter state
  const f = { macro: 'Tutti', diff: 'Tutte', days: 'Tutti', maxKm: maxKmData, camping: false };

  // build filter UI
  const macros = ['Tutti', ...new Set(data.map(d => d.macro))];
  const diffs  = ['Tutte', 'Facile', 'Media', 'Difficile'];
  const dayBands = [
    { label: 'Tutti', test: () => true },
    { label: '1 giorno', test: d => d.days === 1 },
    { label: '2–5 giorni', test: d => d.days >= 2 && d.days <= 5 },
    { label: '6+ giorni', test: d => d.days >= 6 },
  ];

  filtersEl.innerHTML = `
    <div class="filter-bar">
      <div class="filter-row">
        <span class="filter-label">Zona</span>
        <div class="chips" id="f-macro">${macros.map(m =>
          `<button class="chip${m === 'Tutti' ? ' active' : ''}" data-v="${m}">${m}</button>`
        ).join('')}</div>
      </div>
      <div class="filter-row">
        <span class="filter-label">Difficoltà</span>
        <div class="chips" id="f-diff">${diffs.map(d =>
          `<button class="chip${d === 'Tutte' ? ' active' : ''}" data-v="${d}">${d}</button>`
        ).join('')}</div>
        <span class="filter-sep"></span>
        <span class="filter-label">Durata</span>
        <div class="chips" id="f-days">${dayBands.map((b, i) =>
          `<button class="chip${i === 0 ? ' active' : ''}" data-i="${i}">${b.label}</button>`
        ).join('')}</div>
      </div>
      <div class="filter-row filter-row-bottom">
        <div class="filter-km-wrap">
          <span class="filter-label">Distanza massima</span>
          <div class="filter-km-inner">
            <input type="range" id="f-km" min="0" max="${maxKmData}" value="${maxKmData}" step="10">
            <span class="filter-km-val" id="f-km-val">fino a ${maxKmData} km</span>
          </div>
        </div>
        <label class="filter-camping">
          <input type="checkbox" id="f-camping">
          <span>🏕 Solo con campeggio</span>
        </label>
        <span class="filter-count" id="f-count">${data.length} itinerari</span>
      </div>
    </div>
  `;

  // chip handlers
  document.getElementById('f-macro').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    document.querySelectorAll('#f-macro .chip').forEach(c => c.classList.toggle('active', c === b));
    f.macro = b.dataset.v; render();
  });
  document.getElementById('f-diff').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    document.querySelectorAll('#f-diff .chip').forEach(c => c.classList.toggle('active', c === b));
    f.diff = b.dataset.v; render();
  });
  document.getElementById('f-days').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    document.querySelectorAll('#f-days .chip').forEach(c => c.classList.toggle('active', c === b));
    f.daysIdx = +b.dataset.i; render();
  });
  f.daysIdx = 0;

  // slider
  const kmSlider = document.getElementById('f-km');
  const kmVal = document.getElementById('f-km-val');
  kmSlider.addEventListener('input', () => {
    f.maxKm = +kmSlider.value;
    kmVal.textContent = f.maxKm >= maxKmData ? `qualsiasi distanza` : `fino a ${f.maxKm} km`;
    render();
  });

  // camping
  document.getElementById('f-camping').addEventListener('change', e => {
    f.camping = e.target.checked; render();
  });

  const diffColor = d => d === 'Facile' ? 'olive' : d === 'Difficile' ? 'coral' : 'gold';

  function render() {
    const list = data.filter(d =>
      (f.macro === 'Tutti' || d.macro === f.macro) &&
      (f.diff  === 'Tutte' || d.difficulty === f.diff) &&
      dayBands[f.daysIdx].test(d) &&
      d.distance <= f.maxKm &&
      (!f.camping || d.camping)
    );

    document.getElementById('f-count').textContent =
      list.length === 0 ? 'Nessun itinerario trovato'
      : `${list.length} itinerar${list.length === 1 ? 'io' : 'i'}`;

    if (list.length === 0) {
      grid.innerHTML = '<p class="acc-empty">Nessun itinerario corrisponde ai filtri.</p>';
      return;
    }

    grid.innerHTML = list.map(d => `
      <a class="itin-card reveal" href="itinerario.html?id=${d.id}" aria-label="${d.title}">
        <img src="${d.image}" alt="${d.title}" loading="lazy" onerror="this.style.display='none'">
        <div class="itin-card-overlay"></div>
        <div class="itin-card-tags">
          <span class="tag ${diffColor(d.difficulty)}">${d.difficulty}</span>
          ${d.camping ? '<span class="tag olive">🏕</span>' : ''}
        </div>
        <div class="itin-card-content">
          <p class="itin-card-region">${d.region}</p>
          <h3 class="itin-card-title">${d.title}</h3>
          <div class="itin-card-stats">
            <span><b>${d.distance}</b> km</span>
            <span><b>${d.days}</b> ${d.days === 1 ? 'giorno' : 'giorni'}</span>
            <span><b>${d.ascent.toLocaleString('it')}</b> m D+</span>
          </div>
          <span class="itin-card-cta">Scopri <span class="arrow">→</span></span>
        </div>
      </a>`).join('');

    document.querySelectorAll('.reveal').forEach(el =>
      requestAnimationFrame(() => el.classList.add('in')));
  }

  render();
})();
