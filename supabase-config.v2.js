// =============================================
// AIMMA · Configuración Supabase
// =============================================
// La publishable key es pública por diseño (RLS protege la BD).
// Para rotar la key: dashboard.supabase.com → API Settings.

const SUPABASE_URL = 'https://rsmxklkxqsaptchcjszd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_VKKJmeQ6SVszVdD422h3qQ_KkDPeLH1';
// Expuestas globalmente para evitar duplicacion hardcoded en cada HTML
window.SUPABASE_URL_CONST = SUPABASE_URL;
window.SUPABASE_ANON_CONST = SUPABASE_ANON_KEY;

// Safety net Bug #55: si Supabase OAuth deja tokens en el hash de una pagina
// que NO es auth-callback (porque el redirect_to no estaba en allowlist
// o por bfcache), reubicar al callback para no dejar sesion huerfana sin
// completar el flow de verification AIMMA. Va ANTES de createClient para
// que supabase-js no consuma el hash y lo limpie antes de poder reubicar.
if (typeof window !== 'undefined'
    && window.location
    && window.location.hash.includes('access_token=')
    && !window.location.pathname.includes('auth-callback')) {
  window.location.replace('/auth-callback.html' + window.location.hash);
}

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Exponer cliente global para que login/signup/panel puedan usarlo
window.supabaseClient = supabaseClient;

// Helper: retorna la sesion activa (o null si no hay)
async function getSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  return session;
}
window.AIMMA = window.AIMMA || {};
window.AIMMA.getSession = getSession;

// Inserta un registro en la tabla diagnostico_gratuito
async function enviarDiagnostico(formData) {
  const params = new URLSearchParams(window.location.search);

  const payload = {
    nombre_empresa: formData.empresa,
    pagina_web: formData.web || null,
    ciudad_sede: formData.ciudad,
    instagram: formData.instagram || null,
    nombre_contacto: formData.nombre,
    telefono: formData.telefono,
    correo: formData.correo,
    a_que_se_dedica: formData.actividad,
    procesos_a_automatizar: formData.procesos,
    utm_source: params.get('utm_source'),
    utm_medium: params.get('utm_medium'),
    utm_campaign: params.get('utm_campaign'),
    user_agent: navigator.userAgent
  };

  const { data, error } = await supabaseClient
    .from('diagnostico_gratuito')
    .insert([payload]);

  if (error) {
    console.error('[AIMMA] Error al enviar diagnóstico:', error);
    return { success: false, error };
  }
  return { success: true, data };
}

// Expuesta global para app.js
window.AIMMA = window.AIMMA || {};
window.AIMMA.enviarDiagnostico = enviarDiagnostico;
