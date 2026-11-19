/* بوابة كلمة المرور للموقع.
   - تُحمَّل أول سكربت في <head> لكل صفحة، فتُخفي الصفحة حتى يُدخَل الباسورد.
   - الباسورد نفسه لا يُحفظ في أي مكان؛ يُحفظ فقط ناتج اشتقاقه (PBKDF2) في SG_HASH.
   - بعد الدخول الصحيح يُتذكَّر الجهاز (localStorage) فلا يُطلب الباسورد في كل صفحة.
   - تنبيه: هذا حاجز على مستوى المتصفح فقط، فالمستودع على GitHub عام وملفاته
     تبقى قابلة للفتح مباشرة لمن يعرف روابطها.
   - لتغيير الباسورد: اشتقّ بصمة جديدة بنفس المعاملات (الملح والتكرارات أدناه) وضعها في SG_HASH.
   - للخروج من هذا الجهاز: افتح وحدة التحكم ونفّذ siteGateLogout() */
(function () {
  'use strict';

  var SG_SALT = 'readers-gate-v1';
  var SG_ITER = 300000;
  var SG_HASH = '97e66f24c3f4827c78ec6bf68bf6df2029aa8e63a545584df0d182c783b248ff';
  var KEY = 'sg_ok_v1';

  var root = document.documentElement;

  // قبل ضبط البصمة (أول مرة) لا تُقفل الصفحات حتى لا يحدث حبس خارج الموقع.
  if (SG_HASH === '__SG_HASH__') return;

  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function remember() {
    try { localStorage.setItem(KEY, '1' + SG_HASH); } catch (e) {}
  }
  window.siteGateLogout = function () {
    try { localStorage.removeItem(KEY); } catch (e) {}
    location.reload();
  };

  // الجهاز معروف: لا إخفاء ولا وميض.
  if (stored() === '1' + SG_HASH) return;

  var hasSubtle = !!(window.crypto && window.crypto.subtle);
  // فتح الملف محلياً (file://) بمتصفح بلا crypto.subtle: لا يمكن التحقق، فنتركه.
  if (!hasSubtle && location.protocol === 'file:') return;

  // إخفاء الصفحة (visibility لا display حتى لا تتأثر قياسات السكربتات).
  var st = document.createElement('style');
  st.id = 'sg-hide';
  st.textContent = 'html{visibility:hidden!important}#sg-box{visibility:visible!important}';
  (document.head || root).appendChild(st);

  function derive(pw) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits'])
      .then(function (k) {
        return crypto.subtle.deriveBits(
          { name: 'PBKDF2', salt: enc.encode(SG_SALT), iterations: SG_ITER, hash: 'SHA-256' },
          k, 256);
      })
      .then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) {
          return ('0' + b.toString(16)).slice(-2);
        }).join('');
      });
  }

  function unlock() {
    var s = document.getElementById('sg-hide');
    if (s) s.parentNode.removeChild(s);
    var b = document.getElementById('sg-box');
    if (b) b.parentNode.removeChild(b);
  }

  var box = document.createElement('div');
  box.id = 'sg-box';
  box.setAttribute('dir', 'rtl');
  box.style.cssText =
    'position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483647;' +
    'background:#f7f1e7;display:flex;align-items:center;justify-content:center;' +
    'font-family:system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;color:#3b2a20;';
  box.innerHTML =
    '<form id="sg-form" autocomplete="off" style="width:min(88vw,340px);text-align:center">' +
      '<div style="font-size:22px;font-weight:700;margin-bottom:6px">القراء العشرة</div>' +
      '<div style="font-size:14px;opacity:.7;margin-bottom:18px">أدخل كلمة المرور للمتابعة</div>' +
      '<input id="sg-pw" type="password" autocomplete="current-password" inputmode="text" ' +
        'style="width:100%;box-sizing:border-box;padding:12px 14px;font-size:18px;' +
        'border:1px solid #c9b8a4;border-radius:10px;background:#fff;color:#3b2a20;text-align:center" />' +
      '<button id="sg-go" type="submit" ' +
        'style="margin-top:12px;width:100%;padding:12px;font-size:17px;border:0;border-radius:10px;' +
        'background:#8b4e3a;color:#fff;cursor:pointer">دخول</button>' +
      '<div id="sg-err" style="min-height:22px;margin-top:10px;font-size:14px;color:#a02020"></div>' +
    '</form>';
  root.appendChild(box);

  function wire() {
    var form = document.getElementById('sg-form');
    var pw = document.getElementById('sg-pw');
    var err = document.getElementById('sg-err');
    var go = document.getElementById('sg-go');
    if (!form || form.__wired) return;
    form.__wired = true;
    try { pw.focus(); } catch (e) {}

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!hasSubtle) { err.textContent = 'هذا المتصفح لا يدعم التحقق. استخدم متصفحاً حديثاً.'; return; }
      var v = pw.value;
      if (!v) return;
      go.disabled = true;
      err.textContent = '';
      derive(v).then(function (h) {
        if (h === SG_HASH) {
          remember();
          unlock();
        } else {
          err.textContent = 'كلمة المرور غير صحيحة';
          pw.value = '';
          go.disabled = false;
          try { pw.focus(); } catch (e) {}
        }
      }).catch(function () {
        err.textContent = 'تعذّر التحقق، أعد المحاولة';
        go.disabled = false;
      });
    });
  }

  if (document.getElementById('sg-form')) wire();
  document.addEventListener('DOMContentLoaded', wire);
})();
