(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Tiles = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var DB = 'pilotlog-tiles', STORE = 'tiles';
  var mem = {};
  var dbp = null;
  function idb() {
    if (typeof indexedDB === 'undefined') return null;
    if (!dbp) {
      dbp = new Promise(function (res, rej) {
        var rq = indexedDB.open(DB, 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore(STORE, { keyPath: 'key' }); };
        rq.onsuccess = function () { res(rq.result); };
        rq.onerror = function () { rej(rq.error); };
      });
    }
    return dbp;
  }
  function tmsRowToXyzY(z, tmsRow) { return Math.pow(2, z) - 1 - tmsRow; }
  function key(z, x, y) { return z + '/' + x + '/' + y; }
  function parseFolderPath(rel) {
    var m = /(\d+)\/(\d+)\/(\d+)\.(png|jpg|jpeg|webp)$/i.exec(rel || '');
    if (!m) return null;
    return { z: +m[1], x: +m[2], y: +m[3] };
  }
  var Tiles = {
    tmsRowToXyzY: tmsRowToXyzY,
    key: key,
    parseFolderPath: parseFolderPath,
    put: function (z, x, y, blob) {
      var k = key(z, x, y);
      var rec = { key: k, blob: blob, ts: Date.now() };
      var d = idb();
      if (!d) { mem[k] = rec; return Promise.resolve(); }
      return d.then(function (db) {
        return new Promise(function (res, rej) {
          var tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put(rec);
          tx.oncomplete = res;
          tx.onerror = function () { rej(tx.error); };
        });
      });
    },
    getTiles: function (keys) {
      var out = {};
      var d = idb();
      if (!d) {
        keys.forEach(function (k) { if (mem[k]) out[k] = mem[k].blob; });
        return Promise.resolve(out);
      }
      return d.then(function (db) {
        return new Promise(function (res, rej) {
          var tx = db.transaction(STORE, 'readonly');
          var st = tx.objectStore(STORE);
          keys.forEach(function (k) {
            var rq = st.get(k);
            rq.onsuccess = function () { if (rq.result) out[k] = rq.result.blob; };
          });
          tx.oncomplete = function () { res(out); };
          tx.onerror = function () { rej(tx.error); };
        });
      });
    },
    count: function () {
      var d = idb();
      if (!d) return Promise.resolve(Object.keys(mem).length);
      return d.then(function (db) {
        return new Promise(function (res, rej) {
          var rq = db.transaction(STORE, 'readonly').objectStore(STORE).count();
          rq.onsuccess = function () { res(rq.result); };
          rq.onerror = function () { rej(rq.error); };
        });
      });
    },
    clear: function () {
      var d = idb();
      if (!d) { mem = {}; return Promise.resolve(); }
      return d.then(function (db) {
        return new Promise(function (res, rej) {
          var tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).clear();
          tx.oncomplete = res;
          tx.onerror = function () { rej(tx.error); };
        });
      });
    },
    importTileFolder: function (files) {
      var jobs = [];
      for (var i = 0; i < files.length; i++) {
        (function (f) {
          var p = parseFolderPath(f.webkitRelativePath || f.name);
          if (!p) return;
          jobs.push(f.arrayBuffer().then(function (ab) {
            return Tiles.put(p.z, p.x, p.y, new Blob([ab], { type: 'image/png' }));
          }));
        })(files[i]);
      }
      return Promise.all(jobs).then(function () { return jobs.length; });
    },
    importMbtiles: function (arrayBuffer, SQL) {
      var db = new SQL.Database(new Uint8Array(arrayBuffer));
      var jobs = [];
      try {
        var res = db.exec('SELECT zoom_level, tile_column, tile_row, tile_data FROM tiles');
        if (res.length && res[0].values) {
          res[0].values.forEach(function (row) {
            var z = row[0], x = row[1], y = tmsRowToXyzY(z, row[2]);
            jobs.push(Tiles.put(z, x, y, new Blob([row[3]], { type: 'image/png' })));
          });
        }
      } finally {
        db.close();
      }
      return Promise.all(jobs).then(function () { return jobs.length; });
    },
    loadSqlJs: function () {
      return new Promise(function (res, rej) {
        if (typeof window !== 'undefined' && window.SQL) return res(window.SQL);
        if (typeof document === 'undefined') return rej(new Error('sql.js nur im Browser verfügbar'));
        var s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js';
        s.onload = function () {
          window.initSqlJs({ locateFile: function () { return 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.wasm'; } })
            .then(function (SQL) { window.SQL = SQL; res(SQL); })
            .catch(rej);
        };
        s.onerror = function () { rej(new Error('sql.js konnte nicht geladen werden (Internet nötig)')); };
        document.head.appendChild(s);
      });
    }
  };
  return Tiles;
});
