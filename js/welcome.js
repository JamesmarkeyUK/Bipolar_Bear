/**
 * Welcome / landing page interactivity.
 *
 * Centrepiece: an interactive "mood meter" — drag / hover across the
 * wave and the Bear cycles through six mood faces (depressed → manic),
 * the readout + glow colour shift to match. Idles with a gentle auto
 * sweep until the visitor takes over, so it's alive on first paint.
 *
 * Plus: scroll-reveal, nav shrink, hero parallax, device tilt, and
 * drag-to-scroll galleries. All progressive — the page is fully
 * readable with JS disabled. Honours prefers-reduced-motion.
 *
 * @file js/welcome.js
 */
(function () {
  'use strict';

  // Tiny translation helper — resolves through the shared i18n module when
  // available, falls back to the key (or supplied default) if BB isn't loaded.
  function _t(k, v) { return (window.BB && window.BB.t) ? window.BB.t(k, v) : k; }

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ──────────────── 1. Interactive mood meter ──────────────── */
  // Low → high. `t` (0..1) maps linearly onto this scale. Name + tag are
  // resolved through i18n at render time (see render()) via their keys.
  var MOODS = [
    { nameKey: 'lp.meter.depressed.name', tagKey: 'lp.meter.depressed.tag', glow: '#9fb4c4', accent: '#5f7388' },
    { nameKey: 'lp.meter.low.name',       tagKey: 'lp.meter.low.tag',       glow: '#bcae9a', accent: '#7d8a55' },
    { nameKey: 'lp.meter.stable.name',    tagKey: 'lp.meter.stable.tag',    glow: '#ffd089', accent: '#e8870e' },
    { nameKey: 'lp.meter.good.name',      tagKey: 'lp.meter.good.tag',      glow: '#ffc46b', accent: '#ff8a00' },
    { nameKey: 'lp.meter.elevated.name',  tagKey: 'lp.meter.elevated.tag',  glow: '#ffb24d', accent: '#ff7a00' },
    { nameKey: 'lp.meter.manic.name',     tagKey: 'lp.meter.manic.tag',     glow: '#ff9a3d', accent: '#ff5a00' }
  ];

  var meter   = document.getElementById('moodMeter');
  var faces   = meter ? [].slice.call(meter.querySelectorAll('.mood-face')) : [];
  var nameEl  = document.getElementById('moodName');
  var tagEl   = document.getElementById('moodTag');
  var track   = document.getElementById('moodTrack');
  var handle  = document.getElementById('moodHandle');
  var waveLine = document.getElementById('moodWaveLine');
  var waveFill = document.getElementById('moodWaveFill');

  // Wave geometry in the SVG's 0..600 × 0..96 viewBox. The handle rides
  // exactly this curve because both are derived from waveY().
  var VB_W = 600, VB_H = 96;
  function waveY(t) {
    var mid = VB_H * 0.52, amp = VB_H * 0.34;
    // Two stacked sines → an organic "mood over time" ripple.
    return mid - amp * (0.62 * Math.sin(t * Math.PI * 3 - 0.7) +
                        0.32 * Math.sin(t * Math.PI * 6 + 1.1));
  }

  function buildWavePath() {
    if (!waveLine) return;
    var N = 64, line = '', fill = '';
    for (var i = 0; i <= N; i++) {
      var t = i / N, x = t * VB_W, y = waveY(t);
      line += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
    }
    waveLine.setAttribute('d', line.trim());
    if (waveFill) {
      fill = line.trim() + ' L' + VB_W + ' ' + VB_H + ' L0 ' + VB_H + ' Z';
      waveFill.setAttribute('d', fill);
    }
  }

  var current = -1;
  function render(t) {
    t = Math.max(0, Math.min(1, t));
    var idx = Math.round(t * (MOODS.length - 1));
    if (idx !== current) {
      current = idx;
      faces.forEach(function (f, i) { f.classList.toggle('active', i === idx); });
      var m = MOODS[idx];
      if (nameEl) nameEl.textContent = _t(m.nameKey);
      if (tagEl)  tagEl.textContent  = _t(m.tagKey);
      if (nameEl) nameEl.style.color = m.accent;
      if (handle) handle.style.borderColor = m.accent;
      meter.style.setProperty('--mood-glow', m.glow);
    }
    // Position the handle on the wave (track box maps 1:1 onto the viewBox).
    if (handle && track) {
      var w = track.clientWidth, h = track.clientHeight;
      handle.style.left = (t * w) + 'px';
      handle.style.top  = ((waveY(t) / VB_H) * h) + 'px';
    }
  }

  // ── Idle auto-sweep until the visitor interacts ──
  var userActive = false, idleT = 0, idleRAF = null, resumeTimer = null;
  function idleLoop(ts) {
    if (userActive) return;
    // Ease back and forth across the full mood range.
    var s = (Math.sin(ts / 2600) + 1) / 2;        // 0..1
    idleT = s;
    render(s);
    idleRAF = requestAnimationFrame(idleLoop);
  }
  function startIdle() {
    if (reduceMotion) { render(0.42); return; }
    cancelAnimationFrame(idleRAF);
    idleRAF = requestAnimationFrame(idleLoop);
  }
  function stopIdle() { userActive = true; cancelAnimationFrame(idleRAF); }

  function pointerToT(clientX) {
    var r = track.getBoundingClientRect();
    return (clientX - r.left) / r.width;
  }

  if (meter && track && faces.length) {
    buildWavePath();
    render(0.42);
    // Animate the wave drawing in, then begin idling.
    requestAnimationFrame(function () { meter.classList.add('drawn'); });
    startIdle();

    var dragging = false;
    function onMove(clientX) { render(pointerToT(clientX)); }

    meter.addEventListener('pointerenter', stopIdle);
    meter.addEventListener('pointermove', function (e) {
      stopIdle();
      if (e.pointerType === 'mouse' || dragging) onMove(e.clientX);
    });
    meter.addEventListener('pointerdown', function (e) {
      dragging = true; stopIdle(); onMove(e.clientX);
      if (meter.setPointerCapture) { try { meter.setPointerCapture(e.pointerId); } catch (_) {} }
    });
    window.addEventListener('pointerup', function () { dragging = false; });
    meter.addEventListener('pointerleave', function () {
      // Hand control back to the gentle idle after a short pause.
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(function () { userActive = false; startIdle(); }, 1600);
    });
    window.addEventListener('resize', function () { buildWavePath(); render(idleT); });
  }

  /* ──────────── 1b. Monika shuffler (anonymous hero) ──────────── */
  // The anon-page analogue of the mood meter: click (or idle-watch) to
  // cycle through example anonymous "monikas" — name, avatar colour and a
  // sample post all change together, showing how you post without your
  // real identity. No-ops on the Bear page (no #monikaCard there).
  (function () {
    var card = document.getElementById('monikaCard');
    if (!card) return;
    var nameEl  = document.getElementById('monikaName');
    var nameEl2 = document.getElementById('monikaName2');
    var av1 = document.getElementById('monikaAvatar');
    var av2 = document.getElementById('monikaAvatar2');
    var postEl = document.getElementById('monikaPost');
    var shuffleBtn = document.getElementById('monikaShuffle');

    var MONIKAS = ['SunflowerSeed', 'QuietOtter', 'NightWatch', 'SilverLining',
      'BraveSparrow', 'CalmHarbor', 'SteadyOak', 'MoonlitFox', 'HopefulFinch',
      'RiverStone', 'KindEmber', 'GentleTide'];
    var COLORS = ['#ff9f1c', '#2ec4b6', '#9b5de5', '#3a86ff', '#ff5d8f',
      '#06d6a0', '#ef476f', '#f6a700'];
    // Example community posts — resolved through i18n at render time.
    var POST_KEYS = [
      'lp.meter.posts.p1',
      'lp.meter.posts.p2',
      'lp.meter.posts.p3',
      'lp.meter.posts.p4',
      'lp.meter.posts.p5',
      'lp.meter.posts.p6'
    ];
    function initials(name) { return (name.match(/[A-Z]/g) || ['B', 'A']).slice(0, 2).join(''); }

    var i = 0;
    function render() {
      var name = MONIKAS[i % MONIKAS.length];
      var color = COLORS[i % COLORS.length];
      var ini = initials(name);
      if (nameEl)  nameEl.textContent = name;
      if (nameEl2) nameEl2.textContent = name;
      if (av1) { av1.textContent = ini; av1.style.background = color; }
      if (av2) { av2.textContent = ini; av2.style.background = color; }
      if (postEl) postEl.textContent = _t(POST_KEYS[i % POST_KEYS.length]);
    }
    function shuffle() { i = (i + 1) % MONIKAS.length; render(); }

    render();
    if (shuffleBtn) shuffleBtn.addEventListener('click', function () { shuffle(); kick(); });

    var timer = null;
    function start() { if (reduceMotion || timer) return; timer = setInterval(shuffle, 3200); }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function kick() { stop(); start(); }
    card.addEventListener('pointerenter', stop);
    card.addEventListener('pointerleave', start);
    start();
  })();

  /* ──────────────── 2. Scroll reveal ──────────────── */
  var reveals = [].slice.call(document.querySelectorAll('.reveal'));
  if (reveals.length && 'IntersectionObserver' in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }

  /* ──────────────── 3. Nav shrink on scroll ──────────────── */
  var nav = document.getElementById('nav');
  function onScroll() {
    if (!nav) return;
    nav.classList.toggle('scrolled', window.scrollY > 28);
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ──────────────── 4. Hero parallax ──────────────── */
  if (!reduceMotion) {
    var floaties = [].slice.call(document.querySelectorAll('.floatie'));
    var hero = document.getElementById('hero');
    if (hero && floaties.length) {
      hero.addEventListener('pointermove', function (e) {
        var r = hero.getBoundingClientRect();
        var dx = (e.clientX - r.left) / r.width - 0.5;
        var dy = (e.clientY - r.top) / r.height - 0.5;
        floaties.forEach(function (f, i) {
          var depth = (i + 1) * 7;
          f.style.transform = 'translate(' + (-dx * depth) + 'px,' + (-dy * depth) + 'px)';
        });
      });
    }
  }

  /* ──────────────── 5. Screenshot carousels ──────────────── */
  // Each app showcase has a swipeable carousel inside its phone frame:
  // arrows + dots + drag/swipe + gentle auto-advance (paused on hover and
  // disabled for reduced-motion).
  [].slice.call(document.querySelectorAll('[data-carousel]')).forEach(function (root) {
    var viewport = root.querySelector('.carousel-viewport');
    var track = root.querySelector('.carousel-track');
    var slides = [].slice.call(root.querySelectorAll('.carousel-slide'));
    var dotsWrap = root.querySelector('.carousel-dots');
    var prevBtn = root.querySelector('.carousel-arrow.prev');
    var nextBtn = root.querySelector('.carousel-arrow.next');
    var n = slides.length;
    if (!n || !track || !viewport) return;
    var idx = 0, timer = null;
    // One screenshot fills the phone screen; SLIDE is the per-step shift in %.
    var SLIDE = 100, OFF = 0;

    var dots = slides.map(function (_, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'carousel-dot' + (i === 0 ? ' active' : '');
      b.setAttribute('aria-label', _t('lp.carousel.screenshotLabel', { i: i + 1, n: n }));
      b.addEventListener('click', function () { go(i); kick(); });
      if (dotsWrap) dotsWrap.appendChild(b);
      return b;
    });

    function go(i, instant) {
      idx = (i % n + n) % n;
      if (instant) track.classList.add('no-anim');
      track.style.transform = 'translateX(' + (OFF - idx * SLIDE) + '%)';
      if (instant) { void track.offsetWidth; track.classList.remove('no-anim'); }
      dots.forEach(function (d, di) { d.classList.toggle('active', di === idx); });
      slides.forEach(function (s, si) { s.classList.toggle('is-active', si === idx); });
      // Keep the hero screenshot clean — arrows only show once the carousel
      // has moved past slide 1 (auto-advance reveals them naturally).
      root.classList.toggle('on-hero', idx === 0);
    }
    if (prevBtn) prevBtn.addEventListener('click', function () { go(idx - 1); kick(); });
    if (nextBtn) nextBtn.addEventListener('click', function () { go(idx + 1); kick(); });

    // Drag / swipe on the image area (arrows excluded).
    var down = false, startX = 0, dx = 0, w = 1;
    viewport.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.carousel-arrow')) return;
      down = true; startX = e.clientX; dx = 0; w = viewport.clientWidth || 1;
      track.classList.add('no-anim'); stop();
      if (viewport.setPointerCapture) { try { viewport.setPointerCapture(e.pointerId); } catch (_) {} }
    });
    viewport.addEventListener('pointermove', function (e) {
      if (!down) return;
      dx = e.clientX - startX;
      track.style.transform = 'translateX(' + (OFF - idx * SLIDE + (dx / w) * 100) + '%)';
    });
    function release() {
      if (!down) return;
      down = false;
      track.classList.remove('no-anim');
      if (Math.abs(dx) > w * 0.18) { go(idx + (dx < 0 ? 1 : -1)); }
      else { go(idx); }
      kick();
    }
    viewport.addEventListener('pointerup', release);
    viewport.addEventListener('pointercancel', release);

    function start() { if (reduceMotion || timer) return; timer = setInterval(function () { go(idx + 1); }, 4800); }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function kick() { stop(); start(); }
    root.addEventListener('pointerenter', stop);
    root.addEventListener('pointerleave', start);

    go(0, true);
    // Slides 2+ are loading="lazy", but the phone screen clips all but the
    // active slide, so the browser never sees them as visible and they'd stay
    // blank (black) when swiped to. Force them to fetch once the carousel is
    // on screen — keeps the lazy benefit until the user gets near it.
    function loadAll() { slides.forEach(function (s) { if (s.loading === 'lazy') s.loading = 'eager'; }); }
    // Hold on the hero screenshot (slide 1) until the carousel scrolls into
    // view, so visitors always land on it before it starts cycling.
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries, obs) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { loadAll(); start(); obs.disconnect(); }
        });
      }, { threshold: 0.4 });
      io.observe(root);
    } else {
      loadAll();
      start();
    }
  });

  /* ──────────────── 6. Placeholder store links ──────────────── */
  // Store URLs land later — keep the badges inert (and honest) for now.
  [].slice.call(document.querySelectorAll('.store-badge[data-store]')).forEach(function (a) {
    a.addEventListener('click', function (e) {
      if (a.getAttribute('href') === '#') e.preventDefault();
    });
  });
})();
