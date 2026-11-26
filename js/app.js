(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var esc = Util.escapeHtml;
  var recorder = new Recorder.Recorder({
    settings: function () { return Store.getSettings(); },
    onStart: function () { toast('GPS-Aufzeichnung gestartet'); render(); startLiveTick(); },
    onPoint: function (pt) { scheduleLiveDraw(); checkAirspace(pt); },
    onEvent: function (e) {
      if (e.type === 'flightstart') toast('✈️ Flug automatisch erkannt (Auto-Start)');
      if (e.type === 'touchandgo') toast('🟠 Touch & Go erkannt (' + (Detector.summarize(recorder.det.events).touchAndGos + recorder.manualTg) + ')');
      if (e.type === 'landing') toast('🟢 Landung erkannt');
      if (e.type === 'flightstop') toast('⏹ Auto-Stop – Flug wird gespeichert…');
      scheduleLiveDraw();
    },
    onError: function (err) {
      toast('GPS-Fehler: ' + (err && err.message ? err.message : 'unbekannt') + ' – bitte Standortzugriff erlauben (HTTPS/localhost nötig)');
    },
    onStop: function (flight, reason) {
      stopLiveTick();
      if (demoTimer) { clearInterval(demoTimer); demoTimer = null; }
      var saved = Store.addFlight(flight);
      toast('Flug Nr. ' + saved.no + ' gespeichert: ' + (saved.dep || '?') + ' → ' + (saved.arr || '?') +
        ', ' + Util.fmtDur(saved.durationSec) + ', ' + saved.landings + ' Landungen (' + saved.touchAndGos + ' T&G)');
      location.hash = '#/flug?id=' + saved.id;
    }
  });
  var liveTick = null;
  var drawPending = false;
  var demoTimer = null;
  var lastAirKey = '';
  var mapFullscreen = false;
  var lastVario = 0;
  Airspace.load();
  function startLiveTick() {
    stopLiveTick();
    liveTick = setInterval(function () { if (recorder.active) renderLiveNumbers(); }, 1000);
  }
  function stopLiveTick() { if (liveTick) clearInterval(liveTick); liveTick = null; }

  function startDemo() {
    if (recorder.active) return;
    var pts = SimDemo.generate(3);
    var base = Date.now();
    var i = 0;
    recorder.start($('#start-aircraft') ? $('#start-aircraft').value || null : null, { demo: true });
    toast('🧪 Demo läuft: simulierte Platzrunde mit 3 Touch & Go (Zeitraffer)');
    demoTimer = setInterval(function () {
      if (!recorder.active) { clearInterval(demoTimer); demoTimer = null; return; }
      for (var n = 0; n < 8 && i < pts.length; n++) {
        var p = pts[i++];
        recorder._onPos({
          timestamp: base + p.t,
          coords: { latitude: p.lat, longitude: p.lon, altitude: p.alt, accuracy: 5, speed: p.speed, heading: p.heading }
        });
      }
    }, 100);
  }
  function scheduleLiveDraw() {
    if (drawPending) return;
    drawPending = true;
    setTimeout(function () { drawPending = false; if (recorder.active) renderLiveCharts(); }, 700);
  }
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.add('hidden'); }, 4200);
  }
  function flightTs(f) {
    if (f.depTs) return f.depTs;
    var m = Util.parseClockMin(f.depTime);
    if (f.date && m != null) return Util.clockToDate(f.date, m).getTime();
    return Date.parse(f.date + 'T00:00:00') || 0;
  }
  function durationSec(f) {
    if (f.durationSec != null) return f.durationSec;
    var a = Util.parseClockMin(f.depTime), b = Util.parseClockMin(f.arrTime);
    if (a == null || b == null) return 0;
    var d = b - a; if (d < 0) d += 24 * 60;
    return d * 60;
  }
  function aircraftLabel(reg) {
    if (!reg) return '—';
    var a = Store.listAircraft().find(function (x) { return x.reg === reg; });
    return a ? reg + (a.type ? ' (' + a.type + ')' : '') : reg;
  }
  function route() {
    var h = location.hash || '#/dashboard';
    var m = /^#\/([a-z]+)(?:\?(.*))?$/.exec(h);
    var view = m ? m[1] : 'dashboard';
    var params = {};
    if (m && m[2]) m[2].split('&').forEach(function (kv) {
      var p = kv.split('='); params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
    });
    if (!$('#view-' + view)) view = 'dashboard';
    $$('.view').forEach(function (v) { v.classList.remove('active'); });
    $('#view-' + view).classList.add('active');
    $$('.nav a').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-nav') === view);
    });
    if (view === 'dashboard') renderDashboard();
    else if (view === 'buch') renderBuch();
    else if (view === 'flug') renderFlug(params.id);
    else if (view === 'statistik') renderStatistik();
    else if (view === 'flugzeuge') renderFlugzeuge();
    else if (view === 'daten') renderDaten();
    window.scrollTo(0, 0);
  }
  function render() { route(); }
  function renderDashboard() {
    var v = $('#view-dashboard');
    var flights = Store.listFlights();
    var html = '';
    if (recorder.active) {
      html += livePanelHtml();
    } else {
      var ac = Store.listAircraft();
      var s = Store.getSettings();
      var opts = '<option value="">— ohne Flugzeug —</option>' + ac.map(function (a) {
        return '<option value="' + esc(a.reg) + '"' + (s.defaultAircraft === a.reg ? ' selected' : '') + '>' +
          esc(a.reg + (a.type ? ' · ' + a.type : '')) + '</option>';
      }).join('');
      html += '<div class="card"><h2>Flug starten</h2>' +
        '<p class="hint">GPS-Tracking beginnt sofort. Auto-Start/Auto-Stop und Touch-&-Go-Erkennung laufen im Hintergrund – du musst nichts drücken. ' +
        (s.autoStart ? 'Der Flug startet automatisch ab ' + s.startKmh + ' km/h.' : 'Der Flug läuft ab dem manuellen Start.') + '</p>' +
        '<label class="f"><span>Flugzeug</span><select id="start-aircraft">' + opts + '</select></label>' +
        '<button class="btn big green" id="btn-start">▶ Flug starten</button>' +
        '<button class="btn secondary big" id="btn-demo" style="margin-top:8px">🧪 Demo-Flug simulieren (3 Touch &amp; Go, beschleunigt)</button>' +
        '<p class="hint">Demo: simulierter GPS-Track läuft in Zeitraffer durch die echte Erkennung – ideal zum Testen ohne Flugzeug.</p></div>';
    }
    var now = Date.now();
    var d90 = now - 90 * 86400000, d30 = now - 30 * 86400000;
    var t90 = totals(flights, d90), t30 = totals(flights, d30), tAll = totals(flights, 0);
    html += '<div class="card"><h2>Übersicht</h2><div class="statgrid">' +
      stat(tAll.hours, 'Std. gesamt') + stat(tAll.flights, 'Flüge gesamt') +
      stat(tAll.landings, 'Landungen gesamt') +
      stat(t90.hours, 'Std. 90 Tage') + stat(t90.landings, 'Landungen 90 Tage', t90.landings >= 3 ? 'Recency ✓' : 'Recency: ' + t90.landings + '/3') +
      stat(t30.hours, 'Std. 30 Tage') +
      '</div></div>';
    html += '<div class="card"><h2>Letzte Flüge</h2>' + recentListHtml(flights.slice(0, 6)) + '</div>';
    v.innerHTML = html;
    var bs = $('#btn-start');
    if (bs) bs.onclick = function () {
      recorder.start($('#start-aircraft').value || null);
    };
    var bd = $('#btn-demo');
    if (bd) bd.onclick = startDemo;
    if (recorder.active) { renderLiveNumbers(); renderLiveCharts(); startLiveTick(); attachLiveMapButtons(); }
  }
  function stat(val, label, sub) {
    return '<div class="stat"><div class="v">' + esc(val) + '</div><div class="l">' + esc(label) +
      (sub ? '<br>' + esc(sub) : '') + '</div></div>';
  }
  function recentListHtml(flights) {
    if (!flights.length) return '<p class="hint">Noch keine Flüge. Starte den ersten Flug über GPS oder lege ihn manuell an.</p>';
    return '<table class="log"><tr><th>Nr</th><th>Datum</th><th>Strecke</th><th>Dauer</th><th>LDG</th><th>T&G</th></tr>' +
      flights.map(rowHtml).join('') + '</table>';
  }
  function rowHtml(f) {
    return '<tr class="flight" data-id="' + esc(f.id) + '">' +
      '<td class="num">' + esc(f.no || '') + '</td>' +
      '<td>' + esc(f.date) + '</td>' +
      '<td>' + esc(f.dep || '?') + ' → ' + esc(f.arr || '?') + '</td>' +
      '<td class="num">' + Util.fmtDur(durationSec(f)) + '</td>' +
      '<td class="num">' + (f.landings || 0) + '</td>' +
      '<td class="num">' + (f.touchAndGos || 0) + '</td></tr>';
  }
  function livePanelHtml() {
    var s = Detector.summarize(recorder.det ? recorder.det.events : []);
    return '<div class="live-banner"><span class="live-dot"></span><strong>Aufzeichnung läuft</strong>' +
      '<span class="hint" id="live-state">' + (recorder.det && recorder.det.state === 'CANDIDATE' ? 'Aufsetzen erkannt…' : (recorder.det && recorder.det.flightStarted ? 'in der Luft' : 'am Boden / rollend')) + '</span></div>' +
      '<div id="as-banner" class="hint"></div>' +
      '<div class="card"><div class="statgrid">' +
      '<div class="stat"><div class="v mono" id="lv-time">00:00</div><div class="l">Flugzeit</div></div>' +
      '<div class="stat"><div class="v mono" id="lv-speed">0</div><div class="l">km/h</div></div>' +
      '<div class="stat"><div class="v mono" id="lv-alt">0</div><div class="l">Höhe m</div></div>' +
      '<div class="stat"><div class="v mono" id="lv-dist">0.0</div><div class="l">km</div></div>' +
      '<div class="stat"><div class="v tg mono" id="lv-tg">' + (s.touchAndGos + recorder.manualTg) + '</div><div class="l">Touch &amp; Go (auto)</div></div>' +
      '<div class="stat"><div class="v ldg mono" id="lv-ldg">' + s.landings + '</div><div class="l">Landungen gesamt</div></div>' +
      '</div>' +
      '<div class="row" style="margin-top:12px">' +
      '<button class="btn danger" id="btn-stop">⏹ Flug stoppen &amp; speichern</button>' +
      '<button class="btn secondary" id="btn-tg">🟠 T&amp;G manuell +1</button>' +
      '<button class="btn secondary" id="btn-discard">Verwerfen</button>' +
      '</div></div>' +
      '<div class="card"><div class="row"><h2 class="grow">Live-Karte</h2>' +
      '<button class="btn small secondary" id="btn-fs" title="Flugmodus: Vollbild-Moving-Map mit Instrumenten">🧭 Flugmodus</button></div>' +
      '<div class="mapwrap" id="live-mapwrap"><canvas id="live-map" class="chart" style="height:280px"></canvas>' +
      '<div class="instruments" id="instruments">' +
      '<div class="ins-top"><span id="im-air" class="ins-air"></span>' +
      '<div class="ins-btns">' +
      '<button class="ins-btn" id="btn-rot" title="Kartenrotation Nord/HDG">N↑</button>' +
      '<button class="ins-btn" id="btn-zoom-out" title="Zoom raus">−</button>' +
      '<button class="ins-btn" id="btn-zoom-in" title="Zoom rein">+</button>' +
      '<button class="ins-btn" id="btn-exit" title="Vollbild beenden">✕</button>' +
      '</div></div>' +
      '<div class="ins-bottom">' +
      '<div class="ins-cell big"><div class="ins-v" id="im-speed">0</div><div class="ins-l">km/h</div></div>' +
      '<div class="ins-cell big"><div class="ins-v" id="im-alt">0</div><div class="ins-l">m MSL · <span id="im-agl">0</span> AGL</div></div>' +
      '<div class="ins-cell"><div class="ins-v" id="im-hdg">···</div><div class="ins-l">HDG</div></div>' +
      '<div class="ins-cell"><div class="ins-v" id="im-vario">0.0</div><div class="ins-l">m/s Vario</div></div>' +
      '<div class="ins-cell"><div class="ins-v mono" id="im-time">00:00</div><div class="ins-l">Flugzeit</div></div>' +
      '<div class="ins-cell"><div class="ins-v mono" id="im-dist">0.0</div><div class="ins-l">km</div></div>' +
      '<div class="ins-cell"><div class="ins-v tg" id="im-tg">0</div><div class="ins-l">T&amp;G</div></div>' +
      '<div class="ins-cell"><div class="ins-v ldg" id="im-ldg">0</div><div class="ins-l">LDG</div></div>' +
      '</div></div></div></div>' +
      '<div class="card"><h2>Höhen- &amp; Geschwindigkeitsprofil</h2><canvas id="live-profile" class="chart" style="height:180px"></canvas></div>' +
      '<div class="card"><h2>Ereignisse</h2><ul class="events" id="live-events"></ul></div>';
  }
  function renderLiveNumbers() {
    if (!recorder.active) return;
    var pts = recorder.points;
    var evs = recorder.det ? recorder.det.events : [];
    var s = Detector.summarize(evs);
    var last = pts[pts.length - 1];
    var t0 = s.firstTakeoff || s.flightstart || recorder.startedAt;
    var el = function (id) { return document.getElementById(id); };
    if (el('lv-time')) {
      var lastT = last ? last.t : t0;
      el('lv-time').textContent = Util.fmtDur(Math.max(0, (lastT - t0) / 1000));
    }
    if (el('lv-speed')) el('lv-speed').textContent = last && last.speed != null ? Math.round(Util.kmh(last.speed)) : '—';
    if (el('lv-alt')) el('lv-alt').textContent = last && last.alt != null ? Math.round(last.alt) : '—';
    var dist = 0;
    for (var i = 1; i < pts.length; i++) dist += Util.haversineM(pts[i - 1], pts[i]);
    if (el('lv-dist')) el('lv-dist').textContent = (dist / 1000).toFixed(1);
    if (el('lv-tg')) el('lv-tg').textContent = s.touchAndGos + recorder.manualTg;
    if (el('lv-ldg')) el('lv-ldg').textContent = s.landings;
    var st = el('live-state');
    if (st) st.textContent = recorder.det.state === 'CANDIDATE' ? 'Aufsetzen erkannt…' : (recorder.det.flightStarted ? 'in der Luft' : 'am Boden / rollend');
    var ul = el('live-events');
    if (ul) ul.innerHTML = evs.slice().reverse().map(eventLiHtml).join('');
    if (el('im-speed')) el('im-speed').textContent = last && last.speed != null ? Math.round(Util.kmh(last.speed)) : '—';
    if (el('im-alt')) el('im-alt').textContent = last && last.alt != null ? Math.round(last.alt) : '—';
    if (el('im-hdg')) el('im-hdg').textContent = last && last.heading != null ? String(Math.round(last.heading)).padStart(3, '0') + '°' : '···';
    var minAlt = null;
    for (var q = 0; q < pts.length; q++) { if (pts[q].alt != null && (minAlt === null || pts[q].alt < minAlt)) minAlt = pts[q].alt; }
    if (el('im-agl')) el('im-agl').textContent = (last && last.alt != null && minAlt != null) ? Math.max(0, Math.round(last.alt - minAlt)) : '—';
    var vario = 0;
    if (last && last.alt != null && pts.length > 1) {
      var ref = null;
      for (var r = pts.length - 1; r >= 0; r--) { if (pts[r].t <= last.t - 4000) { ref = pts[r]; break; } }
      if (ref && ref.alt != null) { var dtv = (last.t - ref.t) / 1000; if (dtv > 0) vario = (last.alt - ref.alt) / dtv; }
    }
    lastVario = lastVario * 0.6 + vario * 0.4;
    if (el('im-vario')) el('im-vario').textContent = (lastVario >= 0 ? '+' : '') + lastVario.toFixed(1);
    if (el('im-time')) { var lt2 = last ? last.t : t0; el('im-time').textContent = Util.fmtDur(Math.max(0, (lt2 - t0) / 1000)); }
    if (el('im-dist')) el('im-dist').textContent = (dist / 1000).toFixed(1);
    if (el('im-tg')) el('im-tg').textContent = s.touchAndGos + recorder.manualTg;
    if (el('im-ldg')) el('im-ldg').textContent = s.landings;
  }
  function altLabel(a) {
    var al = a.al == null ? 0 : Math.round(a.al);
    var ah = a.ah == null || a.ah >= 1e8 ? 'UNL' : Math.round(a.ah);
    return al + '–' + ah + ' m';
  }
  function checkAirspace(pt) {
    var st = Store.getSettings();
    var el = document.getElementById('as-banner');
    if (!st.airspaceWarn || !Airspace.areas.length) { if (el) { el.textContent = ''; el.className = 'hint'; } return; }
    var hits = Airspace.check(pt.lat, pt.lon, pt.alt != null ? pt.alt : null);
    var top = hits[0] || null;
    if (el) {
      if (top) {
        el.textContent = '⚠ Luftraum: ' + top.name + ' (' + top.cls + ', ' + altLabel(top) + ')';
        el.className = Airspace.warnLevel(top.cls) >= 3 ? 'as-warn strong' : 'as-warn';
      } else { el.textContent = ''; el.className = 'hint'; }
    }
    var ia = document.getElementById('im-air');
    if (ia) ia.textContent = top ? ('⚠ ' + top.name + ' (' + top.cls + ')') : '';
    var key = top ? top.cls + ':' + top.name : '';
    if (key !== lastAirKey) {
      lastAirKey = key;
      if (top && Airspace.warnLevel(top.cls) >= 2) {
        toast('⚠ Einflug: ' + top.name + ' (' + top.cls + ')');
        try { if (navigator.vibrate) navigator.vibrate([150, 80, 150]); } catch (_) {}
      }
    }
  }
  function eventLiHtml(e) {
    var labels = { takeoff: '🛫 Start', touchandgo: '🟠 Touch & Go', landing: '🟢 Landung', flightstart: '▶ Auto-Start', flightstop: '⏹ Auto-Stop', manualtg: '🟠 T&G manuell' };
    var cls = { touchandgo: 'tg', manualtg: 'tg', landing: 'ldg', takeoff: 'to' }[e.type] || '';
    return '<li class="' + cls + '"><span>' + (labels[e.type] || e.type) + '</span><span class="mono">' + esc(Util.fmtClock(new Date(e.t))) + '</span></li>';
  }
  function renderLiveCharts() {
    var map = document.getElementById('live-map');
    var prof = document.getElementById('live-profile');
    if (map) {
      if (mapFullscreen) drawMovingMap(map, recorder.points, recorder.det ? recorder.det.events : []);
      else drawMap(map, recorder.points, recorder.det ? recorder.det.events : []);
    }
    if (prof && !mapFullscreen) drawProfile(prof, recorder.points);
  }
  function attachLiveMapButtons() {
    var fs = document.getElementById('btn-fs');
    if (fs) fs.onclick = function () {
      var wrap = document.getElementById('live-mapwrap');
      if (!wrap) return;
      if (document.fullscreenElement) { document.exitFullscreen(); return; }
      (wrap.requestFullscreen || wrap.webkitRequestFullscreen || function () {}).call(wrap);
    };
    var zi = document.getElementById('btn-zoom-in');
    var zo = document.getElementById('btn-zoom-out');
    if (zi) zi.onclick = function () { bumpZoom(1); };
    if (zo) zo.onclick = function () { bumpZoom(-1); };
    var rot = document.getElementById('btn-rot');
    if (rot) rot.onclick = function () {
      var s = Store.getSettings();
      var next = (s.mmRotate === 'hdg') ? 'north' : 'hdg';
      Store.saveSettings({ mmRotate: next });
      rot.textContent = next === 'hdg' ? 'HDG↑' : 'N↑';
      renderLiveCharts();
    };
    var rot0 = document.getElementById('btn-rot');
    if (rot0) rot0.textContent = (Store.getSettings().mmRotate === 'hdg') ? 'HDG↑' : 'N↑';
    var ex = document.getElementById('btn-exit');
    if (ex) ex.onclick = function () { if (document.fullscreenElement) document.exitFullscreen(); };
  }
  function bumpZoom(d) {
    var s = Store.getSettings();
    var z = Math.max(8, Math.min(17, (s.mmZoom || 13) + d));
    Store.saveSettings({ mmZoom: z });
    renderLiveCharts();
  }
  function mercY(lat) { return 180 / Math.PI * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)); }
  function classColor(cls) {
    var c = (cls || '').toUpperCase();
    if (c === 'R' || c === 'D' || c === 'P') return '255,80,80';
    if (c === 'C' || c === 'CTR') return '220,90,220';
    if (c === 'TMZ' || c === 'RMZ' || c === 'TRA' || c === 'TSA') return '255,176,32';
    if (c === 'G') return '61,220,132';
    return '140,160,190';
  }
  function drawAirspace(ctx, view) {
    var areas = Airspace.areas;
    for (var i = 0; i < areas.length; i++) {
      var a = areas[i];
      var ring = a.ring;
      if (!ring || ring.length < 3) continue;
      var rMinLat = Infinity, rMaxLat = -Infinity, rMinLon = Infinity, rMaxLon = -Infinity;
      for (var j = 0; j < ring.length; j++) {
        rMinLat = Math.min(rMinLat, ring[j].lat); rMaxLat = Math.max(rMaxLat, ring[j].lat);
        rMinLon = Math.min(rMinLon, ring[j].lon); rMaxLon = Math.max(rMaxLon, ring[j].lon);
      }
      if (rMaxLat < view.minLat || rMinLat > view.maxLat || rMaxLon < view.minLon || rMinLon > view.maxLon) continue;
      var col = classColor(a.cls);
      ctx.beginPath();
      for (var k = 0; k < ring.length; k++) {
        var pp = view.P(ring[k].lon, ring[k].lat);
        if (k) ctx.lineTo(pp.x, pp.y); else ctx.moveTo(pp.x, pp.y);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(' + col + ',.10)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(' + col + ',.55)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      var cx = 0, cy = 0;
      for (var m = 0; m < ring.length; m++) { cx += ring[m].lon; cy += ring[m].lat; }
      cx /= ring.length; cy /= ring.length;
      var lp = view.P(cx, cy);
      var lx = lp.x, ly = lp.y;
      if (lx > 4 && lx < view.w - 4 && ly > 10 && ly < view.h - 4) {
        ctx.font = '10px sans-serif';
        ctx.fillStyle = 'rgba(' + col + ',.95)';
        ctx.fillText((a.name || a.cls) + ' ' + a.cls, lx + 3, ly - 3);
      }
    }
  }
  function drawMap(canvas, pts, events) {
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!pts || pts.length < 2) {
      ctx.fillStyle = '#8fa1bd'; ctx.font = '13px sans-serif';
      ctx.fillText('Warte auf GPS…', 12, 22);
      return;
    }
    var minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    pts.forEach(function (p) {
      minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
      minLon = Math.min(minLon, p.lon); maxLon = Math.max(maxLon, p.lon);
    });
    var pad = 26;
    var spanX = Math.max(maxLon - minLon, 1e-5);
    var spanY = Math.max(mercY(maxLat) - mercY(minLat), 1e-5);
    var s = Math.min((w - 2 * pad) / spanX, (h - 2 * pad) / spanY);
    var ox = w / 2 - s * (minLon + maxLon) / 2;
    var oy = h / 2 + s * (mercY(minLat) + mercY(maxLat)) / 2;
    var X = function (lon) { return ox + s * lon; };
    var Y = function (lat) { return oy - s * mercY(lat); };
    var view = { X: X, Y: Y, P: function (lon, lat) { return { x: X(lon), y: Y(lat) }; }, s: s, rot: 0, w: w, h: h, minLon: minLon, maxLon: maxLon, minLat: minLat, maxLat: maxLat };
    var st = Store.getSettings();
    if (st.basemap && window.Basemap) {
      Basemap.draw(ctx, view, {
        source: st.tileSource || 'auto',
        zoom: view.zoom,
        onLoaded: function () {
          if (!canvas._tileRedraw) {
            canvas._tileRedraw = true;
            setTimeout(function () { canvas._tileRedraw = false; drawMap(canvas, pts, events); }, 300);
          }
        }
      });
    }
    ctx.strokeStyle = 'rgba(120,140,170,.15)';
    ctx.lineWidth = 1;
    for (var g = 1; g < 4; g++) {
      ctx.beginPath(); ctx.moveTo(0, h * g / 4); ctx.lineTo(w, h * g / 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w * g / 4, 0); ctx.lineTo(w * g / 4, h); ctx.stroke();
    }
    if (st.airspaceMap && Airspace.areas.length) drawAirspace(ctx, view);
    ctx.beginPath();
    pts.forEach(function (p, i) { if (i) ctx.lineTo(X(p.lon), Y(p.lat)); else ctx.moveTo(X(p.lon), Y(p.lat)); });
    ctx.strokeStyle = '#4da3ff'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
    var p0 = pts[0], p1 = pts[pts.length - 1];
    marker(ctx, X(p0.lon), Y(p0.lat), '#3ddc84', 'S');
    marker(ctx, X(p1.lon), Y(p1.lat), '#ff5c5c', 'E');
    (events || []).forEach(function (e) {
      if (e.lat == null) return;
      if (e.type === 'touchandgo') dot(ctx, X(e.lon), Y(e.lat), '#ffb020');
      else if (e.type === 'landing') square(ctx, X(e.lon), Y(e.lat), '#3ddc84');
      else if (e.type === 'takeoff') dot(ctx, X(e.lon), Y(e.lat), '#4da3ff');
    });
    ctx.fillStyle = '#8fa1bd'; ctx.font = '12px sans-serif';
    ctx.fillText('N ↑', w - 22, 18);
  }
  function invMercY(my) { return 180 / Math.PI * (2 * Math.atan(Math.exp(my * Math.PI / 180)) - Math.PI / 2); }
  function drawMovingMap(canvas, pts, events) {
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var c = pts && pts.length ? pts[pts.length - 1] : null;
    if (!c) {
      ctx.fillStyle = '#8fa1bd'; ctx.font = '13px sans-serif';
      ctx.fillText('Warte auf GPS…', 12, 22);
      return;
    }
    var st = Store.getSettings();
    var z = st.mmZoom || 13;
    var cosLat = Math.cos(c.lat * Math.PI / 180);
    var mpp = 156543.03392 * cosLat / Math.pow(2, z);
    var halfLonDeg = mpp * (w / 2) / (111320 * cosLat);
    var s = (w / 2) / halfLonDeg;
    var ox = w / 2 - s * c.lon;
    var oy = h / 2 + s * mercY(c.lat);
    var rot = (st.mmRotate === 'hdg' && c.heading != null) ? -c.heading * Math.PI / 180 : 0;
    var cx = w / 2, cy = h / 2, cosR = Math.cos(rot), sinR = Math.sin(rot);
    function P(lon, lat) {
      var x = ox + s * lon - cx, y = oy - s * mercY(lat) - cy;
      return { x: cx + x * cosR - y * sinR, y: cy + x * sinR + y * cosR };
    }
    var ex = 1.7;
    var view = {
      P: P, s: s, rot: rot, w: w, h: h, zoom: z,
      minLon: c.lon - halfLonDeg * ex, maxLon: c.lon + halfLonDeg * ex,
      minLat: invMercY((oy - h * ex) / s), maxLat: invMercY((oy + h * ex) / s)
    };
    if (st.basemap && window.Basemap) {
      Basemap.draw(ctx, view, {
        source: st.tileSource || 'auto',
        zoom: z,
        onLoaded: function () {
          if (!canvas._tileRedraw) {
            canvas._tileRedraw = true;
            setTimeout(function () { canvas._tileRedraw = false; drawMovingMap(canvas, pts, events); }, 300);
          }
        }
      });
    }
    if (st.airspaceMap && Airspace.areas.length) drawAirspace(ctx, view);
    if (pts && pts.length > 1) {
      ctx.beginPath();
      pts.forEach(function (p, i) {
        var pp = P(p.lon, p.lat);
        if (i) ctx.lineTo(pp.x, pp.y); else ctx.moveTo(pp.x, pp.y);
      });
      ctx.strokeStyle = '#4da3ff'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
    }
    (events || []).forEach(function (e) {
      if (e.lat == null) return;
      var ep = P(e.lon, e.lat);
      if (e.type === 'touchandgo') dot(ctx, ep.x, ep.y, '#ffb020');
      else if (e.type === 'landing') square(ctx, ep.x, ep.y, '#3ddc84');
    });
    var me = P(c.lon, c.lat);
    ctx.save();
    ctx.translate(me.x, me.y);
    ctx.rotate(rot !== 0 ? 0 : (c.heading != null ? c.heading * Math.PI / 180 : 0));
    ctx.beginPath();
    ctx.moveTo(0, -11); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fillStyle = '#ffb020';
    ctx.fill();
    ctx.strokeStyle = '#04121f'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
    var nice = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
    var barM = nice[0];
    for (var i = 0; i < nice.length; i++) { if (nice[i] / mpp <= w / 4) barM = nice[i]; }
    var barPx = barM / mpp;
    ctx.strokeStyle = '#e8eef7'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(14, h - 16); ctx.lineTo(14 + barPx, h - 16); ctx.stroke();
    ctx.fillStyle = '#e8eef7'; ctx.font = '11px sans-serif';
    ctx.fillText(barM >= 1000 ? (barM / 1000) + ' km' : barM + ' m', 14, h - 22);
    ctx.fillText('Z' + z, w - 34, h - 8);
    if (rot !== 0) {
      ctx.save();
      ctx.translate(w - 26, 26);
      ctx.rotate(rot);
      ctx.strokeStyle = '#e8eef7'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(0, -8); ctx.stroke();
      ctx.fillStyle = '#e8eef7'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('N', 0, -12);
      ctx.restore();
      ctx.textAlign = 'left';
    } else {
      ctx.fillStyle = '#8fa1bd'; ctx.font = '12px sans-serif';
      ctx.fillText('N ↑', w - 22, 18);
    }
  }
  function marker(ctx, x, y, color, label) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#04121f'; ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 0.5);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }
  function dot(ctx, x, y, color) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0b1220'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  function square(ctx, x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x - 4.5, y - 4.5, 9, 9);
  }
  function drawProfile(canvas, pts) {
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!pts || pts.length < 2) { ctx.fillStyle = '#8fa1bd'; ctx.fillText('Noch keine Daten…', 12, 22); return; }
    var t0 = pts[0].t, t1 = pts[pts.length - 1].t;
    var maxAlt = 1, maxSpd = 1;
    pts.forEach(function (p) {
      if (p.alt != null) maxAlt = Math.max(maxAlt, p.alt);
      if (p.speed != null) maxSpd = Math.max(maxSpd, p.speed);
    });
    maxSpd = Util.kmh(maxSpd);
    var padL = 40, padR = 40, padT = 10, padB = 18;
    var iw = w - padL - padR, ih = h - padT - padB;
    var X = function (t) { return padL + iw * (t - t0) / Math.max(1, t1 - t0); };
    var Ya = function (alt) { return padT + ih * (1 - alt / maxAlt); };
    var Ys = function (kmh) { return padT + ih * (1 - kmh / maxSpd); };
    ctx.strokeStyle = 'rgba(120,140,170,.15)';
    ctx.fillStyle = '#8fa1bd'; ctx.font = '11px sans-serif';
    for (var g = 0; g <= 4; g++) {
      var y = padT + ih * g / 4;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      ctx.fillText(Math.round(maxAlt * (1 - g / 4)) + ' m', 4, y + 4);
      ctx.fillText(Math.round(maxSpd * (1 - g / 4)) + '', w - padR + 6, y + 4);
    }
    ctx.fillText('km/h', w - padR + 6, padT - 2 + 4);
    ctx.beginPath();
    pts.forEach(function (p, i) {
      if (p.alt == null) return;
      if (i) ctx.lineTo(X(p.t), Ya(p.alt)); else ctx.moveTo(X(p.t), Ya(p.alt));
    });
    ctx.strokeStyle = '#4da3ff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.lineTo(X(t1), padT + ih); ctx.lineTo(X(t0), padT + ih); ctx.closePath();
    ctx.fillStyle = 'rgba(77,163,255,.18)'; ctx.fill();
    ctx.beginPath();
    var started = false;
    pts.forEach(function (p) {
      if (p.speed == null) return;
      var x = X(p.t), y = Ys(Util.kmh(p.speed));
      if (started) ctx.lineTo(x, y); else { ctx.moveTo(x, y); started = true; }
    });
    ctx.strokeStyle = '#ff5c5c'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  function renderBuch() {
    var v = $('#view-buch');
    var flights = Store.listFlights();
    var html = '<div class="card"><div class="row"><h2 class="grow">Flugbuch</h2>' +
      '<button class="btn small" id="btn-new">+ Neuer Flug</button>' +
      '<button class="btn small secondary" id="btn-new-gps">▶ GPS-Flug</button></div>';
    if (!flights.length) {
      html += '<p class="hint">Noch keine Einträge.</p></div>';
    } else {
      var byYear = {};
      flights.forEach(function (f) {
        var y = (f.date || '?').slice(0, 4);
        (byYear[y] = byYear[y] || []).push(f);
      });
      var years = Object.keys(byYear).sort().reverse();
      html += years.map(function (y) {
        var list = byYear[y];
        var th = totals(list, 0);
        return '<table class="log"><tr class="year"><td colspan="8">' + esc(y) +
          ' — ' + list.length + ' Flüge · ' + Util.fmtDur(th.seconds) + ' · ' + th.landings + ' LDG</td></tr>' +
          '<tr><th>Nr</th><th>Datum</th><th>Strecke</th><th>Ab</th><th>An</th><th>Dauer</th><th>LDG</th><th>T&amp;G</th></tr>' +
          list.map(rowHtml).join('') + '</table>';
      }).join('');
      html += '</div>';
    }
    v.innerHTML = html;
    $('#btn-new').onclick = function () { openFlightModal(null); };
    $('#btn-new-gps').onclick = function () { location.hash = '#/dashboard'; };
    $$('#view-buch tr.flight').forEach(function (tr) {
      tr.onclick = function () { location.hash = '#/flug?id=' + tr.getAttribute('data-id'); };
    });
  }
  function totals(flights, sinceTs) {
    var t = { flights: 0, seconds: 0, landings: 0, tg: 0, nightSec: 0 };
    flights.forEach(function (f) {
      if (sinceTs && flightTs(f) < sinceTs) return;
      t.flights++;
      t.seconds += durationSec(f);
      t.landings += f.landings || 0;
      t.tg += f.touchAndGos || 0;
      t.nightSec += f.nightSec || 0;
    });
    t.hours = Util.fmtDur(t.seconds);
    return t;
  }
  function renderFlug(id) {
    var v = $('#view-flug');
    if (!id) {
      if (recorder.active) { location.hash = '#/dashboard'; return; }
      v.innerHTML = '<div class="card"><h2>Flug</h2><p class="hint">Kein Flug ausgewählt. Starte einen GPS-Flug über das Dashboard oder wähle einen Flug im Flugbuch.</p></div>';
      return;
    }
    var f = Store.getFlight(id);
    if (!f) { v.innerHTML = '<div class="card">Flug nicht gefunden.</div>'; return; }
    var s = Detector.summarize(f.events || []);
    v.innerHTML =
      '<div class="card"><div class="row"><h2 class="grow">Flug Nr. ' + esc(f.no || '') + ' · ' + esc(f.date) + '</h2>' +
      (f.auto ? '<span class="tag auto">GPS auto</span>' : '<span class="tag">manuell</span>') +
      '<button class="btn small secondary" id="btn-edit">✎ Bearbeiten</button>' +
      '<button class="btn small danger" id="btn-del">🗑 Löschen</button></div>' +
      '<dl class="kv">' +
      '<dt>Strecke</dt><dd>' + esc(f.dep || '?') + ' → ' + esc(f.arr || '?') +
        (f.depName ? ' <span class="muted">(' + esc(f.depName) + (f.arrName ? ' → ' + esc(f.arrName) : '') + ')</span>' : '') + '</dd>' +
      '<dt>Flugzeug</dt><dd>' + esc(aircraftLabel(f.aircraft)) + '</dd>' +
      '<dt>Abflug / Ankunft</dt><dd class="mono">' + esc(f.depTime || '?') + ' – ' + esc(f.arrTime || '?') + '</dd>' +
      '<dt>Flugzeit</dt><dd class="mono">' + Util.fmtDur(durationSec(f)) + '</dd>' +
      (f.nightSec ? '<dt>davon Nacht</dt><dd class="mono">' + Util.fmtDur(f.nightSec) + '</dd>' : '') +
      '<dt>Landungen</dt><dd>' + (f.landings || 0) + ' gesamt, davon ' + (f.touchAndGos || 0) + ' Touch &amp; Go (automatisch erkannt)' + '</dd>' +
      '<dt>Rolle</dt><dd>' + esc(f.role || 'PIC') + '</dd>' +
      (f.distanceM != null ? '<dt>Strecke</dt><dd>' + (f.distanceM / 1000).toFixed(1) + ' km</dd>' : '') +
      (f.maxAltM != null ? '<dt>Max. Höhe</dt><dd>' + Math.round(f.maxAltM) + ' m</dd>' : '') +
      (f.maxSpeedKmh != null ? '<dt>Max. Speed</dt><dd>' + f.maxSpeedKmh + ' km/h (Ø ' + (f.avgSpeedKmh || 0) + ')</dd>' : '') +
      (f.remarks ? '<dt>Bemerkung</dt><dd>' + esc(f.remarks) + '</dd>' : '') +
      '</dl></div>' +
      (f.track && f.track.length > 1 ?
        '<div class="card"><h2>Karte</h2><canvas id="fl-map" class="chart" style="height:300px"></canvas></div>' +
        '<div class="card"><h2>Profil</h2><canvas id="fl-profile" class="chart" style="height:190px"></canvas></div>' : '') +
      '<div class="card"><h2>Ereignisse (' + (f.events ? f.events.length : 0) + ')</h2><ul class="events">' +
      (f.events || []).map(eventLiHtml).join('') + '</ul></div>';
    $('#btn-edit').onclick = function () { openFlightModal(f); };
    $('#btn-del').onclick = function () {
      if (confirm('Flug Nr. ' + f.no + ' wirklich löschen?')) {
        Store.deleteFlight(f.id);
        toast('Flug gelöscht');
        location.hash = '#/buch';
      }
    };
    if (f.track && f.track.length > 1) {
      setTimeout(function () {
        drawMap($('#fl-map'), f.track, f.events || []);
        drawProfile($('#fl-profile'), f.track);
      }, 50);
    }
  }
  function renderStatistik() {
    var v = $('#view-statistik');
    var flights = Store.listFlights();
    var now = Date.now();
    var year = new Date().getFullYear();
    var tYear = totals(flights.filter(function (f) { return (f.date || '').slice(0, 4) === String(year); }), 0);
    var t12 = totals(flights, now - 365 * 86400000);
    var t90 = totals(flights, now - 90 * 86400000);
    var t30 = totals(flights, now - 30 * 86400000);
    var tAll = totals(flights, 0);
    var byAc = {};
    flights.forEach(function (f) {
      var k = f.aircraft || '(ohne)';
      byAc[k] = byAc[k] || { flights: 0, seconds: 0, landings: 0 };
      byAc[k].flights++;
      byAc[k].seconds += durationSec(f);
      byAc[k].landings += f.landings || 0;
    });
    var acRows = Object.keys(byAc).sort(function (a, b) { return byAc[b].seconds - byAc[a].seconds; })
      .map(function (k) {
        return '<tr><td>' + esc(aircraftLabel(k)) + '</td><td class="num">' + byAc[k].flights + '</td><td class="num">' +
          Util.fmtDur(byAc[k].seconds) + '</td><td class="num">' + byAc[k].landings + '</td></tr>';
      }).join('');
    var byRoute = {};
    flights.forEach(function (f) {
      if (!f.dep && !f.arr) return;
      var k = (f.dep || '?') + ' → ' + (f.arr || '?');
      byRoute[k] = byRoute[k] || { n: 0, seconds: 0 };
      byRoute[k].n++;
      byRoute[k].seconds += durationSec(f);
    });
    var routeRows = Object.keys(byRoute).sort(function (a, b) { return byRoute[b].n - byRoute[a].n; }).slice(0, 10)
      .map(function (k) {
        return '<tr><td>' + esc(k) + '</td><td class="num">' + byRoute[k].n + '</td><td class="num">' + Util.fmtDur(byRoute[k].seconds) + '</td></tr>';
      }).join('');
    v.innerHTML =
      '<div class="card"><h2>Statistik</h2><div class="statgrid">' +
      stat(tAll.hours, 'Gesamt') + stat(tAll.flights, 'Flüge') + stat(tAll.landings, 'Landungen') +
      stat(Util.fmtDur(tAll.nightSec), 'Nacht gesamt') +
      '</div><h3>Zeiträume</h3><table class="log"><tr><th></th><th class="num">Flüge</th><th class="num">Stunden</th><th class="num">Landungen</th><th class="num">T&amp;G</th><th class="num">Nacht</th></tr>' +
      periodRow('Dieses Jahr', tYear) + periodRow('Letzte 12 Monate', t12) + periodRow('Letzte 90 Tage', t90) + periodRow('Letzte 30 Tage', t30) +
      '</table>' +
      (t90.landings >= 3
        ? '<p class="hint">✓ Recency (3 Landungen in 90 Tagen) erfüllt: ' + t90.landings + ' Landungen.</p>'
        : '<p class="hint">Recency: ' + t90.landings + ' von 3 Landungen in den letzten 90 Tagen.</p>') +
      '</div>' +
      '<div class="card"><h2>Pro Flugzeug</h2><table class="log"><tr><th>Kennzeichen</th><th class="num">Flüge</th><th class="num">Stunden</th><th class="num">Landungen</th></tr>' +
      (acRows || '<tr><td colspan="4" class="hint">Noch keine Daten.</td></tr>') + '</table></div>' +
      '<div class="card"><h2>Top-Strecken</h2><table class="log"><tr><th>Strecke</th><th class="num">Flüge</th><th class="num">Stunden</th></tr>' +
      (routeRows || '<tr><td colspan="3" class="hint">Noch keine Daten.</td></tr>') + '</table></div>';
  }
  function periodRow(label, t) {
    return '<tr><td>' + esc(label) + '</td><td class="num">' + t.flights + '</td><td class="num">' + t.hours + '</td><td class="num">' +
      t.landings + '</td><td class="num">' + t.tg + '</td><td class="num">' + Util.fmtDur(t.nightSec) + '</td></tr>';
  }
  function renderFlugzeuge() {
    var v = $('#view-flugzeuge');
    var ac = Store.listAircraft();
    var s = Store.getSettings();
    v.innerHTML =
      '<div class="card"><h2>Flugzeuge</h2>' +
      (ac.length ? '<table class="log"><tr><th>Kennzeichen</th><th>Muster</th><th>Klasse</th><th></th></tr>' +
        ac.map(function (a) {
          return '<tr><td>' + esc(a.reg) + '</td><td>' + esc(a.type || '') + '</td><td>' + esc(a.klasse || '') + '</td>' +
            '<td><button class="btn small danger" data-del="' + esc(a.id) + '">✕</button></td></tr>';
        }).join('') + '</table>' : '<p class="hint">Noch keine Flugzeuge angelegt.</p>') +
      '<hr class="sep"><h3>Flugzeug hinzufügen</h3><div class="formgrid">' +
      '<label class="f"><span>Kennzeichen *</span><input id="ac-reg" placeholder="D-MABC"></label>' +
      '<label class="f"><span>Muster</span><input id="ac-type" placeholder="C42 / FK9 / Virus SW"></label>' +
      '<label class="f"><span>Klasse</span><input id="ac-klasse" placeholder="UL / SEP"></label>' +
      '<label class="f"><span>Standard-Flugzeug</span><input type="checkbox" id="ac-default"' + (s.defaultAircraft ? ' checked' : '') + ' style="width:auto"></label>' +
      '</div><button class="btn" id="ac-add">Hinzufügen</button></div>';
    $$('#view-flugzeuge [data-del]').forEach(function (b) {
      b.onclick = function () { Store.deleteAircraft(b.getAttribute('data-del')); renderFlugzeuge(); };
    });
    $('#ac-add').onclick = function () {
      var reg = $('#ac-reg').value.trim().toUpperCase();
      if (!reg) { toast('Kennzeichen fehlt'); return; }
      var a = Store.addAircraft({ reg: reg, type: $('#ac-type').value.trim(), klasse: $('#ac-klasse').value.trim() });
      var st = Store.getSettings();
      if ($('#ac-default').checked) Store.saveSettings({ defaultAircraft: a.reg });
      toast('Flugzeug ' + reg + ' gespeichert');
      renderFlugzeuge();
    };
  }
  function renderDaten() {
    var v = $('#view-daten');
    var s = Store.getSettings();
    var custom = s.customAirports || [];
    v.innerHTML =
      '<div class="card"><h2>GPS-Autoerkennung (Schwellen)</h2>' +
      '<label class="f"><span><input type="checkbox" id="st-autostart"' + (s.autoStart ? ' checked' : '') + ' style="width:auto"> Auto-Start/Auto-Stop per GPS</span></label>' +
      '<div class="formgrid">' +
      '<label class="f"><span>Auto-Start ab (km/h)</span><input id="st-start" type="number" value="' + s.startKmh + '"></label>' +
      '<label class="f"><span>Aufsetzen unter (km/h)</span><input id="st-land" type="number" value="' + s.landKmh + '"></label>' +
      '<label class="f"><span>Abheben über (km/h)</span><input id="st-takeoff" type="number" value="' + s.takeoffKmh + '"></label>' +
      '<label class="f"><span>Stopp bestätigen nach (s)</span><input id="st-stopsec" type="number" value="' + s.stopConfirmSec + '"></label>' +
      '<label class="f"><span>T&amp;G max. Bodenzeit (s)</span><input id="st-tgsec" type="number" value="' + s.touchGroundSec + '"></label>' +
      '<label class="f"><span><input type="checkbox" id="st-night"' + (s.nightAuto !== false ? ' checked' : '') + ' style="width:auto"> Nachtflugzeit automatisch berechnen</span></label>' +
      '</div>' +
      '<button class="btn" id="st-save">Speichern</button></div>' +
      '<div class="card"><h2>Eigene Flugplätze (für ICAO-Autoerkennung)</h2>' +
      (custom.length ? '<table class="log"><tr><th>ICAO</th><th>Name</th><th>Lat</th><th>Lon</th><th></th></tr>' +
        custom.map(function (a, i) {
          return '<tr><td>' + esc(a.icao) + '</td><td>' + esc(a.name || '') + '</td><td class="num">' + a.lat + '</td><td class="num">' + a.lon + '</td>' +
            '<td><button class="btn small danger" data-cdel="' + i + '">✕</button></td></tr>';
        }).join('') + '</table>' : '<p class="hint">Keine eigenen Plätze.</p>') +
      '<div class="formgrid">' +
      '<label class="f"><span>ICAO</span><input id="ca-icao" placeholder="EDXY"></label>' +
      '<label class="f"><span>Name</span><input id="ca-name" placeholder="Mein Platz"></label>' +
      '<label class="f"><span>Breite</span><input id="ca-lat" type="number" step="0.0001" placeholder="48.2372"></label>' +
      '<label class="f"><span>Länge</span><input id="ca-lon" type="number" step="0.0001" placeholder="11.2881"></label>' +
      '</div><button class="btn secondary" id="ca-add">Platz hinzufügen</button>' +
      '<p class="hint">Alternativ: aktueller GPS-Standort als Platz übernehmen. <button class="btn small secondary" id="ca-here">Hier als Platz</button></p></div>' +
      '<div class="card"><h2>Karten-Kacheln (Moving Map / Vollbild)</h2>' +
      '<p class="hint" id="tile-status">Lokale Kacheln: –</p>' +
      '<label class="f"><span>Kachel-Quelle</span><select id="st-tilesource">' +
      [['auto', ' Lokal + OSM online (Fallback)'], ['local', 'Nur lokale Kacheln (offline)'], ['osm', 'Nur OSM online']].map(function (o) {
        return '<option value="' + o[0] + '"' + ((s.tileSource || 'auto') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select></label>' +
      '<div class="row">' +
      '<label class="btn secondary" style="cursor:pointer">⬆ Kachel-Ordner (z/x/y.png)<input type="file" id="tile-folder" webkitdirectory directory multiple style="display:none"></label>' +
      '<label class="btn secondary" style="cursor:pointer">⬆ MBTiles (.mbtiles)<input type="file" id="tile-mbtiles" accept=".mbtiles,.sqlite,.db" style="display:none"></label>' +
      '<button class="btn small danger" id="tile-clear">Kacheln löschen</button>' +
      '</div>' +
      '<p class="hint">Kacheln landen nur im Browser des Geräts (IndexedDB) und sind danach offline verfügbar – z. B. exportierte MBTiles von openflightmaps oder eigener Export. MBTiles braucht einmalig Internet (sql.js-WASM von CDN).</p></div>' +
      '<div class="card"><h2>OpenAIP (API-Key lokal gespeichert)</h2>' +
      '<label class="f"><span>OpenAIP API-Key (wird nur lokal im Browser gespeichert)</span><input id="oa-key" type="password" placeholder="x-openaip-api-key" value="' + esc(s.openaipKey || '') + '"></label>' +
      '<div class="row">' +
      '<select id="oa-country">' + ['DE', 'AT', 'CH', 'FR', 'NL', 'DK', 'PL', 'CZ', 'IT'].map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select>' +
      '<button class="btn secondary" id="oa-airports">Flugplätze laden</button>' +
      '<button class="btn secondary" id="oa-airspaces">Luftraum laden</button>' +
      '</div>' +
      '<p class="hint">Lädt Flugplätze (werden zu „Eigene Flugplätze“ gemerged) und Luftraumgebiete (werden mit den DAeC-Daten zusammengeführt) von api.core.openaip.net. Datenquelle: <a href="https://www.openaip.net" target="_blank" rel="noopener">OpenAIP</a>.</p></div>' +
      '<div class="card"><h2>Luftraum &amp; Basiskarte</h2>' +
      '<p class="hint" id="as-status">' + (Airspace.areas.length ? Airspace.areas.length + ' Gebiete geladen (OpenAir, DAeC)' : 'Keine Luftraumdaten geladen – lade die DAeC OpenAir-Datei (online) oder eine lokale .txt') + '</p>' +
      '<div class="row">' +
      '<button class="btn secondary" id="as-fetch">⬇ DAeC OpenAir laden (online)</button>' +
      '<label class="btn secondary" style="cursor:pointer">⬆ Lokale .txt laden<input type="file" id="as-file" accept=".txt,.sua,.openair,text/plain" style="display:none"></label>' +
      '<button class="btn small danger" id="as-clear">Leeren</button>' +
      '</div>' +
      '<label class="f"><span><input type="checkbox" id="st-airmap"' + (s.airspaceMap !== false ? ' checked' : '') + ' style="width:auto"> Luftraumgebiete auf der Karte anzeigen</span></label>' +
      '<label class="f"><span><input type="checkbox" id="st-airwarn"' + (s.airspaceWarn !== false ? ' checked' : '') + ' style="width:auto"> Warnung beim Einflug in R/D/C/CTR/TMZ/RMZ (Banner + Vibration)</span></label>' +
      '<label class="f"><span><input type="checkbox" id="st-basemap"' + (s.basemap !== false ? ' checked' : '') + ' style="width:auto"> Basiskarte OpenStreetMap laden (nur online; © OpenStreetMap-Mitwirkende)</span></label>' +
      '<p class="hint">Offline zeichnet die App den Track als Vektor – Luftraumgebiete kommen aus den lokal geladenen Daten und funktionieren ohne Netz.</p></div>' +
      '<div class="card"><h2>Export / Import</h2><div class="row">' +
      '<button class="btn secondary" id="exp-json">⬇ JSON exportieren</button>' +
      '<button class="btn secondary" id="exp-csv">⬇ CSV exportieren</button>' +
      '<label class="btn secondary" style="cursor:pointer">⬆ Importieren<input type="file" id="imp-file" accept=".json,.csv" style="display:none"></label>' +
      '</div><p class="hint">JSON sichert alles inkl. GPS-Tracks. CSV (Semikolon) ist mit Excel kompatibel.</p></div>' +
      '<div class="card danger-zone"><h2>Alle Daten löschen</h2>' +
      '<button class="btn danger" id="wipe">🗑 Flugbuch zurücksetzen</button></div>';
    $('#st-save').onclick = function () {
      Store.saveSettings({
        autoStart: $('#st-autostart').checked,
        startKmh: +$('#st-start').value || 58,
        landKmh: +$('#st-land').value || 68,
        takeoffKmh: +$('#st-takeoff').value || 83,
        stopConfirmSec: +$('#st-stopsec').value || 30,
        touchGroundSec: +$('#st-tgsec').value || 22,
        nightAuto: $('#st-night').checked,
        airspaceMap: $('#st-airmap').checked,
        airspaceWarn: $('#st-airwarn').checked,
        basemap: $('#st-basemap').checked
      });
      toast('Einstellungen gespeichert');
    };
    $('#as-fetch').onclick = function () {
      toast('Lade DAeC OpenAir (2026_09)…');
      fetch('https://www.daec.de/media/files/Dateien/Fachbereiche/Luftraum_und_Flugsicherheit/2026_09_Airspace_Germany_OA1.txt')
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        .then(function (t) {
          var n = Airspace.setFromOpenAir(t).length;
          toast(n + ' Luftraumgebiete geladen');
          renderDaten();
        })
        .catch(function (e) { toast('Download fehlgeschlagen (' + e.message + ') – bitte lokale .txt laden'); });
    };
    $('#as-file').onchange = function (e) {
      var f = e.target.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        var n = Airspace.setFromOpenAir(String(r.result)).length;
        toast(n + ' Luftraumgebiete geladen');
        renderDaten();
      };
      r.readAsText(f);
      e.target.value = '';
    };
    $('#as-clear').onclick = function () { Airspace.clear(); toast('Luftraumdaten gelöscht'); renderDaten(); };
    Tiles.count().then(function (n) { var el2 = document.getElementById('tile-status'); if (el2) el2.textContent = 'Lokale Kacheln: ' + n; });
    $('#st-tilesource').onchange = function () { Store.saveSettings({ tileSource: this.value }); toast('Kachel-Quelle gespeichert'); };
    $('#tile-folder').onchange = function (e) {
      var files = e.target.files;
      if (!files || !files.length) return;
      toast('Importiere ' + files.length + ' Dateien…');
      Tiles.importTileFolder(files).then(function (n) {
        toast(n + ' Kacheln gespeichert (offline verfügbar)');
        renderDaten();
      }).catch(function (err) { toast('Fehler: ' + err.message); });
      e.target.value = '';
    };
    $('#tile-mbtiles').onchange = function (e) {
      var f = e.target.files[0];
      if (!f) return;
      toast('Lade MBTiles ' + f.name + '…');
      f.arrayBuffer()
        .then(function (ab) { return Tiles.loadSqlJs().then(function (SQL) { return Tiles.importMbtiles(ab, SQL); }); })
        .then(function (n) { toast(n + ' Kacheln aus MBTiles gespeichert'); renderDaten(); })
        .catch(function (err) { toast('MBTiles-Import fehlgeschlagen: ' + err.message); });
      e.target.value = '';
    };
    $('#tile-clear').onclick = function () { Tiles.clear().then(function () { toast('Kacheln gelöscht'); renderDaten(); }); };
    $('#oa-airports').onclick = function () {
      var key = $('#oa-key').value.trim();
      if (!key) { toast('Bitte OpenAIP API-Key eintragen'); return; }
      Store.saveSettings({ openaipKey: key });
      var country = $('#oa-country').value;
      toast('Lade Flugplätze ' + country + ' von OpenAIP…');
      OpenAIP.fetchAirports(key, country).then(function (list) {
        var s2 = Store.getSettings();
        var custom = s2.customAirports.slice();
        var known = {};
        custom.forEach(function (a) { known[a.icao] = true; });
        var added = 0;
        list.forEach(function (a) {
          if (a.icao && !known[a.icao]) { custom.push(a); known[a.icao] = true; added++; }
        });
        Store.saveSettings({ customAirports: custom });
        toast(added + ' neue Flugplätze (' + list.length + ' gesamt von OpenAIP ' + country + ')');
      }).catch(function (err) { toast('OpenAIP Fehler: ' + err.message); });
    };
    $('#oa-airspaces').onclick = function () {
      var key = $('#oa-key').value.trim();
      if (!key) { toast('Bitte OpenAIP API-Key eintragen'); return; }
      Store.saveSettings({ openaipKey: key });
      var country = $('#oa-country').value;
      toast('Lade Luftraum ' + country + ' von OpenAIP…');
      OpenAIP.fetchAirspaces(key, country).then(function (list) {
        var have = {};
        Airspace.areas.forEach(function (a) { have[a.name] = true; });
        var added = 0;
        list.forEach(function (a) { if (!have[a.name]) { Airspace.areas.push(a); have[a.name] = true; added++; } });
        Airspace.save();
        toast(added + ' neue Gebiete (gesamt ' + Airspace.areas.length + ')');
        renderDaten();
      }).catch(function (err) { toast('OpenAIP Fehler: ' + err.message); });
    };
    $$('#view-daten [data-cdel]').forEach(function (b) {
      b.onclick = function () {
        var c = Store.getSettings().customAirports.slice();
        c.splice(+b.getAttribute('data-cdel'), 1);
        Store.saveSettings({ customAirports: c });
        renderDaten();
      };
    });
    $('#ca-add').onclick = function () {
      var icao = $('#ca-icao').value.trim().toUpperCase();
      var lat = parseFloat($('#ca-lat').value), lon = parseFloat($('#ca-lon').value);
      if (!icao || !isFinite(lat) || !isFinite(lon)) { toast('ICAO, Breite und Länge erforderlich'); return; }
      var c = Store.getSettings().customAirports.slice();
      c.push({ icao: icao, name: $('#ca-name').value.trim(), lat: lat, lon: lon });
      Store.saveSettings({ customAirports: c });
      renderDaten();
    };
    $('#ca-here').onclick = function () {
      navigator.geolocation.getCurrentPosition(function (p) {
        $('#ca-lat').value = p.coords.latitude.toFixed(5);
        $('#ca-lon').value = p.coords.longitude.toFixed(5);
        toast('Koordinaten übernommen');
      }, function () { toast('GPS nicht verfügbar'); }, { enableHighAccuracy: true });
    };
    $('#exp-json').onclick = function () {
      download('pilotlog-export.json', JSON.stringify({
        exportedAt: new Date().toISOString(),
        flights: Store.listFlights(),
        aircraft: Store.listAircraft(),
        settings: Store.getSettings()
      }, null, 1), 'application/json');
    };
    $('#exp-csv').onclick = function () {
      download('pilotlog-export.csv', toCsv(Store.listFlights()), 'text/csv');
    };
    $('#imp-file').onchange = function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          if (/\.json$/i.test(file.name)) importJson(String(reader.result));
          else importCsv(String(reader.result));
          toast('Import fertig');
          render();
        } catch (err) { toast('Import fehlgeschlagen: ' + err.message); }
      };
      reader.readAsText(file);
      e.target.value = '';
    };
    $('#wipe').onclick = function () {
      if (confirm('Wirklich ALLE Flüge und Flugzeuge löschen?')) {
        Store.resetAll();
        toast('Zurückgesetzt');
        render();
      }
    };
  }
  function download(name, content, mime) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: mime || 'application/octet-stream' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function csvCell(v) {
    var s = String(v == null ? '' : v);
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCsv(flights) {
    var head = ['Nr', 'Datum', 'Von', 'Nach', 'Kennzeichen', 'Abflug', 'Ankunft', 'Dauer', 'Landungen', 'davon T&G', 'Rolle', 'Nacht', 'Bemerkung'];
    var rows = flights.map(function (f) {
      return [f.no, f.date, f.dep, f.arr, f.aircraft, f.depTime, f.arrTime, Util.fmtDur(durationSec(f)),
        f.landings, f.touchAndGos, f.role, Util.fmtDur(f.nightSec || 0), f.remarks].map(csvCell).join(';');
    });
    return head.join(';') + '\n' + rows.join('\n') + '\n';
  }
  function importJson(text) {
    var data = JSON.parse(text);
    var list = Array.isArray(data) ? data : (data.flights || []);
    var n = 0;
    list.forEach(function (f) {
      if (!f || !f.id) f = Object.assign({}, f, { id: Util.uid() });
      if (!Store.getFlight(f.id)) { Store.addFlight(f); n++; }
    });
    if (data.aircraft && !Array.isArray(data)) data.aircraft.forEach(function (a) { Store.addAircraft(a); });
    return n;
  }
  function importCsv(text) {
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (lines.length < 2) throw new Error('keine Datenzeilen');
    var delim = lines[0].indexOf(';') >= 0 ? ';' : ',';
    var head = lines[0].split(delim).map(function (h) { return h.trim().toLowerCase().replace(/^﻿/, ''); });
    function col(names) {
      for (var i = 0; i < head.length; i++) if (names.indexOf(head[i]) >= 0) return i;
      return -1;
    }
    var cDate = col(['datum', 'date']), cDep = col(['von', 'from', 'abflugplatz', 'dep']),
      cArr = col(['nach', 'to', 'zielflugplatz', 'arr']),
      cReg = col(['kennzeichen', 'flugzeug', 'reg', 'aircraft']),
      cDepT = col(['abflug', 'dep time', 'start', 'ab']),
      cArrT = col(['ankunft', 'arr time', 'landung', 'an']),
      cDur = col(['dauer', 'duration', 'flugzeit']),
      cLdg = col(['landungen', 'landings', 'ldg']),
      cTg = col(['davon t&g', 't&g', 'touch and go', 'touchandgo']),
      cRole = col(['rolle', 'role', 'pic']),
      cRem = col(['bemerkung', 'remarks', 'kommentar']);
    var n = 0;
    for (var r = 1; r < lines.length; r++) {
      var cells = lines[r].split(delim).map(function (c) { return c.trim().replace(/^"|"$/g, ''); });
      var g = function (i) { return i >= 0 ? cells[i] : ''; };
      var date = g(cDate);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        var m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(date);
        if (m) date = m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
        else continue;
      }
      var depTime = g(cDepT), arrTime = g(cArrT);
      var durMin = Util.parseClockMin(g(cDur));
      var f = {
        id: Util.uid(),
        date: date,
        dep: g(cDep).toUpperCase(), arr: g(cArr).toUpperCase(),
        aircraft: g(cReg), depTime: depTime, arrTime: arrTime,
        durationSec: durMin != null ? durMin * 60 : undefined,
        landings: parseInt(g(cLdg), 10) || 0,
        touchAndGos: parseInt(g(cTg), 10) || 0,
        role: g(cRole) || 'PIC',
        remarks: g(cRem),
        auto: false
      };
      Store.addFlight(f);
      n++;
    }
    return n;
  }
  function openFlightModal(flight) {
    var f = flight || {};
    var ac = Store.listAircraft();
    var today = Util.fmtDate(new Date());
    var opts = '<option value="">—</option>' + ac.map(function (a) {
      return '<option value="' + esc(a.reg) + '"' + (f.aircraft === a.reg ? ' selected' : '') + '>' + esc(a.reg + (a.type ? ' · ' + a.type : '')) + '</option>';
    }).join('');
    var icaos = Airports.list.map(function (a) { return a.icao; }).concat((Store.getSettings().customAirports || []).map(function (a) { return a.icao; }));
    var dl = '<datalist id="icao-list">' + icaos.map(function (c) { return '<option value="' + c + '">'; }).join('') + '</datalist>';
    $('#modal-title').textContent = flight ? 'Flug Nr. ' + (flight.no || '') + ' bearbeiten' : 'Neuen Flug eintragen';
    $('#modal-content').innerHTML =
      '<div class="formgrid">' +
      '<label class="f"><span>Datum</span><input type="date" id="m-date" value="' + esc(f.date || today) + '"></label>' +
      '<label class="f"><span>Flugzeug</span><select id="m-ac">' + opts + '</select></label>' +
      '<label class="f"><span>Von (ICAO)</span><input id="m-dep" list="icao-list" value="' + esc(f.dep || '') + '" placeholder="EDMA"></label>' +
      '<label class="f"><span>Nach (ICAO)</span><input id="m-arr" list="icao-list" value="' + esc(f.arr || '') + '" placeholder="EDML"></label>' +
      '<label class="f"><span>Abflug (HH:MM)</span><input id="m-dept" value="' + esc(f.depTime || '') + '" placeholder="10:15"></label>' +
      '<label class="f"><span>Ankunft (HH:MM)</span><input id="m-arrt" value="' + esc(f.arrTime || '') + '" placeholder="11:20"></label>' +
      '<label class="f"><span>Landungen gesamt</span><input type="number" min="0" id="m-ldg" value="' + (f.landings != null ? f.landings : 1) + '"></label>' +
      '<label class="f"><span>davon Touch &amp; Go</span><input type="number" min="0" id="m-tg" value="' + (f.touchAndGos || 0) + '"></label>' +
      '<label class="f"><span>Rolle</span><select id="m-role">' +
      ['PIC', 'SIC', 'Dual', 'FI'].map(function (r) { return '<option' + (f.role === r ? ' selected' : '') + '>' + r + '</option>'; }).join('') + '</select></label>' +
      '<label class="f full"><span>Bemerkung</span><textarea id="m-rem">' + esc(f.remarks || '') + '</textarea></label>' +
      '</div>' + dl +
      '<div class="row"><button class="btn" id="m-save">Speichern</button>' +
      '<button class="btn secondary" id="m-cancel">Abbrechen</button></div>';
    $('#modal').classList.remove('hidden');
    $('#m-cancel').onclick = $('#modal-close').onclick = function () { $('#modal').classList.add('hidden'); };
    $('#m-save').onclick = function () {
      var date = $('#m-date').value;
      if (!date) { toast('Datum fehlt'); return; }
      var depT = $('#m-dept').value.trim(), arrT = $('#m-arrt').value.trim();
      var data = {
        date: date,
        dep: $('#m-dep').value.trim().toUpperCase(),
        arr: $('#m-arr').value.trim().toUpperCase(),
        aircraft: $('#m-ac').value,
        depTime: depT, arrTime: arrT,
        landings: Math.max(0, parseInt($('#m-ldg').value, 10) || 0),
        touchAndGos: Math.max(0, parseInt($('#m-tg').value, 10) || 0),
        role: $('#m-role').value,
        remarks: $('#m-rem').value.trim()
      };
      var a = Util.parseClockMin(depT), b = Util.parseClockMin(arrT);
      if (a != null && b != null) {
        var d = b - a; if (d < 0) d += 24 * 60;
        data.durationSec = d * 60;
        var s = Store.getSettings();
        if (s.nightAuto !== false) {
          var lat = 48.35, lon = 11.78;
          var ap = Airports.findByIcao(data.dep, s.customAirports);
          if (ap) { lat = ap.lat; lon = ap.lon; }
          var depMs = Util.clockToDate(date, a).getTime();
          data.nightSec = Math.round(Util.nightSecondsBetween(depMs, depMs + data.durationSec * 1000, lat, lon));
        }
      }
      if (flight) {
        Store.updateFlight(Object.assign({}, flight, data));
        toast('Flug gespeichert');
      } else {
        var nf = Store.addFlight(Object.assign({ id: Util.uid(), auto: false }, data));
        toast('Flug Nr. ' + nf.no + ' eingetragen');
      }
      $('#modal').classList.add('hidden');
      render();
    };
  }
  document.addEventListener('click', function (e) {
    var stop = e.target.closest && e.target.closest('#btn-stop');
    var tg = e.target.closest && e.target.closest('#btn-tg');
    var disc = e.target.closest && e.target.closest('#btn-discard');
    if (stop && recorder.active) { recorder.stop('manual'); }
    if (tg && recorder.active) { recorder.addManualTg(); renderLiveNumbers(); }
    if (disc && recorder.active) {
      if (confirm('Aufzeichnung verwerfen?')) {
        recorder.active = false;
        clearTimeout(recorder.stopTimer);
        if (recorder.watchId != null) navigator.geolocation.clearWatch(recorder.watchId);
        stopLiveTick();
        toast('Verworfen');
        render();
      }
    }
  });
  window.addEventListener('hashchange', route);
  document.addEventListener('fullscreenchange', function () {
    mapFullscreen = !!document.fullscreenElement;
    if (recorder.active) renderLiveCharts();
  });
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
  route();
})();