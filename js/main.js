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
    document.querySelectorAll('.menu a, .overlay-close').forEach(el =>
      el.addEventListener('click', () => {
        body.classList.remove('menu-open');
        burger.setAttribute('aria-expanded', 'false');
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

/* ============ VF — routing / geocoding helpers (shared) ============ */
window.VF = (function () {
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/['']/g,"'").trim();
  const slug = s => norm(s).replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'').slice(0,28);
  function haversine(la1,lo1,la2,lo2){const R=6371,x=(la2-la1)*Math.PI/180,y=(lo2-lo1)*Math.PI/180;const a=Math.sin(x/2)**2+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(y/2)**2;return 2*R*Math.asin(Math.sqrt(a));}
  async function geocode(q){const r=await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=it,ch,fr,gb&q=${encodeURIComponent(q)}`,{headers:{'Accept-Language':'it'}});const j=await r.json();if(!j.length)return null;return{lat:+j[0].lat,lon:+j[0].lon,label:j[0].display_name.split(',').slice(0,2).join(',')};}
  async function geocodeStation(city){const h=await geocode(`${city} railway station`)||await geocode(`Stazione di ${city}, ${city}`);if(!h)throw new Error(`Stazione non trovata per "${city}".`);return{lat:h.lat,lon:h.lon,label:`Stazione di ${city}`};}
  function filterByAccType(places,accType){if(!accType||accType==='both')return places;return places.filter(p=>p.type.toLowerCase().includes(accType));}
  async function resolveHostel(places,city,accType){const pool=filterByAccType(places,accType);const want=norm(city);let inCity=pool.filter(p=>norm(p.city)===want);if(!inCity.length)inCity=pool.filter(p=>norm(p.city).includes(want)&&want.length>3);if(inCity.length){const p=inCity.sort((a,b)=>(a.type.includes('pellegrina')?-1:1)-(b.type.includes('pellegrina')?-1:1))[0];return{lat:p.lat,lon:p.lon,label:`${p.name}, ${p.city}`,hostel:p};}const c=await geocode(`${city}, Italia`);if(!c)throw new Error(`Città "${city}" non trovata.`);let best=null,bd=Infinity;pool.forEach(p=>{const d=haversine(c.lat,c.lon,p.lat,p.lon);if(d<bd){bd=d;best=p;}});if(!best)throw new Error('Nessuna accoglienza per il tipo selezionato.');return{lat:best.lat,lon:best.lon,label:`${best.name}, ${best.city}`,hostel:best,note:`Nessuna accoglienza a ${city}: scelta la più vicina, ${best.city} (${bd.toFixed(0)} km).`};}
  async function resolve(places,type,city,role,accType){if(!city)throw new Error(`Inserisci la città di ${role}.`);return type==='station'?await geocodeStation(city):await resolveHostel(places,city,accType);}
  async function brouter(a,b){const url=`https://brouter.de/brouter?lonlats=${a.lon},${a.lat}|${b.lon},${b.lat}&profile=trekking&alternativeidx=0&format=gpx`;const r=await fetch(url);if(!r.ok)throw new Error('BRouter non ha trovato una rotta ciclabile.');const xml=await r.text();const coords=parseGpx(xml);if(coords.length<2)throw new Error('Rotta vuota.');return{xml,coords};}
  function parseGpx(xml){const doc=new DOMParser().parseFromString(xml,'application/xml');return[...doc.getElementsByTagName('trkpt')].map(n=>[+n.getAttribute('lat'),+n.getAttribute('lon')]);}
  function cumulative(route){const c=[0];for(let i=1;i<route.length;i++)c[i]=c[i-1]+haversine(route[i-1][0],route[i-1][1],route[i][0],route[i][1]);return c;}
  function project(route,cum,lat,lon){let bd=Infinity,al=0;for(let i=0;i<route.length;i++){const d=haversine(lat,lon,route[i][0],route[i][1]);if(d<bd){bd=d;al=cum[i];}}return{along:al,dist:bd};}
  return{norm,slug,haversine,geocode,geocodeStation,resolve,filterByAccType,brouter,parseGpx,cumulative,project};
})();

/* ============ Loader ============ */
window.Loader = {
  show(title,sub){const l=document.getElementById('loader');if(!l)return;document.getElementById('loader-title').textContent=title;document.getElementById('loader-sub').textContent=sub||'';l.hidden=false;document.body.style.overflow='hidden';},
  step(sub){const el=document.getElementById('loader-sub');if(el)el.textContent=sub;},
  hide(){const l=document.getElementById('loader');if(l)l.hidden=true;document.body.style.overflow='';}
};

/* ============ segState — station/hostel toggles (shared) ============ */
window.segState = {};
document.querySelectorAll('.seg').forEach(seg => {
  const leg = seg.dataset.leg; segState[leg] = 'station';
  seg.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    seg.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
    segState[leg] = b.dataset.type;
    const isStation = b.dataset.type === 'station';
    const lbl = document.getElementById(leg + '-lbl');
    if (lbl) lbl.textContent = isStation ? 'Città della stazione' : "Città dell'accoglienza";
    const inp = seg.parentElement.querySelector('input[type="text"]');
    if (inp) inp.placeholder = isStation ? 'es. Siena (stazione)' : 'es. Siena (ostello)';
  });
});
