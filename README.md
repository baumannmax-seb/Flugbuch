# ✈️ PilotLog – Digitales Flugbuch (PWA)

Eine eigenständige Web-App im Stil von mein-flugbuch.de / ul-flugbuch.com: digitales Flugbuch
plus GPS-Flugaufzeichnung mit **vollautomatischer Touch-&-Go-Erkennung** – ohne einen Knopf zu drücken.

## Funktionen

- **Flugbuch**: Flüge manuell eintragen oder per GPS aufzeichnen; gruppiert nach Jahr, mit Dauer, Landungen, T&G, Rolle, Nachtzeit, Bemerkung. Bearbeiten/Löschen/Export.
- **GPS-Aufzeichnung**: `watchPosition` mit hoher Genauigkeit, Wake-Lock (Bildschirm bleibt an), Vibration bei erkanntem T&G, Live-Karte (offline, Canvas), Höhen- & Geschwindigkeitsprofil, Ereignisliste.
- **Auto-Start / Auto-Stop**: Flug startet automatisch ab einstellbarer Geschwindigkeit (Default 58 km/h), stoppt automatisch nach 30 s unter 25 km/h.
- **Automatische Touch-&-Go-Erkennung** (`js/detector.js`): Zustandsautomat über geglättete GPS-Geschwindigkeit + Höhe:
  - Aufsetzen = Geschwindigkeit unter Landeschwelle (Default 68 km/h) nachweislich in der Luft + Sinkflug/geringe Höhe über Grund.
  - Wieder abheben über 83 km/h innerhalb von 22 s Bodenzeit → **Touch & Go** (zählt automatisch).
  - Länger am Boden / Stillstand ≥ 30 s → volle **Landung**.
  - Stop-and-Go wird korrekt als Landung + neuer Start gewertet, Rollen vor dem Start wird ignoriert.
- **ICAO-Autoerkennung**: Start- und Zielflugplatz werden per GPS aus der Flugplatzliste (oder eigenen Plätzen) erkannt.
- **Nachtflugzeit** automatisch (Sonnenuntergang + 30 min, LuftVO).
- **Statistik**: Gesamt/Jahr/12 Monate/90/30 Tage, pro Flugzeug, Top-Strecken, Recency (3 Landungen/90 Tage).
- **Daten**: JSON-Export/Import (inkl. Tracks), CSV-Export/Import (Semikolon, Excel-kompatibel), alles lokal im Browser (localStorage) – kein Server, keine Cloud.
- **PWA**: installierbar (Add to Home Screen), offline nutzbar via Service Worker.

## Starten

GPS (Geolocation API) erfordert einen **sicheren Kontext** (HTTPS oder localhost):

```bash
cd flugbuch
python3 -m http.server 8000
# Browser: http://localhost:8000
```

Auf dem Smartphone im Cockpit: die App einmal über HTTPS ausliefern (z. B. eigenes Hosting)
und dann als PWA installieren – danach funktioniert sie offline.

## Tests

```bash
node tests/detector.test.js
```

Simuliert GPS-Tracks (Platzrunde mit 3/5 Touch & Go, Stop-and-Go, Rollen-only, Langsamflug in 400 m)
und prüft, dass der Detektor T&G, Landungen, Auto-Start/Stop korrekt erkennt – plus Flugplatz- und Nachtberechnung.

## Aufbau

```
index.html          App-Shell
css/style.css       Dark-Cockpit-Theme
js/util.js          Geo, Zeiten, Sonnenauf-/untergang (Nacht), Helfer
js/airports.js      Flugplatzliste + Nächster-Platz-Suche
js/detector.js      T&G-/Auto-Start/Stop-Zustandsautomat (UMD, in Node testbar)
js/store.js         localStorage-Persistence
js/recorder.js      GPS-Recorder (Geolocation, Wake Lock, Zusammenfassung)
js/app.js           UI: Dashboard, Flugbuch, Flug-Detail, Statistik, Flugzeuge, Daten
tests/              Node-Tests mit simulierten Tracks
sw.js, manifest.webmanifest   PWA/Offline
```

## Hinweise

- Die Schwellen (km/h, Sekunden) sind in den Einstellungen anpassbar und gelten pro App, nicht pro Flugzeug.
- GPS-Höhe ist ungenau – die T&G-Erkennung stützt sich daher primär auf das Geschwindigkeitsprofil und nur sekundär auf die Höhe.
- Ein manueller "T&G +1"-Button existiert als Fallback während des Flugs; die erkannten Ereignisse landen automatisch im Flugbuch.

## Deployment (GitHub Pages) – App aufs Handy

1. Repo → *Settings → Pages → Source: „Deploy from a branch“* → Branch `vibe/flugbuch-app-846d29` (bzw. `main` nach Merge), Folder `/ (root)` → Save.
2. App erreichbar unter: `https://baumannmax-seb.github.io/Flugbuch/` (HTTPS – Voraussetzung für GPS auf dem Handy).
3. Am Handy öffnen → iOS Safari: *Teilen → „Zum Home-Bildschirm“*; Android Chrome: *Menü → „App installieren“*. Danach offline nutzbar, GPS funktioniert.
