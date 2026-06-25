// ── CONFIG ──
const DATA_URL = 'data/restaurants.json';

// ── ÉTAT ──
let tous = [];
let filtres = [];
let markers = {};
let markerLayer;
let positionUser = null;
let map;

// ── INIT ──
window.addEventListener('DOMContentLoaded', async () => {
  // Initialiser la carte centrée sur Paris
  map = L.map('map').setView([48.8566, 2.3522], 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map);

  markerLayer = L.layerGroup().addTo(map);

  // Charger les données
  try {
    const res = await fetch(DATA_URL);
    tous = await res.json();
    console.log(`${tous.length} restaurants charges`);
  } catch (e) {
    console.error('Erreur chargement data:', e);
    return;
  }

  // Remplir les selects
  peuplerFiltres();

  // Écouter les changements de filtres
  ['filtre-arr','filtre-cuisine','filtre-prix','filtre-note','tri'].forEach(id => {
    document.getElementById(id).addEventListener('change', appliquerFiltres);
  });

  appliquerFiltres();
});

// ── PEUPLER LES SELECTS ──
function peuplerFiltres() {
  // Arrondissements
  const arrs = [...new Set(tous.map(r => r.arrondissement).filter(Boolean))].sort((a,b) => {
    const n = s => parseInt(s.replace(/\D/g,'')) || 99;
    return n(a) - n(b);
  });
  const selArr = document.getElementById('filtre-arr');
  arrs.forEach(a => {
    const o = document.createElement('option');
    o.value = a; o.textContent = a;
    selArr.appendChild(o);
  });

  // Cuisines
  const cuisines = [...new Set(tous.map(r => r.cuisine).filter(Boolean))].sort();
  const selCuis = document.getElementById('filtre-cuisine');
  cuisines.forEach(c => {
    const o = document.createElement('option');
    o.value = c; o.textContent = c;
    selCuis.appendChild(o);
  });
}

// ── FILTRES ET AFFICHAGE ──
function appliquerFiltres() {
  const arr     = document.getElementById('filtre-arr').value;
  const cuisine = document.getElementById('filtre-cuisine').value;
  const prixMax = parseFloat(document.getElementById('filtre-prix').value) || Infinity;
  const noteMin = parseFloat(document.getElementById('filtre-note').value) || 4.7;
  const tri     = document.getElementById('tri').value;

  filtres = tous.filter(r => {
    if (r.note_google < noteMin) return false;
    if (arr && r.arrondissement !== arr) return false;
    if (cuisine && r.cuisine !== cuisine) return false;
    if (prixMax < Infinity && r.prix) {
      const m = r.prix.match(/(\d+)/);
      if (m && parseFloat(m[1]) > prixMax) return false;
    }
    return true;
  });

  // Calculer distances si position connue
  if (positionUser) {
    filtres.forEach(r => {
      r._dist = distanceKm(positionUser.lat, positionUser.lng, r.lat, r.lng);
    });
  }

  // Tri
  if (tri === 'distance' && positionUser) {
    filtres.sort((a,b) => (a._dist||99) - (b._dist||99));
  } else {
    filtres.sort((a,b) => b.note_google - a.note_google);
  }

  document.getElementById('compteur').textContent = `${filtres.length} restaurants`;

  afficherMarkers();
  afficherListe();
}

// ── MARKERS ──
function couleurNote(note) {
  if (note >= 4.9) return '#27ae60';
  if (note >= 4.8) return '#f39c12';
  return '#e74c3c';
}

function iconeMarker(note) {
  const couleur = couleurNote(note);
  return L.divIcon({
    className: '',
    html: `<div style="
      width:28px;height:28px;border-radius:50%;
      background:${couleur};border:3px solid #fff;
      box-shadow:0 2px 6px rgba(0,0,0,0.3);
      display:flex;align-items:center;justify-content:center;
      font-size:10px;font-weight:700;color:#fff;
    ">${note.toFixed(1)}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function afficherMarkers() {
  markerLayer.clearLayers();
  markers = {};

  const ids = new Set(filtres.map((_, i) => i));

  filtres.forEach((r, i) => {
    if (!r.lat || !r.lng) return;

    const m = L.marker([r.lat, r.lng], { icon: iconeMarker(r.note_google) })
      .on('click', () => ouvrirFiche(r));

    m.bindTooltip(r.nom, { permanent: false, direction: 'top', offset: [0, -14] });
    markerLayer.addLayer(m);
    markers[i] = m;
  });
}

// ── LISTE ──
function afficherListe() {
  const liste = document.getElementById('liste');
  liste.innerHTML = '';

  filtres.slice(0, 100).forEach((r, i) => {
    const el = document.createElement('div');
    el.className = 'carte-resto';
    el.onclick = () => {
      ouvrirFiche(r);
      if (r.lat && r.lng) map.setView([r.lat, r.lng], 16);
    };

    const dist = r._dist ? `<span class="badge badge-dist">📍 ${r._dist < 1 ? Math.round(r._dist*1000)+'m' : r._dist.toFixed(1)+'km'}</span>` : '';
    const prix = r.prix ? `<span class="badge badge-prix">${r.prix}</span>` : '';
    const cuisine = r.cuisine ? `<span class="badge badge-cuisine">${r.cuisine}</span>` : '';

    el.innerHTML = `
      <div class="carte-resto-nom">${r.nom}</div>
      <div class="carte-resto-meta">
        <span class="badge badge-note">⭐ ${r.note_google}</span>
        ${cuisine}
        ${prix}
        ${dist}
      </div>
    `;
    liste.appendChild(el);
  });

  if (filtres.length > 100) {
    const more = document.createElement('div');
    more.style.cssText = 'text-align:center;padding:12px;font-size:12px;color:#888;';
    more.textContent = `+ ${filtres.length - 100} autres (affinez les filtres)`;
    liste.appendChild(more);
  }
}

// ── FICHE RESTAURANT ──
function ouvrirFiche(r) {
  const fiche = document.getElementById('fiche');
  fiche.classList.remove('hidden');

  const noteTa = r.note_tripadvisor ? `
    <div class="fiche-note">
      <div class="val">${r.note_tripadvisor}</div>
      <div class="lab">TripAdvisor</div>
    </div>` : '';

  const noteTf = r.note_thefork ? `
    <div class="fiche-note">
      <div class="val">${r.note_thefork}</div>
      <div class="lab">The Fork</div>
    </div>` : '';

  const siteBtn = r.site && !r.site.includes('google.com/maps') ?
    `<a href="${r.site}" target="_blank" class="fiche-btn">🌐 Site / Réserver</a>` :
    `<a href="https://www.google.com/maps/search/${encodeURIComponent(r.nom + ' Paris')}" target="_blank" class="fiche-btn">📍 Voir sur Maps</a>`;

  const dist = r._dist ? `<span>📍 À ${r._dist < 1 ? Math.round(r._dist*1000)+'m' : r._dist.toFixed(1)+'km'} de vous</span>` : '';

  document.getElementById('fiche-content').innerHTML = `
    <h2>${r.nom}</h2>
    <div class="fiche-notes">
      <div class="fiche-note">
        <div class="val">⭐ ${r.note_google}</div>
        <div class="lab">Google (${r.nb_avis || '?'} avis)</div>
      </div>
      ${noteTa}
      ${noteTf}
    </div>
    <div class="fiche-info">
      ${r.adresse ? `<span>📌 ${r.adresse}</span>` : ''}
      ${r.cuisine ? `<span>🍽️ ${r.cuisine}</span>` : ''}
      ${r.prix ? `<span>💶 ${r.prix}</span>` : ''}
      ${dist}
    </div>
    ${siteBtn}
  `;
}

function fermerFiche() {
  document.getElementById('fiche').classList.add('hidden');
}

// ── GÉOLOCALISATION ──
function geoLocaliser() {
  const btn = document.getElementById('btn-geo');
  btn.textContent = '⏳ Localisation...';

  navigator.geolocation.getCurrentPosition(
    pos => {
      positionUser = { lat: pos.coords.latitude, lng: pos.coords.longitude };

      // Marker position utilisateur
      L.marker([positionUser.lat, positionUser.lng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="width:16px;height:16px;border-radius:50%;background:#3498db;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>`,
          iconSize: [16,16], iconAnchor: [8,8],
        })
      }).addTo(map).bindTooltip('Vous êtes ici', { permanent: true, direction: 'top' });

      map.setView([positionUser.lat, positionUser.lng], 15);

      btn.textContent = '✅ Localisé';
      document.getElementById('tri').value = 'distance';
      appliquerFiltres();
    },
    err => {
      btn.textContent = '📍 Me géolocaliser';
      alert('Géolocalisation impossible. Autorisez l\'accès à votre position.');
    }
  );
}

// ── DISTANCE ──
function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
