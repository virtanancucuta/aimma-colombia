/* AIMMA Contenido IA - admin.js - v1 - 2026-05-23 - marker:AIMMA_CONTENIDO_IA_ADMIN_JS_V1
 *
 * Panel admin del modulo Contenido IA (Panel IA de AIMMA).
 * Solo accesible si profiles.rol = 'admin' (server-side via is_admin() en RLS).
 *
 * Dependencias:
 *   - window.supabase global (UMD build cargado desde admin.html)
 *
 * Notas de implementacion:
 *   - "Top usuarios 7d" se calcula client-side: image_jobs ult.7d agrupados por user_id;
 *     tokens consumidos = SUM(tokens_reservados) de jobs done/processing.
 *     Esto evita necesitar una view/RPC en BD y respeta RLS (admin lee todo via is_admin()).
 *   - Realtime suscribe a la tabla image_jobs y refresca solo "Ultimos 20 jobs".
 *   - KPIs y top usuarios se refrescan por polling cada 30s.
 *   - Boton "Cambiar test_mode" alerta "aun no implementado" porque la EF que rota
 *     system_config aun no existe (Sprint 6).
 */

(function () {
  'use strict';

  // ============ Config ============
  const SUPABASE_URL  = 'https://rsmxklkxqsaptchcjszd.supabase.co';
  const SUPABASE_ANON = 'sb_publishable_VKKJmeQ6SVszVdD422h3qQ_KkDPeLH1';

  const LOGIN_URL = '/login.html';
  const PANEL_URL = '/iapanel/'; // si el user no es admin, vuelve al Panel IA

  const POLL_KPI_MS  = 30000; // KPIs + top usuarios + salud
  const POLL_JOBS_MS = 10000; // tabla ultimos jobs (refuerza el Realtime)
  const LIMIT_JOBS   = 20;
  const LIMIT_TOP    = 10;

  // ============ Init ============
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // sin storageKey custom: comparte sesion con aimma.com.co
    },
    realtime: { params: { eventsPerSecond: 5 } },
  });

  // Cache para correos (user_id -> correo) usado por tabla jobs + top usuarios
  const correosCache = new Map();
  let usuarioAdmin = null;
  let pollTimers = { kpi: null, jobs: null };
  let realtimeChannel = null;

  // ============ Helpers DOM ============
  const $ = (id) => document.getElementById(id);

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtHora(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  }

  function fmtFechaHora(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    return d.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function fmtDuracion(startIso, endIso) {
    if (!startIso || !endIso) return '-';
    const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
    if (Number.isNaN(ms) || ms < 0) return '-';
    if (ms < 1000) return ms + 'ms';
    const s = ms / 1000;
    if (s < 60) return s.toFixed(1) + 's';
    const m = Math.floor(s / 60);
    const rest = (s - m * 60).toFixed(0);
    return m + 'm ' + rest + 's';
  }

  function fmtMillis(ms) {
    if (ms === null || ms === undefined || Number.isNaN(ms)) return '-';
    if (ms < 1000) return Math.round(ms) + 'ms';
    const s = ms / 1000;
    if (s < 60) return s.toFixed(1) + 's';
    const m = Math.floor(s / 60);
    const rest = (s - m * 60).toFixed(0);
    return m + 'm ' + rest + 's';
  }

  function truncate(str, n) {
    if (!str) return '';
    return str.length > n ? str.slice(0, n - 1) + '…' : str;
  }

  function startOfTodayIso() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }

  function isoHoursAgo(h) {
    return new Date(Date.now() - h * 3600 * 1000).toISOString();
  }

  function setGateMessage(msg) {
    const el = $('gateMsg');
    if (el) el.textContent = msg;
  }

  function showApp() {
    $('gate').style.display = 'none';
    $('app').classList.add('ready');
  }

  function redirect(url) {
    window.location.replace(url);
  }

  // ============ Auth gate ============
  async function requireAdmin() {
    try {
      const { data: { session }, error } = await sb.auth.getSession();
      if (error) throw error;
      if (!session || !session.user) {
        setGateMessage('Sin sesion - redirigiendo a login');
        redirect(LOGIN_URL);
        return null;
      }
      setGateMessage('Validando permisos admin');
      const { data: profile, error: pErr } = await sb
        .from('profiles')
        .select('id, correo, rol')
        .eq('id', session.user.id)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!profile) {
        setGateMessage('Perfil no encontrado - redirigiendo');
        redirect(PANEL_URL + '?error=admin_only');
        return null;
      }
      if (profile.rol !== 'admin') {
        setGateMessage('Acceso restringido - redirigiendo');
        redirect(PANEL_URL + '?error=admin_only');
        return null;
      }
      usuarioAdmin = profile;
      return profile;
    } catch (e) {
      console.error('[admin] requireAdmin error', e);
      setGateMessage('Error de autenticacion - redirigiendo');
      redirect(LOGIN_URL);
      return null;
    }
  }

  // ============ Correos cache ============
  async function ensureCorreos(userIds) {
    const faltan = userIds.filter((id) => id && !correosCache.has(id));
    if (faltan.length === 0) return;
    const unicos = [...new Set(faltan)];
    const { data, error } = await sb
      .from('profiles')
      .select('id, correo')
      .in('id', unicos);
    if (error) {
      console.warn('[admin] no se pudo cargar correos:', error);
      return;
    }
    (data || []).forEach((p) => correosCache.set(p.id, p.correo || '(sin correo)'));
    // Marcar los que faltan como desconocido para no reintentar
    unicos.forEach((id) => { if (!correosCache.has(id)) correosCache.set(id, id.slice(0, 8) + '...'); });
  }

  // ============ KPIs ============
  async function fetchKPIs() {
    try {
      const todayIso  = startOfTodayIso();
      const last24Iso = isoHoursAgo(24);

      // 1) jobs hoy (count)
      const qJobsHoy = sb
        .from('image_jobs')
        .select('id', { count: 'exact', head: true })
        .gte('encolado_at', todayIso);

      // 2) procesando ahora (count)
      const qProc = sb
        .from('image_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('estado', 'processing');

      // 3) tasa exito 24h: traemos solo los terminados
      const qTerm = sb
        .from('image_jobs')
        .select('estado', { count: 'exact' })
        .in('estado', ['done', 'failed', 'dead_letter'])
        .gte('finalizado_at', last24Iso);

      // 4) ultimos 10 done -> duracion promedio
      const qDone = sb
        .from('image_jobs')
        .select('encolado_at, finalizado_at')
        .eq('estado', 'done')
        .order('finalizado_at', { ascending: false })
        .limit(10);

      const [r1, r2, r3, r4] = await Promise.all([qJobsHoy, qProc, qTerm, qDone]);

      if (r1.error) throw r1.error;
      if (r2.error) throw r2.error;
      if (r3.error) throw r3.error;
      if (r4.error) throw r4.error;

      $('kpiJobsHoy').textContent = (r1.count ?? 0).toLocaleString('es-CO');
      $('kpiProcesando').textContent = (r2.count ?? 0).toLocaleString('es-CO');

      const term = r3.data || [];
      const total = term.length;
      const done = term.filter((j) => j.estado === 'done').length;
      $('kpiTasaExito').textContent = total === 0 ? '-' : Math.round((done / total) * 100) + '%';

      const ult10 = r4.data || [];
      if (ult10.length === 0) {
        $('kpiDuracionProm').textContent = '-';
      } else {
        const durs = ult10
          .map((j) => new Date(j.finalizado_at).getTime() - new Date(j.encolado_at).getTime())
          .filter((ms) => Number.isFinite(ms) && ms >= 0);
        if (durs.length === 0) {
          $('kpiDuracionProm').textContent = '-';
        } else {
          const prom = durs.reduce((a, b) => a + b, 0) / durs.length;
          $('kpiDuracionProm').textContent = fmtMillis(prom);
        }
      }
    } catch (e) {
      console.error('[admin] fetchKPIs error', e);
    }
  }

  // ============ Ultimos jobs ============
  async function fetchUltimosJobs() {
    try {
      const { data, error } = await sb
        .from('image_jobs')
        .select('id, user_id, estado, modelo, tokens_reservados, encolado_at, finalizado_at, error')
        .order('encolado_at', { ascending: false })
        .limit(LIMIT_JOBS);
      if (error) throw error;
      const jobs = data || [];

      const ids = jobs.map((j) => j.user_id);
      await ensureCorreos(ids);

      const tbody = $('tblJobs');
      if (jobs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="row-empty">Sin jobs encolados todavia</td></tr>';
      } else {
        const rows = jobs.map((j) => {
          const correo = correosCache.get(j.user_id) || (j.user_id ? j.user_id.slice(0, 8) + '...' : '-');
          const dur = j.finalizado_at ? fmtDuracion(j.encolado_at, j.finalizado_at) : '-';
          const estadoCls = (j.estado || 'queued').replace(/[^a-z_]/g, '');
          const estadoTxt = j.estado || 'queued';
          const errorTxt = j.error ? truncate(j.error, 60) : '';
          return (
            '<tr>' +
              '<td class="mono">' + escapeHtml(fmtHora(j.encolado_at)) + '</td>' +
              '<td>' + escapeHtml(correo) + '</td>' +
              '<td class="mono muted">' + escapeHtml(j.modelo || '-') + '</td>' +
              '<td><span class="badge ' + estadoCls + '">' + escapeHtml(estadoTxt) + '</span></td>' +
              '<td class="mono right">' + escapeHtml(String(j.tokens_reservados ?? 0)) + '</td>' +
              '<td class="mono right">' + escapeHtml(dur) + '</td>' +
              '<td class="error" title="' + escapeHtml(j.error || '') + '">' + escapeHtml(errorTxt) + '</td>' +
            '</tr>'
          );
        }).join('');
        tbody.innerHTML = rows;
      }
      $('jobsCount').textContent = jobs.length + ' / ' + LIMIT_JOBS;
    } catch (e) {
      console.error('[admin] fetchUltimosJobs error', e);
      $('tblJobs').innerHTML = '<tr><td colspan="7" class="row-empty" style="color:var(--error)">Error: ' + escapeHtml(e.message || 'desconocido') + '</td></tr>';
    }
  }

  // ============ Top usuarios 7d ============
  async function fetchTopUsuarios() {
    try {
      const sinceIso = isoHoursAgo(24 * 7);
      // Agrupacion client-side: traemos jobs ult.7d y sumamos.
      // LIMIT alto para cubrir casos densos sin paginar (admin con 1000 jobs/7d aun es ligero).
      const { data, error } = await sb
        .from('image_jobs')
        .select('user_id, tokens_reservados, estado, encolado_at')
        .gte('encolado_at', sinceIso)
        .limit(5000);
      if (error) throw error;
      const jobs = data || [];

      const por = new Map(); // user_id -> { jobs, tokens, ultimo }
      for (const j of jobs) {
        const cur = por.get(j.user_id) || { jobs: 0, tokens: 0, ultimo: null };
        cur.jobs += 1;
        // Tokens consumidos = los que se ejecutaron o estan en curso (no los reembolsados).
        // Aproximacion: cuenta done + processing. queued/failed/dead_letter no consumen real.
        if (j.estado === 'done' || j.estado === 'processing') {
          cur.tokens += (j.tokens_reservados || 0);
        }
        if (!cur.ultimo || new Date(j.encolado_at) > new Date(cur.ultimo)) {
          cur.ultimo = j.encolado_at;
        }
        por.set(j.user_id, cur);
      }

      const top = [...por.entries()]
        .map(([uid, v]) => ({ user_id: uid, ...v }))
        .sort((a, b) => b.jobs - a.jobs || b.tokens - a.tokens)
        .slice(0, LIMIT_TOP);

      await ensureCorreos(top.map((t) => t.user_id));

      const tbody = $('tblTopUsuarios');
      if (top.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="row-empty">Sin actividad en los ultimos 7 dias</td></tr>';
      } else {
        const rows = top.map((t) => {
          const correo = correosCache.get(t.user_id) || (t.user_id ? t.user_id.slice(0, 8) + '...' : '-');
          return (
            '<tr>' +
              '<td>' + escapeHtml(correo) + '</td>' +
              '<td class="mono right">' + t.jobs + '</td>' +
              '<td class="mono right">' + (t.tokens || 0).toLocaleString('es-CO') + '</td>' +
              '<td class="mono muted">' + escapeHtml(fmtFechaHora(t.ultimo)) + '</td>' +
            '</tr>'
          );
        }).join('');
        tbody.innerHTML = rows;
      }
    } catch (e) {
      console.error('[admin] fetchTopUsuarios error', e);
      $('tblTopUsuarios').innerHTML = '<tr><td colspan="4" class="row-empty" style="color:var(--error)">Error: ' + escapeHtml(e.message || 'desconocido') + '</td></tr>';
    }
  }

  // ============ Salud sistema ============
  async function fetchSaludSistema() {
    try {
      const { data, error } = await sb
        .from('system_config')
        .select('clave, valor')
        .like('clave', 'contenido_ia.%');
      if (error) throw error;
      const map = new Map((data || []).map((r) => [r.clave, r.valor]));

      $('cfgMaxConc').textContent      = map.get('contenido_ia.max_concurrent_jobs') ?? '-';
      $('cfgRateLimit').textContent    = map.get('contenido_ia.rate_limit_per_user_minute') ?? '-';
      $('cfgJobTimeout').textContent   = (map.get('contenido_ia.job_timeout_minutes') ?? '-') + ' min';
      $('cfgMaxIntentos').textContent  = map.get('contenido_ia.max_intentos') ?? '-';
      $('cfgCleanupDias').textContent  = (map.get('contenido_ia.cleanup_inputs_dias') ?? '-') + ' dias';

      const test = (map.get('contenido_ia.test_mode') || '').toLowerCase() === 'true';
      const pill = $('cfgTestMode');
      pill.textContent = test ? 'TEST' : 'PROD';
      pill.classList.remove('test', 'prod');
      pill.classList.add(test ? 'test' : 'prod');
    } catch (e) {
      console.error('[admin] fetchSaludSistema error', e);
    }
  }

  // ============ Realtime ============
  function subscribeRealtime() {
    try {
      if (realtimeChannel) {
        sb.removeChannel(realtimeChannel);
        realtimeChannel = null;
      }
      realtimeChannel = sb
        .channel('admin-image-jobs')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'image_jobs' },
          () => {
            // Debounce sencillo: programa un refresh en 400ms y deduplica
            if (subscribeRealtime._t) clearTimeout(subscribeRealtime._t);
            subscribeRealtime._t = setTimeout(() => {
              fetchUltimosJobs();
            }, 400);
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('[admin] realtime suscrito a image_jobs');
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('[admin] realtime degradado:', status);
          }
        });
    } catch (e) {
      console.warn('[admin] subscribeRealtime fallo (continua con polling):', e);
    }
  }

  // ============ Polling ============
  function startPolling() {
    if (pollTimers.kpi) clearInterval(pollTimers.kpi);
    if (pollTimers.jobs) clearInterval(pollTimers.jobs);

    pollTimers.kpi = setInterval(() => {
      fetchKPIs();
      fetchTopUsuarios();
      fetchSaludSistema();
      tickLastSync();
    }, POLL_KPI_MS);

    pollTimers.jobs = setInterval(() => {
      fetchUltimosJobs();
    }, POLL_JOBS_MS);
  }

  function tickLastSync() {
    const el = $('lastSync');
    if (el) el.textContent = new Date().toLocaleTimeString('es-CO', { hour12: false });
  }

  // ============ Modal test_mode ============
  function bindModal() {
    const modal = $('modalTestMode');
    $('btnToggleTestMode').addEventListener('click', () => {
      // La EF que rota system_config aun no existe (Sprint 6). Por contrato del ticket:
      // "dejá el botón pero alertá 'Aún no implementado' al click".
      window.alert('Aun no implementado: la Edge Function para rotar test_mode esta pendiente (Sprint 6). Por ahora cambiar manualmente con SQL: UPDATE system_config SET valor = ... WHERE clave = \'contenido_ia.test_mode\';');
    });
    $('modalCancel').addEventListener('click', () => modal.classList.remove('open'));
    $('modalConfirm').addEventListener('click', () => {
      modal.classList.remove('open');
      window.alert('Aun no implementado.');
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open');
    });
  }

  // ============ Boot ============
  async function boot() {
    const profile = await requireAdmin();
    if (!profile) return;

    $('adminCorreo').textContent = profile.correo || 'admin';
    showApp();
    bindModal();

    // Carga inicial en paralelo
    await Promise.all([
      fetchKPIs(),
      fetchUltimosJobs(),
      fetchTopUsuarios(),
      fetchSaludSistema(),
    ]);
    tickLastSync();

    // Realtime + polling
    subscribeRealtime();
    startPolling();

    // Cleanup al cerrar pestana
    window.addEventListener('beforeunload', () => {
      if (pollTimers.kpi)  clearInterval(pollTimers.kpi);
      if (pollTimers.jobs) clearInterval(pollTimers.jobs);
      if (realtimeChannel) sb.removeChannel(realtimeChannel);
    });
  }

  // Esperar a que window.supabase exista (CDN async-safe)
  if (window.supabase && window.supabase.createClient) {
    boot();
  } else {
    window.addEventListener('DOMContentLoaded', boot);
  }
})();
