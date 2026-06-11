# Disagio in Sella 🚲

Generatore di itinerari ciclabili — sito **100% frontend statico**, pronto per **GitHub Pages** (gratis, nessun backend).

> *Pedala il bello, sopporta il resto.*

## Cosa fa

- **Landing cinematica** con menu a tendina (hamburger) a tutto schermo.
- **Itinerari** — 6 percorsi italiani con descrizione, foto, mappa interattiva e **traccia GPX scaricabile**.
- **Via Francigena**, sezione dedicata:
  - mappa dell'**intero cammino** (Gran San Bernardo → Roma);
  - **accoglienze ufficiali** filtrabili e ricercabili per *città, regione, stato*;
  - **generatore GPX** punto-a-punto: scegli partenza/arrivo come **stazione** o **ostello**, l'app trova l'indirizzo (Nominatim/OSM) e calcola la rotta ciclabile con **BRouter** (profilo *trekking · originale*). Traccia mostrata su mappa e scaricabile.

## Stack

HTML + CSS + JavaScript vanilla. Nessun build step.
- [Leaflet](https://leafletjs.com/) + tiles CARTO/OSM — mappe
- [Nominatim](https://nominatim.org/) — geocoding di stazioni e indirizzi
- [BRouter](https://brouter.de/) — routing ciclabile → GPX
- Font: Fraunces + Archivo (Google Fonts)

## Avvio locale

Serve un server statico (il `fetch` dei JSON non funziona da `file://`):

```bash
cd disagio-in-sella
python3 -m http.server 8000
# apri http://localhost:8000
```

## Deploy su GitHub Pages

1. Crea un repo e fai push di questa cartella sul branch `main`.
2. Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Il workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) pubblica il sito a ogni push.

## Dati

- `data/itineraries.json` — gli itinerari (modificabile a mano).
- `data/accommodations.json` — **dataset rappresentativo** delle accoglienze della Via Francigena, strutturato per essere sostituito/ampliato con i dati del [PDF ufficiale](https://www.viefrancigene.org/it/servizi). Ogni voce ha `name, type, city, region, country, address, lat, lon, phone`.

## Note

- Nominatim e BRouter sono servizi pubblici gratuiti: usali con parsimonia (uso personale / volumi bassi).
- Il tracciato della Via Francigena sulla mappa è **rappresentativo**; la fonte ufficiale è [viefrancigene.org](https://www.viefrancigene.org/it/home#mappa).

---

made with ♥ by **wakephul**
