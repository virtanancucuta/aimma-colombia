// =============================================
// AIMMA · Auth helpers
// =============================================
// Dependencias: window.supabaseClient (definido en supabase-config.v2.js)
//
// Expone window.AIMMA.auth.{signInWithEmail, signUpWithEmail, signInWithGoogle,
// signOut, getCurrentUser, requireAuth, requireGuest, friendlyError}
//
'use strict';

(function () {
  if (!window.supabaseClient) {
    console.error('[AIMMA auth] supabaseClient no esta cargado. Asegura que supabase-config.v2.js corra antes.');
    return;
  }
  const supabase = window.supabaseClient;
  const ORIGIN = window.location.origin;
  const CALLBACK_URL = `${ORIGIN}/auth-callback.html`;

  async function signInWithEmail(email, password) {
    return supabase.auth.signInWithPassword({ email: (email || '').trim().toLowerCase(), password });
  }

  async function signUpWithEmail(payload) {
    const { email, password, nombre_completo, cedula, direccion, telefono, nombre_empresa, pagina_web } = payload;
    return supabase.auth.signUp({
      email: (email || '').trim().toLowerCase(),
      password,
      options: {
        emailRedirectTo: CALLBACK_URL,
        data: {
          nombre_completo: (nombre_completo || '').trim(),
          cedula: (cedula || '').trim(),
          direccion: (direccion || '').trim(),
          telefono: (telefono || '').trim(),
          nombre_empresa: (nombre_empresa || '').trim() || null,
          pagina_web: (pagina_web || '').trim() || null,
        },
      },
    });
  }

  async function signInWithGoogle() {
    return supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: CALLBACK_URL },
    });
  }

  async function signOut() {
    return supabase.auth.signOut();
  }

  async function resendConfirmation(email) {
    return supabase.auth.resend({
      type: 'signup',
      email: (email || '').trim().toLowerCase(),
      options: { emailRedirectTo: CALLBACK_URL },
    });
  }

  // Retorna { user, profile } o { user: null, profile: null }
  async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { user: null, profile: null };
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    if (error) {
      console.warn('[AIMMA auth] error leyendo profile:', error);
    }
    return { user, profile: profile || null };
  }

  // Gateo de paginas privadas (login, signup, callback no llaman a este)
  // Si !session                                  → /login.html
  // Si profile.email_aimma_verificado === false  → /verificar-pendiente.html
  //                                                (a menos que skipVerifyCheck=true)
  // Si profile.perfil_completo === false         → /completar-perfil.html
  //                                                (a menos que skipProfileCheck=true)
  // FALLBACK welcome: si llega a esta pagina con verificado=true pero
  // welcome_enviado_at=null, dispara welcome aqui (caso edge cuando user
  // bypasea auth-callback, ej. cierra sesion despues de verificar y vuelve
  // logueado con Supabase session cached).
  async function requireAuth(opts = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      window.location.replace('/login.html');
      return { user: null, profile: null, session: null };
    }
    const { user, profile } = await getCurrentUser();
    if (!opts.skipVerifyCheck && profile && profile.email_aimma_verificado === false) {
      window.location.replace('/verificar-pendiente.html');
      return { user, profile, session };
    }
    if (!opts.skipProfileCheck && profile && profile.perfil_completo === false) {
      window.location.replace('/completar-perfil.html');
      return { user, profile, session };
    }
    // Fallback dispatch del welcome si quedo pendiente (fire-and-forget)
    if (profile && profile.email_aimma_verificado === true && !profile.welcome_enviado_at) {
      fetch(`${supabase.supabaseUrl || ''}/functions/v1/send-welcome-email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': supabase.supabaseKey || '',
        },
      }).then(r => {
        if (!r.ok) r.text().then(t => console.warn('[AIMMA welcome fallback] HTTP', r.status, t));
      }).catch(e => console.warn('[AIMMA welcome fallback] error:', e));
    }
    return { user, profile, session };
  }

  // Gateo de paginas guest (login, signup). Si HAY sesion → /iapanel
  async function requireGuest() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      window.location.replace('/iapanel/');
    }
  }

  // Traduccion simple de errores Supabase a mensajes en espanol
  function friendlyError(err) {
    if (!err) return 'Ocurrio un error inesperado. Intenta de nuevo.';
    const msg = (err.message || err.error_description || '').toLowerCase();
    if (msg.includes('invalid login')) return 'Correo o contrasena incorrectos.';
    if (msg.includes('email not confirmed')) return 'Aun no confirmaste tu correo. Revisa tu bandeja de entrada.';
    if (msg.includes('user already registered') || msg.includes('already been registered')) return 'Este correo ya esta registrado. Inicia sesion o usa otro.';
    if (msg.includes('password should be at least')) return 'La contrasena debe tener al menos 8 caracteres.';
    if (msg.includes('rate limit') || msg.includes('too many')) return 'Demasiados intentos. Espera unos minutos y prueba de nuevo.';
    if (msg.includes('network')) return 'Sin conexion. Verifica tu internet y reintenta.';
    return err.message || 'Ocurrio un error inesperado. Intenta de nuevo.';
  }

  window.AIMMA = window.AIMMA || {};
  window.AIMMA.auth = {
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    signOut,
    resendConfirmation,
    getCurrentUser,
    requireAuth,
    requireGuest,
    friendlyError,
  };
})();
