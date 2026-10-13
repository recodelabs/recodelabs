/* ==========================================================================
   RECODE LABS — PROJECT DIAGRAM MOTION
   Each diagram marked with data-anim plays while it is on screen, holding
   its final frame for a few seconds between plays, and replays at once when
   its card is hovered or focused. For visitors who ask for reduced motion,
   diagrams stay static and play only when their card is hovered or focused.
   The markup is the final frame, so without JS the static diagram is shown.
   ========================================================================== */

(() => {
  if (!('IntersectionObserver' in window)) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const clamp = v => Math.min(1, Math.max(0, v));
  const ease = {
    linear: t => t,
    out: t => 1 - Math.pow(1 - t, 3),
    inOut: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  };

  // A player runs a list of tracks. Each track maps local progress 0..1 to
  // element state; `at` and `dur` are in seconds from the start of the play.
  function player(tracks) {
    const total = Math.max(...tracks.map(t => t.at + t.dur));
    let raf = 0;
    let running = false;
    const render = time => tracks.forEach(tr => {
      tr.set((tr.ease || ease.out)(clamp((time - tr.at) / (tr.dur || 0.001))));
    });
    return {
      get running() { return running; },
      reset() { cancelAnimationFrame(raf); running = false; render(-1); },
      play(onDone) {
        if (running) return;
        running = true;
        const t0 = performance.now();
        const tick = now => {
          const t = (now - t0) / 1000;
          render(t);
          if (t < total) raf = requestAnimationFrame(tick);
          else { running = false; if (onDone) onDone(); }
        };
        raf = requestAnimationFrame(tick);
      },
    };
  }

  const baseOpacity = el => parseFloat(el.getAttribute('opacity') || '1');

  /* Elly: a playhead runs across the session audio. The waveform is
     processed behind it, and each event is tagged as the playhead reaches it. */
  function elly(svg) {
    const wave = svg.querySelector('[data-wave]');
    const head = svg.querySelector('[data-playhead]');
    const clock = svg.querySelector('[data-clock]');
    const count = svg.querySelector('[data-event-count]');
    const events = [...svg.querySelectorAll('[data-event]')].map(g => ({ g, x: +g.dataset.x }));
    const len = wave.getTotalLength();
    wave.style.strokeDasharray = len;

    // The path runs left to right, so sample it once to map x to length.
    const samples = [];
    for (let i = 0; i <= 400; i++) {
      const l = (len * i) / 400;
      samples.push({ l, x: wave.getPointAtLength(l).x });
    }
    const lengthAt = x => {
      const i = samples.findIndex(s => s.x >= x);
      if (i <= 0) return i === 0 ? 0 : len;
      const a = samples[i - 1], b = samples[i];
      return a.l + ((x - a.x) / (b.x - a.x || 1)) * (b.l - a.l);
    };

    const x0 = 40, x1 = 720, start = 0.2, dur = 4.2, seconds = 252;
    const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

    const tracks = [{
      at: start, dur, ease: ease.linear,
      set(p) {
        const x = x0 + (x1 - x0) * p;
        wave.style.strokeDashoffset = len - lengthAt(x);
        head.setAttribute('transform', `translate(${x} 0)`);
        head.setAttribute('opacity', p > 0 && p < 1 ? 1 : 0);
        clock.textContent = fmt(seconds * p);
        count.textContent = events.filter(e => e.x <= x).length;
      },
    }];
    events.forEach(e => tracks.push({
      at: start + (dur * (e.x - x0)) / (x1 - x0), dur: 0.35,
      set(p) {
        e.g.style.opacity = p;
        e.g.setAttribute('transform', `translate(0 ${4 * (1 - p)})`);
      },
    }));
    return player(tracks);
  }

  /* TrueCover: the survey loop on a grid. Round 1 sites are placed, the
     coverage surface spreads out from them, the map switches to confidence
     (darker = wider credible interval), round 2 sites land where it is
     darkest, and coverage is re-estimated. Stage labels follow along. */
  function truecover(svg) {
    const RAMP = svg.dataset.ramp.split(',');
    const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const lerp = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
    const mix = (a, b, k) => `rgb(${lerp(a, b, k).map(Math.round).join(',')})`;
    const EMPTY = rgb('#E9E4D6'), BONE = rgb('#FAF8F3'), INK = rgb('#0E0E0C');
    const cells = [...svg.querySelectorAll('[data-cells] rect')].map(el => {
      const w = +el.dataset.w;
      return {
        el, w,
        c1: rgb(RAMP[+el.dataset.c1]),
        c2: rgb(RAMP[+el.dataset.c2]),
        conf: lerp(BONE, INK, 0.05 + 0.5 * w),
      };
    });
    const sites1 = [...svg.querySelectorAll('[data-site="1"]')];
    const sites2 = [...svg.querySelectorAll('[data-site="2"]')];
    const stages = [...svg.querySelectorAll('[data-stage]')].map(g => ({
      label: g.querySelectorAll('text')[1], marker: g.querySelector('[data-marker]'),
    }));
    // stage start times in seconds; the play ends at TOTAL
    const T = [0.6, 1.5, 3.0, 3.8, 4.9], TOTAL = 5.9;
    const k = (t, a, d) => Math.min(1, Math.max(0, (t - a) / d));

    return player([{
      at: 0, dur: TOTAL, ease: ease.linear,
      set(p) {
        const t = p * TOTAL;
        cells.forEach(c => {
          let col;
          if (t < T[1]) col = mix(BONE, EMPTY, k(t, 0, 0.5));
          else if (t < T[2]) col = mix(EMPTY, c.c1, ease.out(k(t, T[1] + c.w * 0.8, 0.4)));
          else if (t < T[4]) col = mix(c.c1, c.conf, ease.inOut(k(t, T[2], 0.5)));
          else col = mix(c.conf, c.c2, ease.inOut(k(t, T[4], 0.6)));
          c.el.setAttribute('fill', col);
        });
        sites1.forEach((el, i) => { el.style.opacity = k(t, T[0] + i * 0.05, 0.2); });
        sites2.forEach((el, i) => { el.style.opacity = k(t, T[3] + i * 0.14, 0.2); });
        const active = p >= 1 ? -1 : T.reduce((n, s, i) => (t >= s ? i : n), -1);
        stages.forEach((s, i) => {
          s.label.setAttribute('fill', p >= 1 || i === active ? '#0E0E0C' : '#8F8F86');
          s.marker.setAttribute('opacity', i === active ? 1 : 0);
        });
      },
    }]);
  }

  /* Cinder: a column browser. A reference is selected in each resource and
     the next resource opens beside it, ending on a low SpO₂ reading.
     Elements carry data-at (seconds) and one of:
       data-col   slide in from the left     data-fade  fade in
       data-draw  draw the path or line      data-pop   fade in, quickly
       data-move  slide down from data-from (y offset) into place */
  function browse(svg) {
    const tracks = [];
    const at = el => +el.dataset.at;
    svg.querySelectorAll('[data-col]').forEach(el => tracks.push({
      at: at(el), dur: 0.45,
      set(p) {
        el.style.opacity = p;
        el.setAttribute('transform', `translate(${-10 * (1 - p)} 0)`);
      },
    }));
    svg.querySelectorAll('[data-fade], [data-pop]').forEach(el => tracks.push({
      at: at(el), dur: el.hasAttribute('data-pop') ? 0.25 : 0.3,
      set(p) { el.style.opacity = p; },
    }));
    svg.querySelectorAll('[data-draw]').forEach(el => {
      const len = el.getTotalLength();
      el.style.strokeDasharray = len;
      tracks.push({
        at: at(el), dur: 0.5, ease: ease.inOut,
        set(p) { el.style.strokeDashoffset = len * (1 - p); },
      });
    });
    svg.querySelectorAll('[data-move]').forEach(el => {
      const dy = +el.dataset.from;
      tracks.push({
        at: at(el) - 0.3, dur: 0.2,
        set(p) { el.style.opacity = p; },
      }, {
        at: at(el), dur: 0.6, ease: ease.inOut,
        set(p) { el.setAttribute('transform', `translate(0 ${dy * (1 - p)})`); },
      });
    });
    return player(tracks);
  }

  /* Pixel: the population raster loads outward from the query point, then
     travel-time rings expand while the reachable population is counted. */
  function reach(svg) {
    const cx = +svg.dataset.cx, cy = +svg.dataset.cy;
    const cells = [...svg.querySelectorAll('[data-cells] rect')].map(r => {
      const x = +r.getAttribute('x') + 7, y = +r.getAttribute('y') + 7;
      return { r, o: baseOpacity(r), d: Math.hypot(x - cx, y - cy) };
    });
    const maxD = Math.max(...cells.map(c => c.d));
    const rings = [...svg.querySelectorAll('[data-ring]')].map(c => ({ c, r: +c.getAttribute('r'), o: baseOpacity(c) }));
    const counter = svg.querySelector('[data-count]');
    const target = +counter.dataset.count;
    const ringStart = 1.0, ringGap = 0.55;

    const tracks = cells.map(c => ({
      at: 0.1 + (c.d / maxD) * 0.9, dur: 0.4,
      set(p) { c.r.style.opacity = c.o * p; },
    }));
    rings.forEach((g, i) => tracks.push({
      at: ringStart + i * ringGap, dur: 0.7,
      set(p) {
        g.c.setAttribute('r', g.r * p);
        g.c.style.opacity = g.o * Math.min(1, p * 2);
      },
    }));
    tracks.push({
      at: ringStart, dur: ringGap * (rings.length - 1) + 0.7,
      set(p) { counter.textContent = Math.round(target * p).toLocaleString('en-US'); },
    });
    return player(tracks);
  }

  const builders = { elly, truecover, browse, reach };

  const HOLD = 4000; // ms the finished diagram stays up before replaying

  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      const loop = e.target.__loop;
      loop.visible = e.isIntersecting;
      if (loop.visible) loop.start();
    });
  }, { threshold: 0.6, rootMargin: '0px 0px -10% 0px' });

  document.querySelectorAll('svg[data-anim]').forEach(svg => {
    const build = builders[svg.dataset.anim];
    if (!build) return;
    const p = build(svg);
    let timer = 0;

    // Replays only while the diagram is on screen; off screen it stops on
    // its final frame and starts again when it comes back into view.
    const loop = {
      visible: false,
      start() {
        if (p.running || timer) return;
        p.reset();
        p.play(() => {
          timer = setTimeout(() => { timer = 0; if (loop.visible) loop.start(); }, HOLD);
        });
      },
    };
    svg.__loop = loop;
    if (!reduced) {
      p.reset();
      io.observe(svg);
    }

    const card = svg.closest('a, .card') || svg;
    const replay = () => {
      if (p.running) return;
      clearTimeout(timer);
      timer = 0;
      if (reduced) { p.reset(); p.play(); } else loop.start();
    };
    card.addEventListener('mouseenter', replay);
    card.addEventListener('focusin', replay);
  });
})();
