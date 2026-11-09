/* reader-custom.js v1 — القوارئ المخصّصة: رفع قارئ جديد إلى المكتبة تلقائياً وفتحه من السحابة
 *
 * الفكرة: ملف القارئ المعبَّأ (الذي حُفظ بزر «📚 حفظ») يُرفع من الصفحة الرئيسية إلى Supabase مضغوطاً على قطع صغيرة
 * عبر دوال rc_* (انظر supabase-custom-readers.sql)، فيظهر في المكتبة على كل أجهزتك المرتبطة بالرمز نفسه، ويُفتح عبر
 * readers/_custom.html الذي يجلبه من السحابة ويعرضه من الموقع نفسه (فيشترك في التخزين المحلي والمزامنة مع بقية القوارئ).
 * عند الرفع يُعطى القارئ مفتاح تخزين خاصاً به بدل مفتاح القالب، فلا تتداخل بياناته (تظليل/ملاحظات/مواضع) مع غيره،
 * وتُزامَن بياناته تلقائياً كأي قارئ آخر.
 *
 * يعتمد على: cloud-config.js و cloud-sync.js (يحمّلهما كل من يستعمل هذا الملف قبله).
 */
(function(){
'use strict';
if(window.ReaderCustom) return;

var CFG = window.READER_CLOUD_CONFIG || {};
var SITE_BASE = 'https://alya71712-svg.github.io/readers/';
var LS_CACHE = 'readers_custom_cache_v1';
var CHUNK_BYTES = 750 * 1024;          // قطعة مضغوطة ≈ 1 ميجا بعد base64 (حد الخادم 1.6 مليون حرف)
var MAX_RAW = 120 * 1024 * 1024;       // أكبر ملف قارئ مقبول قبل الضغط
var PUT_TRIES = 4;
var ID_RE = /^[a-z0-9_-]{1,60}$/;
var KEY_RE = /^myreader_userdata_custom_([a-z0-9_-]{1,60})_v1$/;

/* ---------- أدوات ---------- */
function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
function configured(){ return !!(CFG.url && CFG.key); }
function code(){ return (window.ReaderCloud && ReaderCloud.getCode && ReaderCloud.getCode()) || ''; }
function sha256hex(s){
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function(buf){
    return Array.prototype.map.call(new Uint8Array(buf), function(b){ return ('0'+b.toString(16)).slice(-2); }).join('');
  });
}
function myHash(){
  var c = code();
  if(!c) return Promise.reject(new Error('no-code'));
  return sha256hex('readers-sync:' + c);
}
function rpc(name, args){
  var url = String(CFG.url).replace(/\/+$/,'') + '/rest/v1/rpc/' + name;
  return fetch(url, { method:'POST', headers:{ 'apikey':CFG.key, 'Content-Type':'application/json' }, body:JSON.stringify(args) })
    .then(function(r){ if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
}
function rpcRetry(name, args, tries){
  var n = 0;
  function go(){
    n++;
    return rpc(name, args).catch(function(e){
      if(n >= (tries || PUT_TRIES)) throw e;
      return sleep(500 * n).then(go);
    });
  }
  return go();
}
function supported(){ return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined' && !!window.crypto && !!crypto.subtle; }

/* ---------- ضغط وترميز ---------- */
function gzipText(text){
  var stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer().then(function(b){ return new Uint8Array(b); });
}
function gunzipParts(parts){
  var stream = new Blob(parts).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}
function bytesToB64(u8){
  return new Promise(function(res, rej){
    var fr = new FileReader();
    fr.onload = function(){ res(String(fr.result).split(',')[1] || ''); };
    fr.onerror = function(){ rej(fr.error || new Error('encode')); };
    fr.readAsDataURL(new Blob([u8]));
  });
}
function b64ToBytes(b64){
  var bin = atob(b64), n = bin.length, u = new Uint8Array(n), i;
  for(i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
  return u;
}

/* ---------- ذاكرة محلية: القائمة (localStorage) والنصوص (IndexedDB) ---------- */
function cached(){ try{ var a = JSON.parse(lsGet(LS_CACHE) || '[]'); return Array.isArray(a) ? a : []; }catch(e){ return []; } }
function setCached(a){ lsSet(LS_CACHE, JSON.stringify(a || [])); }
function idb(){
  return new Promise(function(res){
    try{
      var r = indexedDB.open('readers_custom_v1', 1);
      r.onupgradeneeded = function(){ r.result.createObjectStore('html'); };
      r.onsuccess = function(){ res(r.result); };
      r.onerror = function(){ res(null); };
    }catch(e){ res(null); }
  });
}
function idbOp(mode, fn){
  return idb().then(function(db){
    if(!db) return null;
    return new Promise(function(res){
      try{
        var tx = db.transaction('html', mode), rq = fn(tx.objectStore('html'));
        tx.oncomplete = function(){ res(rq && rq.result !== undefined ? rq.result : null); db.close(); };
        tx.onerror = tx.onabort = function(){ res(null); try{ db.close(); }catch(e){} };
      }catch(e){ res(null); }
    });
  });
}
function idbGet(id){ return idbOp('readonly', function(s){ return s.get(id); }); }
function idbPut(id, rec){ return idbOp('readwrite', function(s){ return s.put(rec, id); }); }
function idbDel(id){ return idbOp('readwrite', function(s){ return s.delete(id); }); }

/* ---------- فحص الملف وتجهيزه ---------- */
var LIB_RE = /<script[^>]*\bid="library-data"[^>]*>([\s\S]*?)<\/script>/;
var KEYDECL_RE = /(const\s+LOCAL_STORAGE_KEY\s*=\s*')([^']*)(')/;

/* يتحقق أن الملف قارئ صالح ويستخرج عنوانه وعدد نصوصه ومفتاحه */
function inspect(text){
  if(typeof text !== 'string' || text.length < 1000) return { ok:false, error:'الملف فارغ أو ليس قارئاً.' };
  if(text.length > MAX_RAW) return { ok:false, error:'الملف أكبر من الحد المسموح (' + Math.round(MAX_RAW/1048576) + ' ميجابايت).' };
  var km = KEYDECL_RE.exec(text), lm = LIB_RE.exec(text);
  if(!km || !lm) return { ok:false, error:'هذا الملف لا يبدو قارئاً من هذا المشروع (لم أجد بنية القارئ). استخدم ملفاً حفظته بزر «📚 حفظ» من قارئ.' };
  var lib;
  try{ lib = JSON.parse(lm[1] || '[]'); }catch(e){ return { ok:false, error:'بيانات الكتب داخل الملف تالفة.' }; }
  if(!Array.isArray(lib)) return { ok:false, error:'بيانات الكتب داخل الملف غير صالحة.' };
  var tm = /<title>([^<]*)<\/title>/.exec(text), idm = KEY_RE.exec(km[2]);
  return { ok:true, title: tm ? tm[1].trim() : '', texts: lib.length, key: km[2], existingId: idm ? idm[1] : '', size: text.length };
}
function newId(){
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}
function keyFor(id){ return 'myreader_userdata_custom_' + id + '_v1'; }
function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/* يعدّل الملف للنشر: مفتاح تخزين خاص، مسارات السكربتات كاملة، العنوان، وإزالة ما حقنه المحمّل من قبل */
function prepare(text, id, title){
  var out = text.replace(/<script\b[^>]*\bdata-rc-inject[^>]*>[\s\S]*?<\/script>\s*/g, '');
  out = out.replace(KEYDECL_RE, function(m, a, k, c){ return a + keyFor(id) + c; });
  out = out.split('template_base').join(id);   // بقية ما يشير للقالب (مثل اسم ملف النسخة الاحتياطية)
  out = out.replace(/(<script\b[^>]*?\bsrc=")\.\.\//g, function(m, a){ return a + SITE_BASE; });
  if(title) out = out.replace(/<title>[^<]*<\/title>/, '<title>' + escHtml(title) + '</title>');
  return out;
}

/* ---------- الواجهة العامة ---------- */
function list(){
  return myHash().then(function(h){ return rpcRetry('rc_list', { p_hash:h }, 3); }).then(function(r){
    if(!r || !r.ok) throw new Error((r && r.error) || 'rc_list');
    setCached(r.readers || []);
    return r.readers || [];
  });
}

/* يرفع القارئ: ضغط ← قطع ← نشر. opts: {id?, title, sub, desc, accent}. progress(نص) اختياري */
function publish(text, opts, progress){
  opts = opts || {};
  var say = function(t){ try{ if(progress) progress(t); }catch(e){} };
  if(!configured()) return Promise.reject(new Error('المزامنة السحابية غير مفعّلة.'));
  if(!supported()) return Promise.reject(new Error('متصفحك لا يدعم الضغط المطلوب. حدّث Chrome أو Safari.'));
  var info = inspect(text);
  if(!info.ok) return Promise.reject(new Error(info.error));
  var id = opts.id && ID_RE.test(opts.id) ? opts.id : (info.existingId || newId());
  var title = String(opts.title || info.title || 'قارئ جديد').slice(0, 120);
  var prepared = prepare(text, id, title);
  var ver = Date.now().toString(36);
  var meta = { title:title, sub:String(opts.sub || '').slice(0, 120), desc:String(opts.desc || '').slice(0, 400),
               accent:/^#[0-9a-fA-F]{6}$/.test(opts.accent || '') ? opts.accent : '#8b4e3a',
               texts:info.texts, key:keyFor(id), enc:'gzip-b64' };
  var hash, bytes, n;
  say('جارٍ ضغط الملف…');
  return myHash().then(function(h){ hash = h; return gzipText(prepared); }).then(function(u8){
    bytes = u8; n = Math.max(1, Math.ceil(bytes.length / CHUNK_BYTES));
    if(n > 190) throw new Error('الملف كبير جداً بعد الضغط.');
    var i = 0;
    function next(){
      if(i >= n) return Promise.resolve();
      var idx = i++;
      say('جارٍ الرفع إلى السحابة… ' + (idx + 1) + ' / ' + n);
      return bytesToB64(bytes.subarray(idx * CHUNK_BYTES, (idx + 1) * CHUNK_BYTES)).then(function(b64){
        return rpcRetry('rc_put_chunk', { p_hash:hash, p_id:id, p_ver:ver, p_idx:idx, p_data:b64 });
      }).then(function(r){
        if(!r || !r.ok) throw new Error('رفض الخادم القطعة ' + (idx + 1) + '.');
        return next();
      });
    }
    return next();
  }).then(function(){
    say('جارٍ نشر القارئ في المكتبة…');
    return rpcRetry('rc_commit', { p_hash:hash, p_id:id, p_ver:ver, p_n:n, p_size:prepared.length, p_meta:meta });
  }).then(function(r){
    if(!r || !r.ok){
      throw new Error(r && r.error === 'too_many' ? 'بلغتَ الحد الأقصى (40 قارئاً مخصّصاً). أزل قارئاً أولاً.' : 'تعذّر نشر القارئ (' + ((r && r.error) || 'خطأ') + ').');
    }
    return idbPut(id, { ver:ver, text:prepared });   // أول فتح فوري من هذا الجهاز دون تنزيل
  }).then(function(){
    return { id:id, ver:ver, n:n, meta:meta, size:prepared.length };
  });
}

/* يجلب نص القارئ المنشور (من الذاكرة المحلية إن كانت نسخته مطابقة، وإلا من السحابة) */
function getHtml(id, progress, hint){
  var say = function(t){ try{ if(progress) progress(t); }catch(e){} };
  if(!ID_RE.test(id || '')) return Promise.reject(new Error('معرّف القارئ غير صالح.'));
  var hash, entry = hint || null, attempt = 0;
  function resolveEntry(){
    if(entry) return Promise.resolve(entry);
    return list().then(function(a){ return a.filter(function(x){ return x.id === id; })[0] || null; }, function(){
      return cached().filter(function(x){ return x.id === id; })[0] || null;   // دون اتصال: آخر قائمة معروفة
    });
  }
  function run(){
    attempt++;
    return resolveEntry().then(function(e){
      entry = e;
      return idbGet(id).then(function(rec){
        if(rec && rec.text && (!entry || rec.ver === entry.ver)) return rec.text;
        if(!entry) throw new Error('لا يوجد قارئ بهذا المعرّف في مكتبتك.');
        return download(entry);
      });
    });
  }
  function download(e){
    return myHash().then(function(h){
      hash = h;
      var parts = [], from = 0;
      function more(){
        if(from >= e.n) return Promise.resolve();
        say('جارٍ التحميل من السحابة… ' + Math.min(from + 1, e.n) + ' / ' + e.n);
        return rpcRetry('rc_get_chunks', { p_hash:hash, p_id:id, p_ver:e.ver, p_from:from, p_count:4 }, 3).then(function(r){
          var ch = (r && r.chunks) || [], want = Math.min(4, e.n - from);
          if(ch.length !== want) throw new Error('stale');
          ch.forEach(function(b64){ parts.push(b64ToBytes(b64)); });
          from += want;
          return more();
        });
      }
      return more().then(function(){
        say('جارٍ فكّ الضغط…');
        return gunzipParts(parts);
      }).then(function(text){
        return idbPut(id, { ver:e.ver, text:text }).then(function(){ return text; });
      });
    });
  }
  return run().catch(function(err){
    // نُشرت نسخة أحدث أثناء التحميل: نعيد قراءة القائمة مرة واحدة
    if(err && err.message === 'stale' && attempt < 2){ entry = null; return run(); }
    throw err;
  });
}

function remove(id){
  if(!ID_RE.test(id || '')) return Promise.reject(new Error('معرّف غير صالح'));
  return myHash().then(function(h){ return rpcRetry('rc_del', { p_hash:h, p_id:id }, 3); }).then(function(r){
    if(!r || !r.ok) throw new Error('تعذّرت الإزالة.');
    setCached(cached().filter(function(x){ return x.id !== id; }));
    return idbDel(id);
  });
}

/* كائن قارئ بصيغة قائمة لوحة التحكم (READERS) من سجلّ سحابي */
function toReader(e){
  var m = e.meta || {}, texts = m.texts || 0;
  return { id:'c-' + e.id, cid:e.id, custom:true, key:m.key || keyFor(e.id),
           title:m.title || 'قارئ جديد', sub:m.sub || '',
           desc:m.desc || (texts ? 'قارئ مضاف يضم ' + texts + ' نصاً.' : 'قارئ مضاف.'),
           texts:texts, accent:m.accent || '#8b4e3a', file:'readers/_custom.html?c=' + e.id };
}

window.ReaderCustom = {
  supported:supported, inspect:inspect, prepare:prepare, publish:publish, list:list, cached:cached,
  getHtml:getHtml, remove:remove, toReader:toReader, keyFor:keyFor, idFromKey:function(k){ var m = KEY_RE.exec(k || ''); return m ? m[1] : ''; }
};
})();
