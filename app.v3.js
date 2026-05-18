/* =============================================
   AIMMA · App principal
   Sistema de tabs, animaciones, formulario y agente IA
   ============================================= */
'use strict';

(function () {
  // ===================================================
  // 1. ROUTER DE TABS + NAV
  // ===================================================
  const TABS = ['home', 'inteligencia-comercial', 'marketing-financiero', 'compras-logistica', 'tecnologia-ia'];
  const sections = Object.fromEntries(TABS.map(id => [id, document.getElementById(id)]));
  const navLinks = document.querySelectorAll('[data-tab]');

  let currentTab = null;
  let sectionsInitialized = new Set();

  function showTab(tabId, opts = {}) {
    if (!TABS.includes(tabId)) tabId = 'home';
    if (currentTab === tabId && !opts.force) return;

    Object.entries(sections).forEach(([id, el]) => {
      if (id === tabId) {
        el.hidden = false;
        el.classList.add('active');
      } else {
        el.hidden = true;
        el.classList.remove('active');
      }
    });

    navLinks.forEach(link => {
      const isActive = link.dataset.tab === tabId;
      link.classList.toggle('active', isActive);
      // A11y: marcar tab activa para lectores de pantalla y manejar
      // tabindex para que el orden de Tab del teclado respete la activa
      if (link.getAttribute('role') === 'tab') {
        link.setAttribute('aria-selected', isActive ? 'true' : 'false');
        link.setAttribute('tabindex', isActive ? '0' : '-1');
      }
    });

    currentTab = tabId;

    if (!opts.silent) {
      const newHash = '#' + tabId;
      if (window.location.hash !== newHash) {
        history.pushState(null, '', newHash);
      }
    }

    if (opts.scrollTop !== false) {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }

    initSectionAnimations(tabId);
  }

  function handleHash() {
    const tabId = (window.location.hash || '#home').slice(1);
    showTab(tabId, { silent: true });
  }

  navLinks.forEach(link => {
    link.addEventListener('click', e => {
      const tab = link.dataset.tab;
      const scrollTo = link.dataset.scroll;
      if (tab) {
        e.preventDefault();
        closeDrawer();
        showTab(tab);
        if (scrollTo) {
          requestAnimationFrame(() => smoothScrollTo(scrollTo));
        }
      } else if (scrollTo) {
        e.preventDefault();
        if (currentTab !== 'home') showTab('home');
        requestAnimationFrame(() => smoothScrollTo(scrollTo));
      }
    });
  });

  function smoothScrollTo(id) {
    const target = document.getElementById(id);
    if (!target) return;
    const headerH = document.querySelector('.site-header').offsetHeight;
    const top = target.getBoundingClientRect().top + window.scrollY - headerH - 12;
    window.scrollTo({ top, behavior: 'smooth' });
  }

  window.addEventListener('hashchange', handleHash);
  handleHash();

  // ===================================================
  // 2. HEADER scroll up/down
  // ===================================================
  const header = document.getElementById('siteHeader');
  let lastScroll = 0;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    header.classList.toggle('scrolled', y > 30);
    if (y > lastScroll && y > 200) {
      header.classList.add('hidden');
    } else {
      header.classList.remove('hidden');
    }
    lastScroll = y;
  }, { passive: true });

  // ===================================================
  // 3. MOBILE DRAWER
  // ===================================================
  const hamburger = document.getElementById('hamburger');
  const drawer = document.getElementById('mobileDrawer');
  const drawerClose = document.getElementById('drawerClose');
  const backdrop = document.getElementById('drawerBackdrop');

  function openDrawer() {
    drawer.classList.add('open');
    backdrop.classList.add('open');
    hamburger.classList.add('open');
    hamburger.setAttribute('aria-expanded', 'true');
    drawer.setAttribute('aria-hidden', 'false');
  }
  function closeDrawer() {
    drawer.classList.remove('open');
    backdrop.classList.remove('open');
    hamburger.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
    drawer.setAttribute('aria-hidden', 'true');
  }
  hamburger.addEventListener('click', () => {
    drawer.classList.contains('open') ? closeDrawer() : openDrawer();
  });
  drawerClose.addEventListener('click', closeDrawer);
  backdrop.addEventListener('click', closeDrawer);

  // ===================================================
  // 4. SECTION INIT (lazy)
  // ===================================================
  function initSectionAnimations(tabId) {
    if (sectionsInitialized.has(tabId)) {
      restartSectionAnimations(tabId);
      return;
    }
    sectionsInitialized.add(tabId);

    switch (tabId) {
      case 'home': initHero(); break;
      case 'inteligencia-comercial': initInteligenciaComercial(); break;
      case 'marketing-financiero': initMarketingFinanciero(); break;
      case 'compras-logistica': initComprasLogistica(); break;
      case 'tecnologia-ia': initTecnologiaIA(); break;
    }
  }
  function restartSectionAnimations(tabId) {
    if (tabId === 'marketing-financiero') restartEquation();
    if (tabId === 'compras-logistica') restartInventoryChat();
  }

  // ===================================================
  // 5. HERO · CANVAS PARTÍCULAS
  // ===================================================
  function initHero() {
    const canvas = document.getElementById('heroParticles');
    if (!canvas || canvas.dataset.ready) return;
    canvas.dataset.ready = '1';

    const ctx = canvas.getContext('2d');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    const W = () => canvas.getBoundingClientRect().width;
    const H = () => canvas.getBoundingClientRect().height;

    const N = reduced ? 30 : 70;
    const particles = Array.from({ length: N }, () => ({
      x: Math.random() * W(),
      y: Math.random() * H(),
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 1.4 + 0.4
    }));

    function loop() {
      ctx.clearRect(0, 0, W(), H());
      const w = W(), h = H();

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 212, 245, 0.6)';
        ctx.fill();
      }

      // lineas entre cercanos
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i], b = particles[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 14000) {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(0, 212, 245, ${0.18 * (1 - d2 / 14000)})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }
      if (!reduced) requestAnimationFrame(loop);
    }
    loop();
  }

  // ===================================================
  // 6. WIZARD FORMULARIO + SUPABASE
  // ===================================================
  const form = document.getElementById('diagForm');
  const steps = form.querySelectorAll('.wizard-step');
  const stepDots = form.querySelectorAll('.step-dot');
  const progressFill = document.getElementById('progressFill');
  const btnPrev = document.getElementById('btnPrev');
  const btnNext = document.getElementById('btnNext');
  const btnSubmit = document.getElementById('btnSubmit');
  const successScreen = document.getElementById('successScreen');
  const successWA = document.getElementById('successWhatsApp');
  const successMsg = document.getElementById('successMessage');

  const required = {
    1: ['empresa', 'ciudad'],
    2: ['nombre', 'telefono', 'correo'],
    3: ['actividad', 'procesos']
  };
  let stepIndex = 1;

  function showStep(n) {
    stepIndex = n;
    steps.forEach(s => s.classList.toggle('active', Number(s.dataset.step) === n));
    stepDots.forEach(d => {
      const k = Number(d.dataset.step);
      d.classList.toggle('active', k === n);
      d.classList.toggle('done', k < n);
    });
    const totalSteps = steps.length || 3;
    progressFill.style.width = `${(n / totalSteps) * 100}%`;
    form.querySelector('.wizard-progress').setAttribute('aria-valuenow', String(n));
    btnPrev.disabled = n === 1;

    // FIX duro: usar cssText con !important inline para que GANE sobre
    // cualquier CSS (incluido display:inline-flex de .cta-btn) y sobre
    // cualquier cache del browser/CDN.
    const isLast = n === totalSteps;
    if (isLast) {
      btnNext.setAttribute('hidden', '');
      btnNext.style.cssText = 'display: none !important;';
      btnSubmit.removeAttribute('hidden');
      btnSubmit.style.cssText = 'display: inline-flex !important;';
    } else {
      btnNext.removeAttribute('hidden');
      btnNext.style.cssText = 'display: inline-flex !important;';
      btnSubmit.setAttribute('hidden', '');
      btnSubmit.style.cssText = 'display: none !important;';
    }
  }

  function validateStep(n) {
    let ok = true;
    const fields = required[n];
    fields.forEach(name => {
      const input = form.querySelector(`[name="${name}"]`);
      const wrap = input.closest('.field');
      const errEl = wrap.querySelector('.field-error');
      const v = input.value.trim();
      let valid = true, msg = '';

      if (!v) { valid = false; msg = 'Este campo es requerido'; }
      else if (name === 'correo' && !/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(v)) { valid = false; msg = 'Correo no válido'; }
      else if (name === 'telefono' && v.replace(/\D/g, '').length < 10) { valid = false; msg = 'Mínimo 10 dígitos'; }

      wrap.classList.toggle('invalid', !valid);
      if (errEl) errEl.textContent = msg;
      if (!valid) ok = false;
    });
    return ok;
  }

  // limpiar error al teclear
  form.querySelectorAll('input, textarea').forEach(el => {
    el.addEventListener('input', () => {
      const wrap = el.closest('.field');
      if (wrap && wrap.classList.contains('invalid')) {
        wrap.classList.remove('invalid');
      }
    });
  });

  btnNext.addEventListener('click', () => {
    if (!validateStep(stepIndex)) return;
    if (stepIndex < 3) showStep(stepIndex + 1);
  });
  btnPrev.addEventListener('click', () => {
    if (stepIndex > 1) showStep(stepIndex - 1);
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!validateStep(stepIndex)) return;

    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Enviando...';

    const data = Object.fromEntries(new FormData(form).entries());

    try {
      const result = await window.AIMMA.enviarDiagnostico(data);
      if (result.success) {
        // Replica el lead a Google Sheets via Apps Script (no bloquea UX si falla)
        await enviarAGoogleSheets({
          empresa:    data.empresa,
          telefono:   data.telefono,
          correo:     data.correo,
          web:        data.web || '',
          ciudad:     data.ciudad,
          instagram:  data.instagram || '',
          dedicacion: data.actividad,
          procesos:   data.procesos
        });
        showSuccess(data);
      } else {
        const errMsg = (result.error && result.error.message) || 'Error desconocido';
        alert('Error al enviar: ' + errMsg + '\nIntenta de nuevo o contáctanos por WhatsApp.');
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Enviar Diagnóstico';
      }
    } catch (err) {
      console.error('[AIMMA] Submit error:', err);
      alert('Error de conexión. Verifica tu internet o contáctanos directamente por WhatsApp.');
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Enviar Diagnóstico';
    }
  });

  async function enviarAGoogleSheets(datos) {
    const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyoQcHG2GBadgcbdEtPCfM4Gt-757ZUB0v0sQNnSYFr43plNkYU3nuGSPSSeHSOw93oOA/exec';
    // Sin Content-Type: en mode:'no-cors' el browser solo permite text/plain,
    // form-urlencoded o multipart. Apps Script lee e.postData.contents como
    // string y hace JSON.parse() internamente, asi que el body JSON funciona.
    try {
      await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify(datos)
      });
    } catch (err) {
      console.warn('Google Sheets no disponible:', err);
    }
  }

  function showSuccess(data) {
    form.hidden = true;
    successScreen.hidden = false;
    successMsg.textContent = `Recibimos tu solicitud, ${data.nombre}. Un consultor revisará la información de ${data.empresa} y te contactará pronto.`;
    const txt = encodeURIComponent(`Hola AIMMA, soy ${data.nombre} de ${data.empresa}. Acabo de enviar mi diagnóstico gratuito desde el sitio web.`);
    successWA.href = `https://wa.me/573133623071?text=${txt}`;
    successScreen.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  showStep(1);

  // ===================================================
  // 7. INTERSECTION OBSERVER · contadores y barras
  // ===================================================
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const el = e.target;
        if (el.dataset.observe === 'counter') animateCounter(el);
        if (el.dataset.observe === 'sellers') animateSellers(el);
        if (el.dataset.observe === 'chart-line') animateChartLine();
        if (el.dataset.observe === 'chart-bars') animateChartBars();
        if (el.dataset.observe === 'metric') animateCounter(el);
        if (el.dataset.observe === 'thinking') runThinking();
        if (el.dataset.observe === 'logistic') runLogistic();
        if (el.dataset.observe === 'conv-card') runConvCard(el);
        if (el.dataset.observe === 'scraping') runScraping();
        io.unobserve(el);
      }
    });
  }, { threshold: 0.35 });

  function animateCounter(el) {
    const target = parseFloat(el.dataset.target || '0');
    const decimals = parseInt(el.dataset.decimals || '0', 10);
    const prefix = el.dataset.prefix || '';
    const suffix = el.dataset.suffix || '';
    const thousands = el.dataset.thousands === 'true';
    const dur = 1600;
    const start = performance.now();

    function fmt(n) {
      const fixed = n.toFixed(decimals);
      if (thousands) {
        const parts = fixed.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        return prefix + parts.join(',') + suffix;
      }
      return prefix + (decimals > 0 ? fixed.replace('.', ',') : fixed) + suffix;
    }
    function tick(now) {
      const t = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = fmt(target * eased);
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ===================================================
  // 8. INTELIGENCIA COMERCIAL · charts + sellers
  // ===================================================
  function initInteligenciaComercial() {
    document.getElementById('chartLineFrame').dataset.observe = 'chart-line';
    document.getElementById('sellersBoard').dataset.observe = 'sellers';
    io.observe(document.getElementById('chartLineFrame'));
    io.observe(document.getElementById('sellersBoard'));
    // AIMMA THINKING bloque
    const tBlock = document.getElementById('thinkingBlock');
    if (tBlock) {
      tBlock.dataset.observe = 'thinking';
      io.observe(tBlock);
    }
  }

  function animateSellers(board) {
    const sellers = board.querySelectorAll('.seller');
    sellers.forEach((s, idx) => {
      const pct = parseInt(s.dataset.pct, 10);
      const fill = s.querySelector('.seller-bar-fill');
      setTimeout(() => {
        fill.style.width = pct + '%';
      }, 200 + idx * 250);
    });
  }

  // Chart de líneas Ventas vs Rentabilidad
  let chartLineLoopId = null;
  function animateChartLine() {
    const canvas = document.getElementById('chartVentasRent');
    const kpiGrid = document.getElementById('kpiGrid');
    const ctx = canvas.getContext('2d');

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function setupCanvas() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return rect;
    }

    const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    const ventas = [60, 64, 70, 68, 76, 82, 86, 90, 94, 100, 106, 112];
    const rent = [40, 45, 50, 53, 58, 62, 67, 72, 76, 82, 88, 95];

    function drawAxes(rect) {
      const padL = 40, padR = 20, padT = 20, padB = 40;
      const w = rect.width - padL - padR;
      const h = rect.height - padT - padB;
      ctx.strokeStyle = 'rgba(0, 212, 245, 0.1)';
      ctx.lineWidth = 1;

      // grid horizontal
      for (let i = 0; i <= 4; i++) {
        const y = padT + (h * i) / 4;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(padL + w, y);
        ctx.stroke();
      }

      // labels meses
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.font = '10px JetBrains Mono';
      ctx.textAlign = 'center';
      months.forEach((m, i) => {
        const x = padL + (w * i) / (months.length - 1);
        ctx.fillText(m, x, rect.height - 18);
      });
      return { padL, padR, padT, padB, w, h };
    }

    function drawLine(arr, color, progress, rect) {
      const { padL, padT, w, h } = drawAxes(rect);
      const max = 120;
      const pts = arr.map((v, i) => ({
        x: padL + (w * i) / (arr.length - 1),
        y: padT + h - (v / max) * h
      }));

      const visible = Math.floor(pts.length * progress);
      const partial = (pts.length * progress) - visible;

      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i <= visible && i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      if (visible < pts.length - 1 && partial > 0) {
        const a = pts[visible], b = pts[visible + 1];
        ctx.lineTo(a.x + (b.x - a.x) * partial, a.y + (b.y - a.y) * partial);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // puntos
      ctx.fillStyle = color;
      for (let i = 0; i <= visible && i < pts.length; i++) {
        ctx.beginPath();
        ctx.arc(pts[i].x, pts[i].y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function startCycle() {
      const rect = setupCanvas();
      kpiGrid.hidden = true;
      canvas.style.display = 'block';

      const dur = reduced ? 600 : 2400;
      const start = performance.now();

      function tick(now) {
        const t = Math.min((now - start) / dur, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        ctx.clearRect(0, 0, rect.width, rect.height);
        drawAxes(rect);
        drawLine(ventas, '#00b4d8', eased, rect);
        drawLine(rent, '#00d4f5', Math.max(0, eased - 0.1), rect);

        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          // tras dibujar, esperar 3s y mostrar KPIs
          setTimeout(() => showKPIs(), reduced ? 200 : 3000);
        }
      }
      requestAnimationFrame(tick);
    }

    function showKPIs() {
      canvas.style.display = 'none';
      kpiGrid.hidden = false;
      // animar rings
      kpiGrid.querySelectorAll('.kpi-ring, .kpi-donut').forEach(el => {
        const pct = parseInt(el.dataset.pct, 10);
        const fg = el.querySelector('.kpi-ring-fg, .kpi-donut-fg');
        const dasharray = parseFloat(fg.getAttribute('stroke-dasharray'));
        const offset = dasharray * (1 - Math.min(pct, 100) / 100);
        // small reset hack para reanimar
        fg.style.strokeDashoffset = dasharray;
        requestAnimationFrame(() => {
          fg.style.strokeDashoffset = offset;
        });
      });
      // animar contador rentabilidad
      const num = kpiGrid.querySelector('.kpi-number');
      num.dataset.observe = 'counter';
      animateCounter(num);

      if (!reduced) {
        clearTimeout(chartLineLoopId);
        chartLineLoopId = setTimeout(startCycle, 8000);
      }
    }

    startCycle();
  }

  // ===================================================
  // 9. MARKETING FINANCIERO · ecuación + terminal + bars
  // ===================================================
  function initMarketingFinanciero() {
    runEquation();
    runTerminal();
    document.getElementById('chartBarsAds').dataset.observe = 'chart-bars';
    document.querySelectorAll('.kpi-vert-num').forEach(el => {
      el.dataset.observe = 'counter';
      io.observe(el);
    });
    io.observe(document.getElementById('chartBarsAds'));
  }
  function restartEquation() {
    runEquation();
    runTerminal();
  }

  function runEquation() {
    const els = document.querySelectorAll('#equation .eq-term, #equation .eq-eq');
    els.forEach(e => e.classList.remove('show'));
    els.forEach((el, i) => {
      setTimeout(() => el.classList.add('show'), 400 + i * 700);
    });
  }

  function runTerminal() {
    const body = document.getElementById('terminalBody');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lines = [
      { txt: 'AIMMA · ANALIZANDO PAUTA...', cls: '' },
      { txt: '', cls: '' },
      { txt: '> La pauta debe ser EFICIENTE', cls: '' },
      { txt: '> La pauta debe ser MEDIBLE', cls: '' },
      { txt: '> Cada peso debe tener ROI proyectado', cls: '' },
      { txt: '', cls: '' },
      { txt: '⚠ FALLAR EN PLANEAR ES PLANEAR FALLAR', cls: 't-warn t-shake' }
    ];

    body.innerHTML = '';
    let i = 0;
    function nextLine() {
      if (i >= lines.length) {
        const c = document.createElement('span');
        c.className = 't-cursor';
        body.appendChild(c);
        return;
      }
      const span = document.createElement('span');
      span.className = 't-line ' + (lines[i].cls || '');
      body.appendChild(span);
      typeText(span, lines[i].txt, reduced ? 5 : 28, () => {
        body.appendChild(document.createElement('br'));
        i++;
        setTimeout(nextLine, lines[i - 1].cls.includes('warn') ? 0 : 350);
      });
    }
    setTimeout(nextLine, 600);
  }

  function typeText(el, txt, speed, cb) {
    if (!txt) { cb(); return; }
    let k = 0;
    const id = setInterval(() => {
      el.textContent += txt[k];
      k++;
      if (k >= txt.length) {
        clearInterval(id);
        cb();
      }
    }, speed);
  }

  // Chart de barras Antes vs Después
  function animateChartBars() {
    const canvas = document.getElementById('chartBarsAds');
    const ctx = canvas.getContext('2d');

    function setupCanvas() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return rect;
    }

    const labels = ['Meta', 'Google Ads', 'TikTok'];
    const before = [42, 55, 30];
    const after = [88, 92, 76];

    const rect = setupCanvas();
    const padL = 40, padR = 20, padT = 30, padB = 50;
    const w = rect.width - padL - padR;
    const h = rect.height - padT - padB;
    const groupW = w / labels.length;
    const barW = groupW / 3;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dur = reduced ? 400 : 1400;
    const start = performance.now();

    function draw(progress) {
      ctx.clearRect(0, 0, rect.width, rect.height);

      // grid
      ctx.strokeStyle = 'rgba(0, 212, 245, 0.08)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = padT + (h * i) / 4;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(padL + w, y);
        ctx.stroke();
      }

      labels.forEach((l, i) => {
        const baseX = padL + groupW * i + groupW / 2 - barW;
        const bH = (before[i] / 100) * h * progress;
        const aH = (after[i] / 100) * h * progress;

        // antes
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.fillRect(baseX, padT + h - bH, barW * 0.85, bH);

        // despues con glow
        ctx.shadowColor = '#00d4f5';
        ctx.shadowBlur = 12;
        const grad = ctx.createLinearGradient(0, padT, 0, padT + h);
        grad.addColorStop(0, '#00d4f5');
        grad.addColorStop(1, '#0096b7');
        ctx.fillStyle = grad;
        ctx.fillRect(baseX + barW, padT + h - aH, barW * 0.85, aH);
        ctx.shadowBlur = 0;

        // labels
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = '11px Rajdhani';
        ctx.textAlign = 'center';
        ctx.fillText(l, baseX + barW * 0.85, padT + h + 22);
      });

      // leyenda
      ctx.font = '11px JetBrains Mono';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.textAlign = 'left';
      ctx.fillRect(padL, 10, 12, 8);
      ctx.fillText('ANTES', padL + 18, 18);
      ctx.fillStyle = '#00d4f5';
      ctx.fillRect(padL + 80, 10, 12, 8);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fillText('DESPUÉS · CON IA', padL + 98, 18);
    }

    function tick(now) {
      const t = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      draw(eased);
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ===================================================
  // 10. COMPRAS · counters + WhatsApp loop
  // ===================================================
  function initComprasLogistica() {
    document.querySelectorAll('#metricInventario .metric-value, #metricCosto .metric-value, #metricRotacion .metric-value').forEach(el => {
      el.dataset.observe = 'counter';
      io.observe(el);
    });
    const lBlock = document.getElementById('logisticBlock');
    if (lBlock) {
      lBlock.dataset.observe = 'logistic';
      io.observe(lBlock);
    }
    runInventoryChat();
  }

  let inventoryChatId = null;
  function restartInventoryChat() {
    clearTimeout(inventoryChatId);
    runInventoryChat();
  }

  function runInventoryChat() {
    const chat = document.getElementById('waChatInventario');
    if (!chat) return;
    chat.innerHTML = '';

    const sequence = [
      { delay: 400, render: () => msg(chat, 'left', 'Hola, ¿tienes este producto disponible?') },
      { delay: 1000, render: () => msg(chat, 'left', '<div style="background:rgba(0,212,245,0.15);border:1px solid rgba(0,212,245,0.4);border-radius:8px;height:120px;display:flex;align-items:center;justify-content:center;color:var(--cyan);font-family:var(--font-mono);font-size:.75rem">[ IMAGEN PRODUCTO ]</div>') },
      { delay: 1200, render: () => typing(chat) },
      { delay: 2200, render: () => { removeTyping(chat); msg(chat, 'right', '😔 Disculpa, ese producto se nos agotó hace 3 días...'); } }
    ];

    let cumulative = 0;
    sequence.forEach(s => {
      cumulative += s.delay;
      setTimeout(s.render, cumulative);
    });
    inventoryChatId = setTimeout(runInventoryChat, cumulative + 4000);
  }

  function msg(chat, side, html) {
    const m = document.createElement('div');
    m.className = 'wa-msg ' + side;
    m.innerHTML = html;
    chat.appendChild(m);
    chat.scrollTop = chat.scrollHeight;
    return m;
  }
  function typing(chat) {
    const t = document.createElement('div');
    t.className = 'wa-typing';
    t.dataset.role = 'typing';
    t.innerHTML = '<span></span><span></span><span></span>';
    chat.appendChild(t);
    chat.scrollTop = chat.scrollHeight;
  }
  function removeTyping(chat) {
    const t = chat.querySelector('[data-role="typing"]');
    if (t) t.remove();
  }

  // ===================================================
  // 11. TECNOLOGÍA IA · agente con voz + WhatsApp asesor
  // ===================================================
  function initTecnologiaIA() {
    setupAgent();
    runAdvisorChat();
    // Conversion cards (Catalogo / Instagram → Web)
    const c1 = document.getElementById('catalogToWeb');
    const c2 = document.getElementById('instaToWeb');
    if (c1) { c1.dataset.observe = 'conv-card'; io.observe(c1); }
    if (c2) { c2.dataset.observe = 'conv-card'; io.observe(c2); }
    // Scraping mapa
    const stage = document.querySelector('.scraping-stage');
    if (stage) { stage.dataset.observe = 'scraping'; io.observe(stage); }
  }

  const AGENT_TEXT = 'Hola, soy tu futuro agente de inteligencia artificial. Puedo asistir como agente de ventas, atender cientos de clientes de manera simultánea, con la voz, acento y calidez que tú desees. Pero si lo deseas, como asistente de citas, puedo agendar, cancelar y optimizar tu consultorio o negocio. Y si eres un profesional de servicios, también me encantaría ser tu asistente personal. Lo que te imagines, AIMMA Colombia puede lograrlo. Espero conocerte pronto. Recuerda: tu diagnóstico es completamente gratuito.';

  function setupAgent() {
    const orb = document.getElementById('orb');
    const btnSpeak = document.getElementById('btnAgentSpeak');
    const btnStop = document.getElementById('btnAgentStop');
    const btnCta = document.getElementById('btnAgentCta');
    const subtitle = document.getElementById('agentSubtitle');

    if (!('speechSynthesis' in window)) {
      btnSpeak.textContent = '🔇 Tu navegador no soporta voz';
      btnSpeak.disabled = true;
      return;
    }

    let utter = null;

    function pickSpanishVoice() {
      const voices = speechSynthesis.getVoices();
      // preferir es-CO, luego es-MX, es-US, es-ES, cualquier es-
      const pref = ['es-CO', 'es-MX', 'es-US', 'es-ES', 'es-AR', 'es'];
      for (const code of pref) {
        const v = voices.find(x => x.lang && x.lang.toLowerCase().startsWith(code.toLowerCase()));
        if (v) return v;
      }
      return voices.find(x => x.lang && x.lang.startsWith('es')) || voices[0];
    }

    function buildSubtitle() {
      const words = AGENT_TEXT.split(/\s+/);
      subtitle.innerHTML = words.map(w => `<span class="word">${w}</span>`).join(' ');
      return subtitle.querySelectorAll('.word');
    }

    function speak() {
      try { speechSynthesis.cancel(); } catch (_) { }
      const wordSpans = buildSubtitle();

      utter = new SpeechSynthesisUtterance(AGENT_TEXT);
      utter.lang = 'es-CO';
      utter.rate = 0.96;
      utter.pitch = 1.0;
      utter.volume = 1.0;
      const voice = pickSpanishVoice();
      if (voice) utter.voice = voice;

      let wordIdx = 0;
      utter.onboundary = (ev) => {
        if (ev.name === 'word' && wordSpans[wordIdx]) {
          wordSpans[wordIdx].classList.add('word-spoken');
          wordIdx++;
        }
      };
      utter.onstart = () => {
        orb.classList.add('speaking');
        btnSpeak.hidden = true;
        btnStop.hidden = false;
        btnCta.hidden = true;
      };
      utter.onend = () => {
        orb.classList.remove('speaking');
        btnSpeak.hidden = false;
        btnSpeak.textContent = '🔊 Escuchar de nuevo';
        btnStop.hidden = true;
        btnCta.hidden = false;
      };
      utter.onerror = (e) => {
        console.warn('[AIMMA] Voz error:', e);
        orb.classList.remove('speaking');
        btnSpeak.hidden = false;
        btnStop.hidden = true;
      };

      speechSynthesis.speak(utter);
    }

    function stop() {
      try { speechSynthesis.cancel(); } catch (_) { }
      orb.classList.remove('speaking');
      btnSpeak.hidden = false;
      btnStop.hidden = true;
    }

    btnSpeak.addEventListener('click', speak);
    btnStop.addEventListener('click', stop);

    // cancelar al cambiar de tab o salir
    window.addEventListener('hashchange', stop);
    window.addEventListener('beforeunload', stop);

    // forzar carga de voces (algunos navegadores las cargan async)
    if (speechSynthesis.getVoices().length === 0) {
      speechSynthesis.addEventListener('voiceschanged', () => { /* listo */ }, { once: true });
    }
  }

  function runAdvisorChat() {
    const chat = document.getElementById('waChatAdvisor');
    if (!chat) return;
    chat.innerHTML = '';

    const sequence = [
      { delay: 500, render: () => msg(chat, 'left', '¡Muchas gracias por tu asesoría!') },
      { delay: 1200, render: () => typing(chat) },
      { delay: 2200, render: () => {
          removeTyping(chat);
          msg(chat, 'right cyan', `
            <div class="wa-audio">
              <span style="color:var(--cyan)">▶</span>
              <span>0:08</span>
              <div class="wa-audio-bar"></div>
              <span>0:12</span>
            </div>`);
        } },
      { delay: 1100, render: () => msg(chat, 'right cyan', `Con mucho gusto, te envío la guía 📎`) },
      { delay: 900, render: () => msg(chat, 'right cyan', `
          <div class="wa-doc">
            <div class="wa-doc-icon">PDF</div>
            <div>
              <strong>GUIA_DESPACHO_4582.pdf</strong><br>
              <small style="color:var(--white-70)">2.4 MB · Guía logística</small>
            </div>
          </div>`) }
    ];

    let cumulative = 0;
    sequence.forEach(s => {
      cumulative += s.delay;
      setTimeout(s.render, cumulative);
    });
  }

  // ===================================================
  // 12. AIMMA THINKING - Inteligencia Comercial
  // ===================================================
  function runThinking() {
    const out = document.getElementById('thinkingOutput');
    const file = document.getElementById('thinkingFile');
    const fill = file && file.querySelector('.thinking-file-bar-fill');
    const fileLabel = document.getElementById('thinkingFileLabel');
    if (!out) return;

    out.innerHTML = '';
    file.hidden = true;

    const lines = [
      { delay: 600, html: '<span class="arrow">›</span> Conectando CRM y datos históricos...' },
      { delay: 1200, html: '<span class="arrow">›</span> Cruzando clientes 2025 vs clientes 2026' },
      { delay: 1100, html: '<span class="arrow">›</span> Detectado: <span class="num">40%</span> de tu cartera 2026 son clientes <span class="ok">NUEVOS</span>' },
      { delay: 1100, html: '<span class="arrow">›</span> Detectado: has perdido <span class="num">50%</span> de tus clientes históricos' },
      { delay: 1100, html: '<span class="alert">⚠ ACCIÓN: 248 clientes inactivos recuperables en 30 días</span>' },
      { delay: 900, html: '<span class="arrow">›</span> Generando plan de remarketing con contactos...' }
    ];

    let cum = 0;
    lines.forEach(l => {
      cum += l.delay;
      setTimeout(() => {
        const span = document.createElement('span');
        span.className = 'out-line';
        span.innerHTML = l.html;
        out.appendChild(span);
      }, cum);
    });

    setTimeout(() => {
      file.hidden = false;
      requestAnimationFrame(() => {
        if (fill) fill.style.width = '100%';
        setTimeout(() => { if (fileLabel) fileLabel.textContent = '✓ Informe enviado'; }, 1700);
      });
    }, cum + 600);
  }

  // ===================================================
  // 13. AIMMALOGISTIC - Compras
  // ===================================================
  function runLogistic() {
    const out = document.getElementById('logisticOutput');
    const file = document.getElementById('logisticFile');
    const fill = document.getElementById('logisticBarFill');
    const label = document.getElementById('logisticFileLabel');
    if (!out) return;

    out.innerHTML = '';
    file.hidden = true;
    if (fill) fill.style.width = '0';
    if (label) label.textContent = 'Generando informe...';

    const lines = [
      { delay: 800, html: '<span class="arrow">›</span> Analizando rotación de inventario...' },
      { delay: 1100, html: '<span class="arrow">›</span> Productos con <span class="alert">SOBRESTOCK</span>: <span class="num">35</span> referencias' },
      { delay: 1100, html: '<span class="arrow">›</span> Productos con <span class="alert">RUPTURA</span>: <span class="num">23</span> referencias' },
      { delay: 900, html: '<span class="arrow">›</span> Generando informe...' }
    ];

    let cum = 0;
    lines.forEach(l => {
      cum += l.delay;
      setTimeout(() => {
        const span = document.createElement('span');
        span.className = 'out-line';
        span.innerHTML = l.html;
        out.appendChild(span);
      }, cum);
    });

    setTimeout(() => {
      file.hidden = false;
      requestAnimationFrame(() => {
        if (fill) fill.style.width = '100%';
        setTimeout(() => { if (label) label.textContent = '✓ Informe enviado'; }, 1700);
      });
    }, cum + 700);
  }

  // ===================================================
  // 14. CONV-CARDS - Catalogo/Instagram → Web
  // ===================================================
  const convTimers = new WeakMap();

  function runConvCard(card) {
    const steps = card.querySelectorAll('.conv-step');
    const arrows = card.querySelectorAll('.conv-arrow');
    const progressSteps = card.querySelectorAll('.conv-progress-step');
    if (!steps.length) return;

    function reset() {
      steps.forEach(s => s.classList.remove('active'));
      arrows.forEach(a => a.classList.remove('active'));
      progressSteps.forEach(p => { p.classList.remove('active'); p.classList.remove('done'); });
    }
    function activateStep(idx) {
      reset();
      steps.forEach((s, i) => { if (i <= idx) s.classList.add('active'); });
      arrows.forEach((a, i) => { if (i < idx) a.classList.add('active'); });
      progressSteps.forEach((p, i) => {
        if (i < idx) p.classList.add('done');
        else if (i === idx) p.classList.add('active');
      });
    }

    let i = 0;
    const total = steps.length;
    const cycle = () => {
      activateStep(i);
      i = (i + 1) % total;
      const t = setTimeout(cycle, 2200);
      convTimers.set(card, t);
    };

    // limpiar timer previo si existiera
    const prev = convTimers.get(card);
    if (prev) clearTimeout(prev);
    cycle();
  }

  // ===================================================
  // 15. AIMMASCRAPING - mapa Colombia
  // ===================================================
  let scrapingTimer = null;
  function runScraping() {
    const path = document.getElementById('colombiaPath');
    const scan = document.getElementById('mapScan');
    const marker = document.getElementById('mapMarker');
    const cities = document.querySelectorAll('#mapCities .map-city');
    const out = document.getElementById('scrapingOutput');
    const file = document.getElementById('scrapingFile');
    const actions = document.getElementById('scrapingActions');
    const restartBtn = document.getElementById('btnScrapingRestart');
    const coord = document.getElementById('mapCoord');

    if (!path || !out) return;

    function start() {
      // reset
      out.innerHTML = '';
      file.hidden = true;
      actions.hidden = true;
      cities.forEach(c => c.classList.remove('highlight'));
      marker.classList.remove('shown');
      scan.classList.remove('active');
      path.classList.remove('drawn');

      // 1. dibujar mapa
      requestAnimationFrame(() => path.classList.add('drawn'));

      // 2. escaneo
      setTimeout(() => scan.classList.add('active'), 1800);

      // 3. terminal output
      const lines = [
        { delay: 2200, html: '<span class="arrow">›</span> Iniciando rastreo en Colombia...', coord: '4.7110° N · 74.0721° W' },
        { delay: 1100, html: '<span class="arrow">›</span> Cruzando Google Maps + redes + directorios', coord: '6.2442° N · 75.5812° W' },
        { delay: 1100, html: '<span class="arrow">›</span> Filtrando por sector y volumen comercial', coord: '3.4516° N · 76.5320° W' },
        { delay: 1100, html: '<span class="ok">✓ DETECTADO en BARRANQUILLA: <span class="num">75</span> posibles clientes para tu empresa</span>', coord: '11.0041° N · 74.8070° W', highlight: 'Cartagena' },
        { delay: 1000, html: '<span class="arrow">›</span> Validando teléfonos, emails y nombres del decisor' },
        { delay: 900, html: '<span class="arrow">›</span> Generando informe con contactos...' }
      ];

      let cum = 0;
      lines.forEach((l, idx) => {
        cum += l.delay;
        setTimeout(() => {
          const span = document.createElement('span');
          span.className = 'out-line';
          span.innerHTML = l.html;
          out.appendChild(span);
          if (l.coord && coord) coord.textContent = l.coord;
          // mostrar marker en la linea de "DETECTADO"
          if (l.html.includes('DETECTADO')) {
            marker.classList.add('shown');
            scan.classList.remove('active');
          }
        }, cum);
      });

      // 4. archivo + acciones
      setTimeout(() => { file.hidden = false; }, cum + 600);
      setTimeout(() => { actions.hidden = false; }, cum + 1500);
    }

    if (restartBtn) restartBtn.onclick = start;
    start();
  }

  // ===================================================
  // 16. INIT global
  // ===================================================
  // Inicializar siempre Home aunque el hash sea otro
  initSectionAnimations(currentTab);

  // ===================================================
  // 17. AUTH · cambiar boton "TU PANEL IA" segun sesion
  // ===================================================
  //  Sin sesion  → /login.html (default del HTML)
  //  Con sesion  → /iapanel
  //
  // Usa window.supabaseClient expuesto desde supabase-config.v2.js.
  // Reacciona en tiempo real a SIGNED_IN / SIGNED_OUT con onAuthStateChange.
  (function initAuthButton() {
    const btnHeader = document.getElementById('btn-panel-ia');
    const btnDrawer = document.getElementById('btn-panel-ia-drawer');
    if (!btnHeader && !btnDrawer) return;
    if (!window.supabaseClient) {
      console.warn('[AIMMA] supabaseClient no disponible — boton TU PANEL IA queda apuntando a /login.html');
      return;
    }

    function applyHref(session) {
      // Trailing slash en /iapanel/ para evitar redirect 301 intermedio
      // por nginx try_files que puede perder el contexto de sesion.
      const href = session ? '/iapanel/' : '/login.html';
      if (btnHeader) btnHeader.setAttribute('href', href);
      if (btnDrawer) btnDrawer.setAttribute('href', href);
    }

    // Estado inicial al cargar pagina
    window.supabaseClient.auth.getSession().then(({ data }) => applyHref(data.session));

    // Reaccionar en tiempo real
    window.supabaseClient.auth.onAuthStateChange((_event, session) => applyHref(session));
  })();

/* =============================================
   18. TU PANEL IA — Controller animacion + voz Isbelia
   ============================================= */
//
// Architectura:
// - Auto-play silencioso: cuando la seccion entra en viewport
//   (IntersectionObserver), loop continuo de las 5 escenas
//   sin audio. Visual demo siempre activo.
// - Click "Activar narracion": detiene loop silencioso, arranca
//   audio MP3 Isbelia (62s, 21 cue points), sincroniza scenes
//   y highlights con currentTime via timeupdate event.
// - Pause/Replay disponibles.
// - Respeta prefers-reduced-motion (sin loops infinitos visuales).
//
(function initPanelIA() {
  const stage = document.getElementById('panelIaStage');
  if (!stage) return;

  const audio       = document.getElementById('panelIaAudio');
  const btnVoice    = document.getElementById('btnPanelIaVoice');
  const btnVoiceTxt = document.getElementById('btnPanelIaVoiceText');
  const btnReplay   = document.getElementById('btnPanelIaReplay');
  const status      = document.getElementById('panelIaStatus');
  const progress    = document.getElementById('panelIaProgressFill');
  const subtitle    = document.getElementById('panelIaSubtitle');
  if (!audio || !btnVoice) return;

  const scenes = stage.querySelectorAll('.panel-ia-scene');
  if (!scenes.length) return;

  // === Cue points sincronizados con audio MP3 Isbelia ===
  // Generados con ElevenLabs with-timestamps API (precision por caracter).
  // Cada cue dispara una accion visual exactamente cuando Isbelia menciona la frase.
  const CUES = [
    { t: 0.17,  scene: 1, action: 'showScene', sub: '¿Excel sueltos? ¿Pedidos a ojo?' },
    { t: 13.05, scene: 1, action: 'showHeadline', target: 'presenta_aimma', sub: 'Te presento TU PANEL IA' },
    { t: 16.76, scene: 2, action: 'showScene', sub: 'Tu equipo IA sénior' },
    { t: 16.76, scene: 2, action: 'enterExpert', target: 'financiero' },
    { t: 17.5,  scene: 2, action: 'enterExpert', target: 'compras' },
    { t: 18.49, scene: 2, action: 'enterExpert', target: 'comercial' },
    { t: 19.5,  scene: 2, action: 'enterExpert', target: 'contable' },
    { t: 22.67, scene: 2, action: 'pulseExperts' },
    { t: 24.48, scene: 2, action: 'showHeadline', target: 'un_solo_panel' },
    { t: 25.90, scene: 3, action: 'showScene', sub: 'Solo subes tres archivos' },
    { t: 27.47, scene: 3, action: 'highlightFiles' },
    { t: 29.80, scene: 3, action: 'showPosLogos', sub: 'Compatible con todos los sistemas' },
    { t: 35.17, scene: 4, action: 'showScene', sub: 'En menos de un minuto...' },
    { t: 35.17, scene: 4, action: 'showInsightBlock', target: 'finance' },
    { t: 36.32, scene: 4, action: 'animateCounter', target: 'finance' },
    { t: 37.76, scene: 4, action: 'showInsightBlock', target: 'dian' },
    { t: 37.76, scene: 4, action: 'animateCounter', target: 'dian' },
    { t: 39.83, scene: 4, action: 'showInsightBlock', target: 'op' },
    { t: 39.83, scene: 4, action: 'animateCounter', target: 'op' },
    { t: 43.90, scene: 4, action: 'showAlert' },
    { t: 45.78, scene: 4, action: 'animateAlertGrow' },
    { t: 48.03, scene: 4, action: 'pulseAlertWarning' },
    { t: 51.91, scene: 4, action: 'animateCapital' },
    { t: 57.45, scene: 5, action: 'showScene', sub: '100% local' },
    { t: 59.49, scene: 5, action: 'pulseShield' },
    { t: 60.96, scene: 5, action: 'showHeadline', sub: 'Ese es TU PANEL IA' },
  ];

  // === Estado ===
  const state = {
    voiceActive: false,
    silentInterval: null,
    silentSceneIdx: 0,
    firedCues: new Set(),
    counterAnimated: new Set(),
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  };

  // === Helpers ===
  function showScene(n) {
    scenes.forEach(s => {
      if (Number(s.dataset.scene) === n) s.hidden = false;
      else s.hidden = true;
    });
  }
  function enterExpert(key) {
    const card = stage.querySelector(`.expert-card[data-expert="${key}"]`);
    if (card) card.classList.add('enter');
  }
  function pulseExperts() {
    stage.querySelectorAll('.expert-card').forEach(c => c.classList.add('pulse'));
  }
  function showHeadline(target) {
    const sel = target
      ? `.scene-headline-fade[data-cue="${target}"]`
      : `.panel-ia-scene:not([hidden]) .scene-headline-fade`;
    stage.querySelectorAll(sel).forEach(el => el.classList.add('show'));
  }
  function highlightFiles() {
    // Los file-cards ya tienen animacion CSS, solo aseguramos que la escena este activa.
  }
  function showPosLogos() {
    // Los pos-logos ya aparecen con CSS staggered (animation-delay calculados).
    stage.querySelectorAll('.pos-logo').forEach((el, i) => {
      el.style.animationDelay = `${i * 0.06}s`;
    });
  }
  function showInsightBlock(blockId) {
    const block = stage.querySelector(`.insight-block[data-block="${blockId}"]`);
    if (block) block.classList.add('show');
  }
  function showAlert() {
    const alert = stage.querySelector('.insight-alert');
    if (alert) alert.classList.add('show');
  }

  // Counter animation (count-up suave)
  function animateNumber(el) {
    if (state.counterAnimated.has(el)) return;
    state.counterAnimated.add(el);
    const target = parseFloat(el.dataset.target || '0');
    const decimals = parseInt(el.dataset.decimals || '0', 10);
    const prefix = el.dataset.prefix || '';
    const suffix = el.dataset.suffix || '';
    const thousands = el.dataset.thousands === 'true';
    const dur = state.reducedMotion ? 200 : 1100;
    const start = performance.now();
    function fmt(n) {
      const fixed = n.toFixed(decimals);
      if (thousands) {
        const parts = fixed.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        return prefix + parts.join(',') + suffix;
      }
      return prefix + (decimals > 0 ? fixed.replace('.', ',') : fixed) + suffix;
    }
    function tick(now) {
      const t = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = fmt(target * eased);
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  function animateCounters(blockId) {
    const block = stage.querySelector(`.insight-block[data-block="${blockId}"]`);
    if (!block) return;
    block.querySelectorAll('[data-target]').forEach(animateNumber);
  }
  function animateAlertGrow() {
    const val = stage.querySelector('.alert-grow-value');
    if (val) animateNumber(val);
  }
  function pulseAlertWarning() {
    const w = stage.querySelector('.alert-warning');
    if (w) w.style.transform = 'scale(1.02)';
    setTimeout(() => { if (w) w.style.transform = ''; }, 400);
  }
  function animateCapital() {
    const val = stage.querySelector('.alert-capital-value');
    if (val) animateNumber(val);
  }
  function pulseShield() {
    const s = stage.querySelector('.closing-shield');
    if (!s) return;
    s.classList.remove('shield-finale');
    void s.offsetWidth;
    s.classList.add('shield-finale');
  }

  function setSubtitle(text) {
    if (!subtitle) return;
    if (text) {
      subtitle.textContent = text;
      subtitle.classList.add('active');
    } else {
      subtitle.classList.remove('active');
    }
  }

  function resetVisual() {
    // Resetear todos los estados aplicados
    state.firedCues.clear();
    state.counterAnimated.clear();
    stage.querySelectorAll('.expert-card').forEach(c => c.classList.remove('enter', 'pulse'));
    stage.querySelectorAll('.insight-block').forEach(b => b.classList.remove('show', 'pulse'));
    stage.querySelectorAll('.insight-alert').forEach(a => a.classList.remove('show'));
    stage.querySelectorAll('.scene-headline-fade').forEach(h => h.classList.remove('show'));
    stage.querySelectorAll('[data-target]').forEach(el => {
      const prefix = el.dataset.prefix || '';
      const suffix = el.dataset.suffix || '';
      const decimals = parseInt(el.dataset.decimals || '0', 10);
      const zeros = decimals > 0 ? '0,' + '0'.repeat(decimals) : '0';
      el.textContent = prefix + zeros + suffix;
    });
    setSubtitle('');
  }

  function runCueAction(cue) {
    switch (cue.action) {
      case 'showScene':         showScene(cue.scene); break;
      case 'enterExpert':       enterExpert(cue.target); break;
      case 'pulseExperts':      pulseExperts(); break;
      case 'showHeadline':      showHeadline(cue.target); break;
      case 'highlightFiles':    highlightFiles(); break;
      case 'showPosLogos':      showPosLogos(); break;
      case 'showInsightBlock':  showInsightBlock(cue.target); break;
      case 'animateCounter':    animateCounters(cue.target); break;
      case 'showAlert':         showAlert(); break;
      case 'animateAlertGrow':  animateAlertGrow(); break;
      case 'pulseAlertWarning': pulseAlertWarning(); break;
      case 'animateCapital':    animateCapital(); break;
      case 'pulseShield':       pulseShield(); break;
    }
    if (cue.sub) setSubtitle(cue.sub);
  }

  // === Modo silencioso: loop simple de scenes ===
  // Sin audio, solo muestra cada scene ~4s en loop. Da preview visual.
  const SILENT_DURATION_MS = 4500;
  function startSilentLoop() {
    if (state.voiceActive) return;
    stopSilentLoop();
    state.silentSceneIdx = 0;
    function showNext() {
      const idx = state.silentSceneIdx % scenes.length;
      const sceneNum = idx + 1;
      showScene(sceneNum);
      // Disparar acciones simplificadas para esa escena
      CUES.filter(c => c.scene === sceneNum && c.action !== 'showScene').forEach(c => {
        try { runCueAction(c); } catch (_) {}
      });
      state.silentSceneIdx++;
    }
    showNext();
    state.silentInterval = setInterval(showNext, SILENT_DURATION_MS);
  }
  function stopSilentLoop() {
    if (state.silentInterval) {
      clearInterval(state.silentInterval);
      state.silentInterval = null;
    }
  }

  // === Modo voz: audio con sync ===
  function startVoice() {
    stopSilentLoop();
    state.voiceActive = true;
    resetVisual();
    showScene(1);
    btnVoiceTxt.textContent = 'Detener narración';
    if (btnReplay) btnReplay.hidden = true;
    status.textContent = '▶ REPRODUCIENDO CON VOZ';
    // Safari/Firefox fix: setear currentTime solo si readyState >= 2
    // (HAVE_CURRENT_DATA). Sino esperar evento 'canplay' antes de seek+play.
    function doPlay() {
      try { audio.currentTime = 0; } catch (_) {}
      audio.play().catch(err => {
        console.warn('[PanelIA] no se pudo reproducir audio:', err);
        stopVoice();
      });
    }
    if (audio.readyState >= 2) {
      doPlay();
    } else {
      audio.addEventListener('canplay', doPlay, { once: true });
      audio.load();
    }
  }
  function stopVoice() {
    state.voiceActive = false;
    audio.pause();
    audio.currentTime = 0;
    btnVoiceTxt.textContent = 'Activar narración con voz IA';
    status.textContent = '▶ AUTO-PLAY';
    if (btnReplay) btnReplay.hidden = true;
    if (progress) progress.style.width = '0%';
    setSubtitle('');
    // Volver al loop silencioso
    startSilentLoop();
  }

  // Sync via timeupdate
  audio.addEventListener('timeupdate', () => {
    if (!state.voiceActive) return;
    const t = audio.currentTime;
    // Progress bar
    if (audio.duration && progress) {
      const pct = (t / audio.duration) * 100;
      progress.style.width = pct + '%';
    }
    // Disparar cues no firedos cuyo tiempo ya pasó
    CUES.forEach((cue, i) => {
      if (t >= cue.t && !state.firedCues.has(i)) {
        state.firedCues.add(i);
        try { runCueAction(cue); } catch (e) { console.warn('[PanelIA] cue error:', e); }
      }
    });
  });
  audio.addEventListener('ended', () => {
    state.voiceActive = false;
    btnVoiceTxt.textContent = 'Reproducir de nuevo';
    status.textContent = '✓ FIN';
    if (btnReplay) btnReplay.hidden = false;
    // Fallback: si el user no clickea Replay en 10s, vuelve al loop
    // silencioso (sino la seccion queda congelada en escena 5).
    setTimeout(() => {
      if (!state.voiceActive && !state.silentInterval) {
        const rect = stage.getBoundingClientRect();
        const inView = rect.top < window.innerHeight && rect.bottom > 0;
        if (inView) startSilentLoop();
      }
    }, 10000);
  });
  audio.addEventListener('error', (e) => {
    console.warn('[PanelIA] audio error:', e);
    stopVoice();
  });

  // === Event handlers ===
  btnVoice.addEventListener('click', () => {
    if (state.voiceActive) {
      stopVoice();
    } else {
      startVoice();
    }
  });
  if (btnReplay) {
    btnReplay.addEventListener('click', () => startVoice());
  }

  // === Auto-play silencioso cuando seccion entra en viewport ===
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        if (!state.voiceActive && !state.silentInterval) {
          startSilentLoop();
        }
      } else {
        // Si sale de viewport y NO esta sonando voz, pausamos el loop
        if (!state.voiceActive) {
          stopSilentLoop();
        }
      }
    });
  }, { threshold: 0.25 });
  io.observe(stage);

  // Cleanup al cambiar pagina
  window.addEventListener('beforeunload', () => {
    stopVoice();
    stopSilentLoop();
  });
})();

})();
