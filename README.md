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

## Luftraumdaten (DAeC OpenAir) & Basiskarte

- Unter **Daten → Luftraum & Basiskarte** die DAeC-Datei laden: entweder direkt online („DAeC OpenAir laden“, lädt `2026_09_Airspace_Germany_OA1.txt`) oder als lokale `.txt` (OpenAir-Format, z. B. von daec.de heruntergeladen).
- `js/airspace.js` parst OpenAir (`AC/AN/AH/AL/V X=/DC/DP/DA/DB`), baut Polygone/Kreise und prüft per Point-in-Polygon + Höhenband (FL/ft/GND/UNL), ob die aktuelle Position in einem Gebiet liegt.
- Auf der Karte (Live + Flugdetail) werden Gebiete farbcodiert eingezeichnet (R/D/P rot, C/CTR magenta, TMZ/RMZ/TRA/TSA orange, G grün). Beim Einflug in R/D/C/CTR/TMZ/RMZ: Banner + Vibration + Toast.
- **Basiskarte**: optional OpenStreetMap-Kacheln (© OpenStreetMap-Mitwirkende), nur wenn online; offline zeichnet die App Track + Luftraum als Vektor (Web-Mercator-Projektion, `js/basemap.js`).
- Hinweis: DA/DB-Bögen werden als Sehnen vereinfacht; AGL-Grenzen werden näherungsweise als MSL behandelt. Luftraumdaten lokal gespeichert (localStorage), funktionieren also offline. AIRAC-Zyklus beachten – Datei regelmäßig aktualisieren.

## Vollbild-Moving-Map & eigene Kartendaten

- Während der Aufzeichnung: **⛶ Vollbild** auf der Live-Karte → Moving Map folgt dem Flugzeug (eigenes Dreieck mit Kurs), Zoom mit **+/−** (Z8–Z17, wird gespeichert), Maßstab unten links, Luftraum + Kacheln eingeblendet. Beenden mit ESC oder erneut ⛶.
- **Eigene Kacheln laden** (Daten → Karten-Kacheln): entweder einen **Kachel-Ordner** (`…/z/x/y.png`, per Ordner-Picker) oder eine **MBTiles-Datei** (SQLite; TMS-Zeilen werden korrekt nach XYZ umgerechnet). MBTiles braucht einmalig Internet (sql.js-WASM von CDN). Kacheln landen in der IndexedDB des Geräts und sind danach **offline** nutzbar.
- Kachel-Quelle: `auto` (lokal zuerst, OSM online als Fallback), `local` (nur offline), `osm` (nur online).
- **OpenAIP**: API-Key unter Daten → OpenAIP lokal speichern (bleibt im Browser des Geräts). „Flugplätze laden“ merged OpenAIP-Airports in die eigenen Plätze (ICAO-Autoerkennung), „Luftraum laden“ merged OpenAIP-Airspaces (GeoJSON → Polygone, FL/ft-Grenzen) mit den DAeC-Daten. Endpunkte: `api.core.openaip.net/api/airports`, `/api/airspaces?country=DE`, Key via Header `x-openaip-api-key`. Datenquelle: openaip.net.
