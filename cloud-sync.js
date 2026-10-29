/* ============================================================
   المزامنة السحابية للقوارئ العشر — وحدة مشتركة (ملف واحد لكل القوارئ)
   ------------------------------------------------------------
   ما الذي يُزامَن: الإشارات المرجعية والتظليل (التظليل = إشارة لها لون)،
   الملاحظات، المواضيع المحفوظة، حالة "تمت قراءته"، وموضع القراءة.
   الحفظ المحلي في المتصفح يبقى كما هو؛ هذه الوحدة طبقة فوقه:
     • تعمل بلا حساب: رمز مزامنة سرّي واحد يشترك فيه كل جهازك وكل القوارئ.
     • الدمج لا يفقد شيئاً: اتحاد الإشارات من الجهازين، والحذف يُنقل
       بواسطة "شواهد حذف" (tombstones) كي لا تعود إشارة محذوفة.
     • إن تعذّر الاتصال تبقى البيانات محلياً وتُرسل لاحقاً تلقائياً.
   ============================================================ */
(function(){
'use strict';

var CFG = window.READER_CLOUD_CONFIG || {};
var LS_CODE = 'readers_sync_code_v1';
var LS_HINT = 'readers_sync_hint_shown_v1';
var PUSH_DELAY = 4000;        // انتظار هدوء بعد آخر تغيير قبل الإرسال
var PUSH_MAX_WAIT = 30000;    // أقصى تأخير مع استمرار التغييرات (التمرير مثلاً)
var PULL_MIN_GAP = 20000;     // أقل فاصل بين سحبين تلقائيين عند العودة للتبويب
var TOMB_TTL = 180 * 86400000;
var ALL_KEYS = [
  'myreader_userdata_origen_v1','myreader_userdata_philo_v1','myreader_userdata_josephus_v1',
  'myreader_userdata_heraclius_main_v1','myreader_userdata_another_heraclius_v1',
  'myreader_userdata_filo_leop_v1','myreader_userdata_heraclius_legend_v1',
  'myreader_userdata_motherhood_v1','myreader_userdata_woman_filo_v1',
  'myreader_userdata_template_base_v1'
];

/* ---------- أدوات صغيرة ---------- */
function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function lsSet(k,v){ try{ localStorage.setItem(k,v); return true; }catch(e){ return false; } }
function lsDel(k){ try{ localStorage.removeItem(k); }catch(e){} }
function normCode(c){ return String(c||'').toUpperCase().replace(/[^A-Z0-9]/g,''); }
function configured(){ return !!(CFG.url && CFG.key); }
function getCode(){ var c = normCode(lsGet(LS_CODE)); return c.length >= 16 ? c : ''; }
function fmtCode(c){ return c.replace(/(.{5})(?=.)/g,'$1-'); }
function genCode(){
  var A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', out = '', i, buf;
  buf = new Uint8Array(20);
  (window.crypto || window.msCrypto).getRandomValues(buf);
  for(i=0;i<20;i++) out += A[buf[i] % A.length];
  return fmtCode(out);
}
function setCode(c){
  var n = normCode(c);
  if(n.length < 16) return false;
  lsSet(LS_CODE, fmtCode(n));
  return true;
}
function clearCode(){ lsDel(LS_CODE); }
function sha256hex(s){
  var enc = new TextEncoder().encode(s);
  return crypto.subtle.digest('SHA-256', enc).then(function(buf){
    return Array.prototype.map.call(new Uint8Array(buf), function(b){ return ('0'+b.toString(16)).slice(-2); }).join('');
  });
}
function rpc(name, args, keepalive){
  var url = String(CFG.url).replace(/\/+$/,'') + '/rest/v1/rpc/' + name;
  var body = JSON.stringify(args);
  return fetch(url, {
    method:'POST',
    headers:{ 'apikey': CFG.key, 'Content-Type':'application/json' },
    body: body,
    keepalive: !!(keepalive && body.length < 60000)
  }).then(function(r){
    if(!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  });
}

/* ---------- الدمج (دالة نقية قابلة للاختبار) ---------- */
function keyOf(x){ return x.bookId + '|' + x.ts; }
function posTs(p){ return Math.max((p && p.ts) || 0, (p && p.pidTs) || 0); }
function emptyTomb(){ return { b:{}, n:{}, t:{} }; }
function mergeTomb(a, b, now){
  var out = emptyTomb(), g, k, src, i;
  var srcs = [a || emptyTomb(), b || emptyTomb()];
  for(i=0;i<srcs.length;i++){
    src = srcs[i];
    for(g in out){
      for(k in (src[g] || {})){
        var ts = src[g][k] || 0;
        if(now - ts > TOMB_TTL) continue;
        if(!(k in out[g]) || ts > out[g][k]) out[g][k] = ts;
      }
    }
  }
  return out;
}
function listKeys(arr, fn){ var o = {}; (arr||[]).forEach(function(x){ o[fn(x)] = 1; }); return o; }

/* local/remote: {bookmarks,notes,savedThemes,readStatus,readingPosition,tomb?}
   state: {snap:{b:[],n:[],t:[]}, tomb} — ما كان متزامناً آخر مرة */
function merge(local, remote, state, now){
  now = now || Date.now();
  remote = remote || {};
  state = state || {};
  var snap = state.snap || { b:[], n:[], t:[] };
  var tombIn = state.tomb || emptyTomb();

  var lb = local.bookmarks || [], ln = local.notes || [], lt = local.savedThemes || [];
  var curB = listKeys(lb, keyOf), curN = listKeys(ln, keyOf), curT = {};
  lt.forEach(function(s){ curT[s] = 1; });

  /* حذف محلي = كان في آخر لقطة متزامنة ولم يعد موجوداً. مع صمّام أمان:
     إن اختفى معظم ما في اللقطة دفعة واحدة نعدّه فقداناً للبيانات المحلية لا حذفاً. */
  var localTomb = emptyTomb(), suspicious = false;
  var snapCount = snap.b.length + snap.n.length + snap.t.length;
  var goneB = snap.b.filter(function(k){ return !curB[k]; });
  var goneN = snap.n.filter(function(k){ return !curN[k]; });
  var goneT = snap.t.filter(function(k){ return !curT[k]; });
  var goneCount = goneB.length + goneN.length + goneT.length;
  if(goneCount > 20 && snapCount && goneCount / snapCount > 0.6) suspicious = true;
  if(!suspicious){
    goneB.forEach(function(k){ localTomb.b[k] = now; });
    goneN.forEach(function(k){ localTomb.n[k] = now; });
    goneT.forEach(function(k){ localTomb.t[k] = now; });
  }
  var tomb = mergeTomb(mergeTomb(tombIn, remote.tomb, now), localTomb, now);

  function unionItems(remoteArr, localArr, group){
    var map = {}, order = [];
    (remoteArr || []).concat(localArr || []).forEach(function(x){
      if(!x || x.ts == null) return;
      var k = keyOf(x);
      if(tomb[group][k]) return;
      if(!(k in map)) order.push(k);
      map[k] = x;                       // المحلي يتقدّم على البعيد عند نفس المفتاح
    });
    return order.map(function(k){ return map[k]; }).sort(function(a,b){ return a.ts - b.ts; });
  }
  var bookmarks = unionItems(remote.bookmarks, lb, 'b');
  var notes = unionItems(remote.notes, ln, 'n');

  var themes = [], seenT = {};
  lt.concat(remote.savedThemes || []).forEach(function(s){
    if(tomb.t[s] || seenT[s]) return; seenT[s] = 1; themes.push(s);
  });

  var readStatus = {}, id;
  [remote.readStatus || {}, local.readStatus || {}].forEach(function(o){
    for(id in o) if(o[id]) readStatus[id] = true;
  });

  var pos = {}, rp = remote.readingPosition || {}, lp = local.readingPosition || {};
  for(id in rp) pos[id] = rp[id];
  var posChanged = [];
  for(id in lp){ if(!(id in pos) || posTs(lp[id]) >= posTs(pos[id])) pos[id] = lp[id]; }
  for(id in pos){ if(!lp[id] || posTs(pos[id]) > posTs(lp[id])) posChanged.push(id); }

  var merged = { bookmarks:bookmarks, notes:notes, savedThemes:themes, readStatus:readStatus, readingPosition:pos };
  var info = {
    bookmarks: sigKeys(bookmarks, keyOf) !== sigKeys(lb, keyOf),
    notes: sigKeys(notes, keyOf) !== sigKeys(ln, keyOf),
    themes: themes.slice().sort().join('\u0001') !== lt.slice().sort().join('\u0001'),
    readStatus: Object.keys(readStatus).sort().join(',') !== Object.keys(local.readStatus || {}).filter(function(k){ return local.readStatus[k]; }).sort().join(','),
    positionFor: posChanged,
    suspicious: suspicious
  };
  info.any = info.bookmarks || info.notes || info.themes || info.readStatus || posChanged.length > 0;
  return { merged: merged, tomb: tomb, info: info };
}
function sigKeys(arr, fn){ return (arr||[]).map(fn).sort().join('\u0001'); }
function signature(d, tomb){
  var rp = d.readingPosition || {}, rps = Object.keys(rp).sort().map(function(k){ return k + ':' + posTs(rp[k]); }).join(',');
  return [ sigKeys(d.bookmarks, keyOf), sigKeys(d.notes, keyOf), (d.savedThemes||[]).slice().sort().join('\u0001'),
           Object.keys(d.readStatus||{}).sort().join(','), rps,
           Object.keys(tomb.b).sort().join(','), Object.keys(tomb.n).sort().join(','), Object.keys(tomb.t).sort().join('\u0001') ].join('\u0002');
}
function snapOf(m){
  return { b:(m.bookmarks||[]).map(keyOf), n:(m.notes||[]).map(keyOf), t:(m.savedThemes||[]).slice() };
}

/* ---------- حالة كل قارئ (محلية) ---------- */
function loadState(readerKey){
  try{ var s = JSON.parse(lsGet(readerKey + '_cloudstate') || 'null'); if(s && s.snap) return s; }catch(e){}
  return { snap:{ b:[], n:[], t:[] }, tomb: emptyTomb(), rev: null };
}
function saveState(readerKey, s){ lsSet(readerKey + '_cloudstate', JSON.stringify(s)); }

/* ---------- مزامنة قارئ واحد: سحب ← دمج ← (تطبيق محلي) ← إرسال ---------- */
function syncOne(a){
  /* a: {readerKey, getPayload(), setPayload(d), stamp():رقم يتغيّر بتغيّر البيانات المحلية} */
  if(!configured()) return Promise.reject(new Error('not-configured'));
  var code = getCode();
  if(!code) return Promise.reject(new Error('no-code'));
  return sha256hex('readers-sync:' + code).then(function(hash){
    var attempt = 0;
    function loop(){
      attempt++;
      if(attempt > 5) return Promise.reject(new Error('busy'));
      var stamp0 = a.stamp();
      return rpc('rs_get', { p_hash: hash, p_reader: a.readerKey }).then(function(remote){
        var local = a.getPayload();
        var state = loadState(a.readerKey);
        var rp = remote && remote.payload ? remote.payload : null;
        var m = merge(local, rp, state);
        var outPayload = {
          v: 1, bookmarks: m.merged.bookmarks, notes: m.merged.notes, savedThemes: m.merged.savedThemes,
          readStatus: m.merged.readStatus, readingPosition: m.merged.readingPosition, tomb: m.tomb
        };
        var needPush = !rp || signature(outPayload, m.tomb) !== signature(rp, rp.tomb || emptyTomb());
        var after = needPush
          ? rpc('rs_put', { p_hash: hash, p_reader: a.readerKey, p_payload: outPayload, p_expected: remote ? remote.updated_at : null }, true)
          : Promise.resolve({ ok: true, updated_at: remote.updated_at });
        return after.then(function(res){
          if(!res || !res.ok){
            if(res && res.error === 'conflict') return loop();
            throw new Error('put-failed:' + (res && res.error));
          }
          if(a.stamp() !== stamp0) return loop();       // تغيّر شيء محلياً أثناء الاتصال: أعد الدمج على الأحدث
          if(m.info.any) a.setPayload(m.merged);
          saveState(a.readerKey, { snap: snapOf(m.merged), tomb: m.tomb, rev: res.updated_at });
          return m.info;
        });
      });
    }
    return loop();
  });
}

/* ---------- ربط قارئ مفتوح ---------- */
var att = null, quietDepth = 0, localStamp = 0;
var pushTimer = null, firstDirty = 0, inFlight = false, again = false;
var lastPull = 0, firstSyncDone = false, errShown = false;
var listeners = [];
var statusObj = { lastOk: 0, lastError: '', pending: false, running: false };

function emit(){ listeners.slice().forEach(function(f){ try{ f(status()); }catch(e){} }); }
function status(){
  return { configured: configured(), hasCode: !!getCode(), code: getCode(),
           lastOk: statusObj.lastOk, lastError: statusObj.lastError,
           pending: statusObj.pending, running: statusObj.running };
}
function runSync(reason){
  if(!att || !configured() || !getCode()) return Promise.resolve(null);
  if(inFlight){ again = true; return Promise.resolve(null); }
  inFlight = true; statusObj.running = true; emit();
  var isFirst = !firstSyncDone;
  return syncOne({
    readerKey: att.readerKey,
    getPayload: att.getPayload,
    setPayload: att.setPayload,
    stamp: function(){ return localStamp; }
  }).then(function(info){
    statusObj.lastOk = Date.now(); statusObj.lastError = ''; statusObj.pending = false;
    firstSyncDone = true; errShown = false; lastPull = Date.now();
    if(info && info.any && att.afterMerge){
      info.first = isFirst; info.reason = reason;
      try{ att.afterMerge(info); }catch(e){ console.warn('cloud afterMerge', e); }
    }
    return info;
  }).catch(function(err){
    statusObj.lastError = String(err && err.message || err);
    statusObj.pending = true;
    if(!errShown && att && att.toast){
      errShown = true;
      try{ att.toast('☁ تعذّرت المزامنة الآن — بياناتك محفوظة على الجهاز وستُرسل تلقائياً لاحقاً'); }catch(e){}
    }
    return null;
  }).then(function(r){
    inFlight = false; statusObj.running = false; emit();
    if(again){ again = false; schedulePush(); }
    return r;
  });
}
function schedulePush(){
  if(quietDepth > 0 || !att) return;
  localStamp++;
  if(!configured() || !getCode()) return;
  statusObj.pending = true;
  var now = Date.now();
  if(!firstDirty) firstDirty = now;
  clearTimeout(pushTimer);
  var wait = Math.min(PUSH_DELAY, Math.max(0, PUSH_MAX_WAIT - (now - firstDirty)));
  pushTimer = setTimeout(function(){ firstDirty = 0; runSync('push'); }, wait);
}
function flush(){
  if(!att || !statusObj.pending || !configured() || !getCode()) return;
  clearTimeout(pushTimer); firstDirty = 0;
  runSync('flush');
}
function attach(opts){
  att = opts;
  if(!configured()) return;
  if(!getCode()){
    if(!lsGet(LS_HINT) && opts.toast){
      lsSet(LS_HINT, '1');
      try{ opts.toast('☁ لتفعيل المزامنة بين أجهزتك: الصفحة الرئيسية ← لوحة التحكم ← المزامنة السحابية'); }catch(e){}
    }
    return;
  }
  runSync('attach');
  document.addEventListener('visibilitychange', function(){
    if(document.visibilityState === 'hidden') flush();
    else if(Date.now() - lastPull > PULL_MIN_GAP) runSync('visible');
  });
  window.addEventListener('pagehide', flush);
  window.addEventListener('online', function(){ runSync('online'); });
}
function quiet(fn){ quietDepth++; try{ fn(); } finally{ quietDepth--; } }

/* ---------- مزامنة كل القوارئ من الصفحة الرئيسية (بلا فتح أي قارئ) ---------- */
function localAdapter(key){
  var raw = lsGet(key), data = null;
  try{ data = JSON.parse(raw || 'null'); }catch(e){}
  if(!data || data._type !== 'my-reader-userdata') data = { _type:'my-reader-userdata', _version:1 };
  return {
    readerKey: key,
    getPayload: function(){
      var d = (function(){ try{ return JSON.parse(lsGet(key) || 'null') || data; }catch(e){ return data; } })();
      return { bookmarks:d.bookmarks||[], notes:d.notes||[], savedThemes:d.savedThemes||[],
               readStatus:d.readStatus||{}, readingPosition:d.readingPosition||{} };
    },
    setPayload: function(m){
      var d; try{ d = JSON.parse(lsGet(key) || 'null') || data; }catch(e){ d = data; }
      d._type = 'my-reader-userdata'; d._version = 1; d.savedAt = new Date().toISOString();
      d.bookmarks = m.bookmarks; d.notes = m.notes; d.savedThemes = m.savedThemes;
      d.readStatus = m.readStatus; d.readingPosition = m.readingPosition;
      lsSet(key, JSON.stringify(d));
    },
    stamp: function(){ return 0; }
  };
}
function syncAll(onProgress){
  var results = [], i = 0;
  function next(){
    if(i >= ALL_KEYS.length) return Promise.resolve(results);
    var key = ALL_KEYS[i++];
    return syncOne(localAdapter(key)).then(function(info){
      results.push({ key:key, ok:true, info:info });
    }).catch(function(err){
      results.push({ key:key, ok:false, error:String(err && err.message || err) });
    }).then(function(){ if(onProgress) onProgress(i, ALL_KEYS.length); return next(); });
  }
  return next();
}

window.ReaderCloud = {
  attach: attach, schedulePush: schedulePush, quiet: quiet, flush: flush,
  status: status, onStatus: function(f){ listeners.push(f); },
  configured: configured, getCode: getCode, setCode: setCode, genCode: genCode, clearCode: clearCode,
  syncAll: syncAll, syncNow: function(){ return runSync('manual'); },
  _merge: merge, _syncOne: syncOne, _keys: ALL_KEYS
};
})();
