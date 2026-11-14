/* reader-fab.js v1 — زر إخفاء/إظهار لوحة الأدوات (#tb-fab) في القراء العشرة:
   1) شفاف حتى لا يحجب النص الذي يمرّ تحته (يزداد وضوحاً أثناء السحب فقط).
   2) قابل للتحريك بالسحب (لمس/فأرة) ويُحفظ موضعه على الجهاز، ويبقى داخل الشاشة.
   الضغطة القصيرة تعمل كما كانت (toggleToolbars)، أما السحب فلا يُشغّلها.
   لا يغيّر نص الزر ولا DOM الصفحة، فلا يتعارض مع ترجمة Chrome. */
(function(){
  'use strict';
  var KEY = 'readerFabPos_v1', THRESH = 6, EDGE = 4;

  function injectCss(){
    if(document.getElementById('reader-fab-css')) return;
    var s = document.createElement('style'); s.id = 'reader-fab-css';
    s.textContent =
      '#tb-fab{opacity:.34!important;touch-action:none!important;cursor:grab;transition:opacity .15s}' +
      '#tb-fab.bars-hidden{opacity:.42!important}' +
      '#tb-fab.fab-dragging{opacity:.9!important;cursor:grabbing;transition:none;transform:scale(1.05)}';
    document.head.appendChild(s);
  }

  function clamp(b, x, y){
    var w = b.offsetWidth || 54, h = b.offsetHeight || 54;
    var maxX = Math.max(EDGE, window.innerWidth - w - EDGE);
    var maxY = Math.max(EDGE, window.innerHeight - h - EDGE);
    return { x: Math.min(Math.max(EDGE, x), maxX), y: Math.min(Math.max(EDGE, y), maxY) };
  }
  function place(b, x, y){
    var p = clamp(b, x, y);
    b.style.left = p.x + 'px'; b.style.top = p.y + 'px';
    b.style.right = 'auto'; b.style.bottom = 'auto';
    return p;
  }
  function load(){ try{ var v = JSON.parse(localStorage.getItem(KEY) || 'null'); if(v && isFinite(v.x) && isFinite(v.y)) return v; }catch(e){} return null; }
  function save(p){ try{ localStorage.setItem(KEY, JSON.stringify(p)); }catch(e){} }

  function init(){
    var b = document.getElementById('tb-fab');
    if(!b || b.__fabDrag) return;
    b.__fabDrag = true;
    injectCss();

    var saved = load();
    if(saved) place(b, saved.x, saved.y);

    var down = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0, pid = null, justDragged = false;

    b.addEventListener('pointerdown', function(e){
      if(e.pointerType === 'mouse' && e.button !== 0) return;
      var r = b.getBoundingClientRect();
      down = true; moved = false; pid = e.pointerId;
      sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      try{ b.setPointerCapture(pid); }catch(_){}
    });
    b.addEventListener('pointermove', function(e){
      if(!down || e.pointerId !== pid) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if(!moved){
        if(Math.abs(dx) < THRESH && Math.abs(dy) < THRESH) return;
        moved = true; b.classList.add('fab-dragging');
      }
      e.preventDefault();
      place(b, ox + dx, oy + dy);
    });
    function end(e){
      if(!down || (e && e.pointerId !== pid)) return;
      down = false;
      try{ b.releasePointerCapture(pid); }catch(_){}
      b.classList.remove('fab-dragging');
      if(moved){
        justDragged = true; setTimeout(function(){ justDragged = false; }, 350);
        var r = b.getBoundingClientRect(); save({ x: Math.round(r.left), y: Math.round(r.top) });
      }
    }
    b.addEventListener('pointerup', end);
    b.addEventListener('pointercancel', end);

    // السحب لا يُحسب ضغطة: نمنع onclick="toggleToolbars()" بعده مباشرة
    window.addEventListener('click', function(e){
      if(justDragged && (e.target === b || b.contains(e.target))){ e.stopImmediatePropagation(); e.preventDefault(); justDragged = false; }
    }, true);

    window.addEventListener('resize', function(){
      var r = b.getBoundingClientRect();
      if(b.style.left) { var p = place(b, r.left, r.top); save(p); }
    });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
