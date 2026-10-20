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
    const EMPTY = rgb('#DCE3DE'), BONE = rgb('#E7ECE7'), INK = rgb('#14211D');
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
          s.label.setAttribute('fill', p >= 1 || i === active ? '#14211D' : '#5F6D67');
          s.marker.setAttribute('opacity', i === active ? 1 : 0);
        });
      },
    }]);
  }

  /* Step-by-step diagrams (the Elly pipeline, the ICR). Elements carry
     data-at (seconds), an optional data-dur, and one effect:
       data-col     slide in from the left    data-fade   fade in
       data-pop     fade in quickly           data-draw   draw the path
       data-extend  grow a line from x1,y1    data-move   slide down from data-from
       data-grow    grow a bar ("bottom", "center" or "left")
       data-count   count up to the number    data-clock  "from,to" in minutes
       data-pulse   ring that ripples until data-until
       data-stage   step label, highlighted from data-at to data-until */
  function sequence(svg) {
    const tracks = [];
    const at = el => +el.dataset.at;
    const dur = (el, d) => +(el.dataset.dur || d);
    const each = (sel, fn) => svg.querySelectorAll(sel).forEach(fn);

    each('[data-col]', el => tracks.push({
      at: at(el), dur: dur(el, 0.45),
      set(p) {
        el.style.opacity = p;
        el.setAttribute('transform', `translate(${-10 * (1 - p)} 0)`);
      },
    }));
    each('[data-fade], [data-pop]', el => tracks.push({
      at: at(el), dur: dur(el, el.hasAttribute('data-pop') ? 0.25 : 0.3),
      set(p) { el.style.opacity = p; },
    }));
    each('[data-draw]', el => {
      const len = el.getTotalLength();
      el.style.strokeDasharray = len;
      tracks.push({
        at: at(el), dur: dur(el, 0.5), ease: ease.inOut,
        set(p) { el.style.strokeDashoffset = len * (1 - p); },
      });
    });
    each('[data-extend]', el => {
      const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map(a => +el.getAttribute(a));
      tracks.push({
        at: at(el), dur: dur(el, 0.3), ease: ease.inOut,
        set(p) {
          el.setAttribute('x2', x1 + (x2 - x1) * p);
          el.setAttribute('y2', y1 + (y2 - y1) * p);
        },
      });
    });
    each('[data-move]', el => {
      const dy = +el.dataset.from;
      tracks.push({
        at: at(el) - 0.3, dur: 0.2,
        set(p) { el.style.opacity = p; },
      }, {
        at: at(el), dur: dur(el, 0.6), ease: ease.inOut,
        set(p) { el.setAttribute('transform', `translate(0 ${dy * (1 - p)})`); },
      });
    });
    each('[data-grow]', el => {
      const y = +el.getAttribute('y'), h = +el.getAttribute('height'), w = +el.getAttribute('width');
      const from = el.dataset.grow;
      tracks.push({
        at: at(el), dur: dur(el, 0.3),
        set(p) {
          if (from === 'left') { el.setAttribute('width', w * p); return; }
          el.setAttribute('height', h * p);
          el.setAttribute('y', from === 'center' ? y + (h * (1 - p)) / 2 : y + h * (1 - p));
        },
      });
    });
    each('[data-count]', el => {
      const to = +el.dataset.count;
      tracks.push({
        at: at(el), dur: dur(el, 0.8),
        set(p) { el.textContent = Math.round(to * p).toLocaleString('en-US'); },
      });
    });
    each('[data-clock]', el => {
      const [from, to] = el.dataset.clock.split(',').map(Number);
      const fmt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
      tracks.push({
        at: at(el), dur: dur(el, 1), ease: ease.linear,
        set(p) { el.textContent = fmt(from + (to - from) * p); },
      });
    });
    each('[data-pulse]', el => {
      const r = +el.getAttribute('r'), o = baseOpacity(el), phase = +(el.dataset.phase || 0);
      const span = +el.dataset.until - at(el);
      tracks.push({
        at: at(el), dur: span, ease: ease.linear,
        set(p) {
          if (p <= 0 || p >= 1) { el.setAttribute('r', r); el.style.opacity = o; return; }
          const k = (p * span / 0.9 + phase) % 1; // one ripple every 0.9 s
          el.setAttribute('r', r * (0.6 + 0.6 * k));
          el.style.opacity = 0.5 * (1 - k);
        },
      });
    });

    // step labels: grey until their stage runs, then the marker turns orange
    const total = Math.max(...tracks.map(tr => tr.at + tr.dur));
    each('[data-stage]', g => {
      const from = at(g), until = +g.dataset.until;
      const marker = g.querySelector('[data-marker]');
      const label = g.querySelector('text');
      tracks.push({
        at: 0, dur: total, ease: ease.linear,
        set(p) {
          const t = p * total;
          const on = p >= 1 || (t >= from && t < until);
          const reached = p >= 1 || t >= from;
          marker.setAttribute('fill', on ? '#E2571C' : reached ? '#14211D' : '#C3CEC8');
          label.setAttribute('fill', reached ? '#14211D' : '#5F6D67');
        },
      });
    });
    return player(tracks);
  }

  /* ICR: campaign rounds sweep across a district. Where a ward has not been
     registered yet, the round registers its households (a pre-census) and its
     population estimate appears. Where it has, the round starts from that
     register and updates it. */
  function livingmap(svg) {
    const ORANGE = '#E2571C', INK = '#14211D', INK2 = '#43514C', OFF = '#C3CEC8';
    const KNOWN = '#DDE5E0', NEW = '#FCE3D6';
    const rows = [...svg.querySelectorAll('[data-round]')].map(g => ({
      r: +g.dataset.round, marker: g.querySelector('[data-marker]'),
      texts: [...g.querySelectorAll('text')], note: g.querySelector('[data-note]'),
    }));
    const ROUNDS = rows.length, T0 = 0.4, RD = 2.6, SWEEP = 1.6, TOTAL = T0 + ROUNDS * RD + 0.2;
    const map = svg.querySelector('[data-map]');
    const X0 = +map.dataset.x0, X1 = +map.dataset.x1;
    const fmt = n => Math.round(n).toLocaleString('en-US');
    const estimate = hh => Math.round(hh * 5.2 / 10) * 10;
    const roundStart = r => T0 + (r - 1) * RD;
    const sweepAt = (r, x) => roundStart(r) + SWEEP * (x - X0) / (X1 - X0);

    const households = [...svg.querySelectorAll('[data-households] rect')].map(el => ({
      el, r: +el.dataset.r, x: +el.getAttribute('x'),
    }));
    const labels = [...svg.querySelectorAll('[data-labels] > g')];
    const wards = [...svg.querySelectorAll('[data-wards] > g')].map((g, i) => ({
      r: +g.dataset.r, x: +g.dataset.cx,
      fill: g.querySelector('[data-fill]'), edge: g.querySelector('[data-edge]'),
      hh: labels[i].dataset.hh.split(',').map(Number),
      num: labels[i].querySelector('[data-num]'), pop: labels[i].querySelector('[data-pop]'),
      known: [...labels[i].querySelectorAll('[data-known]')], unknown: labels[i].querySelector('[data-unknown]'),
    }));
    const total = svg.querySelector('[data-total]'), totalPop = svg.querySelector('[data-total-pop]');
    const sweep = svg.querySelector('[data-sweep]');

    function wardState(w, t, done) {
      if (done) return { p: 1, hh: w.hh[ROUNDS - 1], counting: false };
      const first = sweepAt(w.r, w.x);
      if (t < first) return { p: 0, hh: 0, counting: false };
      let hh = w.hh[w.r - 1] * ease.out(clamp((t - first) / 0.9));
      for (let k = w.r + 1; k <= ROUNDS; k++) {
        const at = sweepAt(k, w.x);
        if (t >= at) hh = w.hh[k - 2] + (w.hh[k - 1] - w.hh[k - 2]) * ease.out(clamp((t - at) / 0.6));
      }
      return { p: ease.out(clamp((t - first) / 0.4)), hh, counting: t < roundStart(w.r) + RD };
    }

    function render(t) {
      const done = t >= TOTAL;
      const cur = done ? ROUNDS : Math.min(ROUNDS, Math.max(1, Math.floor((t - T0) / RD) + 1));
      const isNew = r => (done ? r === ROUNDS : t < roundStart(r) + RD);
      households.forEach(h => {
        h.el.style.opacity = done ? 1 : ease.out(clamp((t - sweepAt(h.r, h.x)) / 0.25));
        h.el.setAttribute('fill', isNew(h.r) ? ORANGE : INK);
      });
      let sum = 0, sumPop = 0;
      wards.forEach(w => {
        const s = wardState(w, t, done);
        w.fill.style.opacity = s.p;
        w.fill.setAttribute('fill', s.counting ? NEW : KNOWN);
        w.edge.setAttribute('stroke', s.counting && s.p > 0 ? ORANGE : INK2);
        w.edge.setAttribute('opacity', s.counting && s.p > 0 ? 1 : 0.6);
        w.unknown.setAttribute('opacity', s.p > 0 ? 0 : 1);
        w.known.forEach(el => { el.style.opacity = s.p; });
        w.num.textContent = fmt(s.hh);
        w.pop.textContent = fmt(estimate(s.hh));
        if (s.p > 0) { sum += s.hh; sumPop += estimate(s.hh); }
      });
      total.textContent = fmt(sum);
      totalPop.textContent = fmt(sumPop);
      rows.forEach(row => {
        const reached = done || t >= roundStart(row.r);
        const active = !done && row.r === cur && reached;
        row.marker.setAttribute('fill', active || (done && row.r === ROUNDS) ? ORANGE : reached ? INK : OFF);
        row.texts.forEach((el, i) => {
          if (el === row.note) { el.style.opacity = reached ? 1 : 0; return; }
          el.setAttribute('fill', reached ? (i === 1 ? INK : INK2) : OFF);
        });
      });
      const local = t - roundStart(cur);
      const sweeping = !done && local >= 0 && local <= SWEEP;
      sweep.setAttribute('opacity', sweeping ? 1 : 0);
      if (sweeping) sweep.setAttribute('transform', `translate(${X0 + (X1 - X0) * local / SWEEP} 0)`);
    }

    return player([{ at: 0, dur: TOTAL, ease: ease.linear, set(p) { render(p >= 1 ? TOTAL : p * TOTAL); } }]);
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

  const builders = { elly, truecover, sequence, livingmap, reach };

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
