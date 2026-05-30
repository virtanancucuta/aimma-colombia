/* AIMMA · Tienda IA · views/categorias.js · v2 · 2026-05-30
   v2 (post-audit code-reviewer): 2 HIGH + 1 MEDIUM fixes
   - HIGH #1: auto-slug ambiguo. slugTocadoManual ahora se setea true al
     primer input y NO se revierte. En edicion ya empieza true.
   - HIGH #2: dropdown padre permitia crear nivel 3 (categoria padre con
     hijos pasaba a ser hija de otra). Ahora valida y rechaza con toast claro.
   - MEDIUM #3: mapear error codes Postgres (23505/23503/23514) a mensajes
     amigables, no exponer mensajes internos al cliente.
   Fase 3.5 - CRUD categorias arbol 2 niveles.
   - Categorias padre: parent_id IS NULL.
   - Subcategorias: parent_id = id_padre.
   - Cada item muestra conteo de productos asociados.
   - Validacion: slug auto desde nombre, UNIQUE por tienda en DB (23505).
   - Eliminar: confirm + cuenta productos huerfanos (categoria_id SET NULL).
   - Sin foto upload en MVP (es complejo, se puede agregar luego). */

(function () {
  'use strict';

  function whenReady(cb, attempts) {
    attempts = attempts || 0;
    if (window.TiendaIA && typeof window.TiendaIA.registerView === 'function') { cb(); return; }
    if (attempts >= 200) { console.error('[categorias.js] window.TiendaIA no inicializo en 10s.'); return; }
    setTimeout(() => whenReady(cb, attempts + 1), 50);
  }

  whenReady(() => {
    window.TiendaIA.registerView('categorias', renderCategorias);
  });

  // ============================================================
  // Estado
  // ============================================================
  const cstate = {
    categorias: [],           // lista plana
    productosPorCat: {},      // { categoria_id: count }
    formAbierto: false,       // true cuando se muestra el form de crear/editar
    formData: null,           // { id?, nombre, slug, orden, parent_id }
    guardando: false,
  };

  // ============================================================
  // Render principal
  // ============================================================
  async function renderCategorias() {
    const T = window.TiendaIA;
    const view = T.dom.mainView;

    view.innerHTML = '<div class="ta-card"><div class="ta-empty"><div class="ta-loader" style="width:32px;height:32px;margin:0 auto 12px;"></div><p class="ta-empty__text">Cargando categorias...</p></div></div>';

    try {
      await cargarData();
      view.innerHTML = renderHeader() + renderTree() + (cstate.formAbierto ? renderForm() : '');
      wireEvents();
    } catch (e) {
      console.error('[categorias] error', e);
      view.innerHTML = '<div class="ta-card"><div class="ta-empty"><h2 class="ta-empty__title">Error</h2><p class="ta-empty__text">' + T.escapeHtml(e.message || String(e)) + '</p></div></div>';
    }
  }

  // ============================================================
  // Data
  // ============================================================
  async function cargarData() {
    const T = window.TiendaIA;
    const sb = T.supabase();
    const tienda = T.state.tienda;

    const [catRes, prodRes] = await Promise.all([
      sb.from('categorias')
        .select('id, parent_id, nombre, slug, orden, foto_url, created_at')
        .eq('tienda_id', tienda.id)
        .order('orden', { ascending: true }),
      sb.from('productos')
        .select('categoria_id')
        .eq('tienda_id', tienda.id),
    ]);
    if (catRes.error) throw catRes.error;
    if (prodRes.error) throw prodRes.error;

    cstate.categorias = catRes.data || [];

    const counts = {};
    for (const p of prodRes.data || []) {
      const k = p.categoria_id || '_sin_categoria_';
      counts[k] = (counts[k] || 0) + 1;
    }
    cstate.productosPorCat = counts;
  }

  // ============================================================
  // Render: header + tree
  // ============================================================
  function renderHeader() {
    return '' +
      '<header style="display:flex;justify-content:space-between;align-items:start;gap:16px;margin-bottom:20px;flex-wrap:wrap;">' +
        '<div>' +
          '<h1 class="ta-section-title">Categorias</h1>' +
          '<p class="ta-section-sub">Organiza tu catalogo en hasta 2 niveles. Las categorias ayudan a tus clientes a encontrar productos en la tienda online.</p>' +
        '</div>' +
        '<button type="button" id="cat-nueva" class="ta-btn ta-btn--primary">+ Nueva categoria</button>' +
      '</header>';
  }

  function renderTree() {
    const T = window.TiendaIA;
    const padres = cstate.categorias.filter(c => !c.parent_id);
    const sinCat = cstate.productosPorCat['_sin_categoria_'] || 0;

    if (padres.length === 0) {
      return '' +
        '<div class="ta-card">' +
          '<div class="ta-empty">' +
            '<h2 class="ta-empty__title">No tienes categorias creadas</h2>' +
            '<p class="ta-empty__text">Empieza creando una categoria padre como "Calzado", "Ropa", "Accesorios" - lo que mejor describa tu catalogo.</p>' +
            '<button type="button" id="cat-nueva-empty" class="ta-btn ta-btn--primary">+ Crear primera categoria</button>' +
          '</div>' +
        '</div>';
    }

    let html = '<div class="ta-card" style="padding:0;">';
    html += '<ul class="ta-cat-tree">';
    for (const p of padres) {
      const hijos = cstate.categorias.filter(c => c.parent_id === p.id);
      const countP = cstate.productosPorCat[p.id] || 0;
      html += renderItem(p, countP, false);
      if (hijos.length > 0) {
        html += '<ul class="ta-cat-tree ta-cat-tree--hijos">';
        for (const h of hijos) {
          const countH = cstate.productosPorCat[h.id] || 0;
          html += renderItem(h, countH, true);
        }
        html += '</ul>';
      }
      html += '<li class="ta-cat-add-sub"><button type="button" data-add-sub="' + T.escapeHtml(p.id) + '">+ Agregar subcategoria</button></li>';
    }
    html += '</ul>';
    html += '</div>';

    if (sinCat > 0) {
      html += '<p style="margin-top:12px;color:var(--ta-text-mut);font-size:12px;">' +
        sinCat + ' producto(s) sin categoria asignada.</p>';
    }
    return html;
  }

  function renderItem(cat, count, esHijo) {
    const T = window.TiendaIA;
    const icono = esHijo ? '↳' : '📁';
    return '' +
      '<li class="ta-cat-item' + (esHijo ? ' ta-cat-item--hijo' : '') + '">' +
        '<span class="ta-cat-item__icon">' + icono + '</span>' +
        '<span class="ta-cat-item__nombre">' + T.escapeHtml(cat.nombre) + '</span>' +
        '<code class="ta-cat-item__slug">/' + T.escapeHtml(cat.slug) + '</code>' +
        '<span class="ta-cat-item__count">' + count + ' producto' + (count === 1 ? '' : 's') + '</span>' +
        '<div class="ta-cat-item__acciones">' +
          '<button type="button" class="ta-btn ta-btn--xs" data-cat-editar="' + T.escapeHtml(cat.id) + '">Editar</button>' +
          '<button type="button" class="ta-btn ta-btn--xs ta-btn--danger" data-cat-eliminar="' + T.escapeHtml(cat.id) + '">Eliminar</button>' +
        '</div>' +
      '</li>';
  }

  // ============================================================
  // Render: form
  // ============================================================
  function renderForm() {
    const T = window.TiendaIA;
    const fd = cstate.formData || {};
    const esEdicion = !!fd.id;
    const esSub = !!fd.parent_id;

    // Dropdown de padres validos (excluir si mismo en edicion, excluir hijos en edicion)
    const padres = cstate.categorias.filter(c => !c.parent_id);
    let opcionesParent = '<option value="">— Es categoria padre (nivel 1) —</option>';
    for (const p of padres) {
      if (esEdicion && p.id === fd.id) continue; // no puede ser su propio padre
      const sel = fd.parent_id === p.id ? ' selected' : '';
      opcionesParent += '<option value="' + T.escapeHtml(p.id) + '"' + sel + '>' + T.escapeHtml(p.nombre) + '</option>';
    }

    return '' +
      '<div class="ta-modal-backdrop">' +
        '<div class="ta-modal">' +
          '<header class="ta-modal__head">' +
            '<h2>' + (esEdicion ? 'Editar categoria' : (esSub ? 'Nueva subcategoria' : 'Nueva categoria')) + '</h2>' +
            '<button type="button" id="cat-cancelar" class="ta-modal__close" aria-label="Cerrar">×</button>' +
          '</header>' +

          '<form id="cat-form" autocomplete="off">' +
            '<div class="ta-field">' +
              '<label class="ta-field__label" for="cf-nombre">Nombre *</label>' +
              '<input id="cf-nombre" type="text" class="ta-input" required maxlength="60" value="' + T.escapeHtml(fd.nombre || '') + '" placeholder="ej. Calzado">' +
            '</div>' +

            '<div class="ta-field">' +
              '<label class="ta-field__label" for="cf-slug">Slug (URL) *</label>' +
              '<input id="cf-slug" type="text" class="ta-input" required maxlength="60" pattern="[a-z0-9-]+" value="' + T.escapeHtml(fd.slug || '') + '" placeholder="ej. calzado">' +
              '<span class="ta-field__hint">Solo minusculas, numeros y guion. Se autogenera del nombre.</span>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
              '<div class="ta-field">' +
                '<label class="ta-field__label" for="cf-orden">Orden</label>' +
                '<input id="cf-orden" type="number" class="ta-input" min="0" step="1" value="' + (fd.orden != null ? fd.orden : 0) + '">' +
              '</div>' +
              '<div class="ta-field">' +
                '<label class="ta-field__label" for="cf-parent">Categoria padre</label>' +
                '<select id="cf-parent" class="ta-select">' + opcionesParent + '</select>' +
              '</div>' +
            '</div>' +

            '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:20px;padding-top:16px;border-top:1px solid var(--ta-border);">' +
              '<button type="button" id="cat-cancelar-btn" class="ta-btn">Cancelar</button>' +
              '<button type="submit" id="cat-guardar" class="ta-btn ta-btn--primary">' + (esEdicion ? 'Guardar cambios' : 'Crear') + '</button>' +
            '</div>' +
          '</form>' +
        '</div>' +
      '</div>';
  }

  // ============================================================
  // Wire events
  // ============================================================
  function wireEvents() {
    const T = window.TiendaIA;
    const view = T.dom.mainView;

    // Crear nueva (header + empty state)
    const btnNueva = view.querySelector('#cat-nueva');
    if (btnNueva) btnNueva.addEventListener('click', () => abrirForm(null, null));
    const btnNuevaEmpty = view.querySelector('#cat-nueva-empty');
    if (btnNuevaEmpty) btnNuevaEmpty.addEventListener('click', () => abrirForm(null, null));

    // Agregar subcategoria (bajo cada padre)
    view.querySelectorAll('[data-add-sub]').forEach(btn => {
      btn.addEventListener('click', () => abrirForm(null, btn.getAttribute('data-add-sub')));
    });

    // Editar
    view.querySelectorAll('[data-cat-editar]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-cat-editar');
        const cat = cstate.categorias.find(c => c.id === id);
        if (cat) abrirForm(cat, null);
      });
    });

    // Eliminar
    view.querySelectorAll('[data-cat-eliminar]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-cat-eliminar');
        eliminarCategoria(id);
      });
    });

    // Form events
    if (cstate.formAbierto) wireFormEvents();
  }

  function wireFormEvents() {
    const T = window.TiendaIA;
    const view = T.dom.mainView;

    const cerrar = () => { cstate.formAbierto = false; cstate.formData = null; renderCategorias(); };
    const btnX = view.querySelector('#cat-cancelar');
    if (btnX) btnX.addEventListener('click', cerrar);
    const btnCancel = view.querySelector('#cat-cancelar-btn');
    if (btnCancel) btnCancel.addEventListener('click', cerrar);

    // v2 BUG #1 fix: auto-slug solo si el slug esta vacio al abrir form Y user
    // no lo ha editado. Una vez tocado manualmente, no se sobreescribe NUNCA
    // (aunque user lo borre). Reset solo al abrir form (nuevo abrirForm).
    const inputNombre = view.querySelector('#cf-nombre');
    const inputSlug = view.querySelector('#cf-slug');
    // Si se abrio form para EDITAR (id existe), considerar slug ya tocado.
    let slugTocadoManual = !!(cstate.formData && cstate.formData.id);
    if (inputSlug) {
      inputSlug.addEventListener('input', () => { slugTocadoManual = true; });
    }
    if (inputNombre) {
      inputNombre.addEventListener('input', () => {
        if (slugTocadoManual) return;
        if (inputSlug) inputSlug.value = slugify(inputNombre.value);
      });
    }

    // Submit
    const form = view.querySelector('#cat-form');
    if (form) form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await guardarForm(form);
    });

    // ESC para cerrar
    const escHandler = (e) => { if (e.key === 'Escape') cerrar(); };
    window.addEventListener('keydown', escHandler);
    T.registerCleanup(() => window.removeEventListener('keydown', escHandler));
  }

  function abrirForm(catExistente, parentIdNuevoSub) {
    if (catExistente) {
      cstate.formData = {
        id: catExistente.id,
        nombre: catExistente.nombre,
        slug: catExistente.slug,
        orden: catExistente.orden,
        parent_id: catExistente.parent_id,
      };
    } else {
      cstate.formData = {
        nombre: '',
        slug: '',
        orden: 0,
        parent_id: parentIdNuevoSub || null,
      };
    }
    cstate.formAbierto = true;
    renderCategorias();
  }

  async function guardarForm(form) {
    const T = window.TiendaIA;
    const sb = T.supabase();
    const tienda = T.state.tienda;
    const btn = form.querySelector('#cat-guardar');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

    const nombre = form.querySelector('#cf-nombre').value.trim();
    const slug = form.querySelector('#cf-slug').value.trim().toLowerCase();
    const ordenRaw = form.querySelector('#cf-orden').value;
    const orden = parseInt(ordenRaw, 10);
    const parentRaw = form.querySelector('#cf-parent').value;
    const parent_id = parentRaw || null;

    if (!nombre) { T.toast('El nombre es obligatorio', 'error'); restoreBtn(btn); return; }
    if (!slug) { T.toast('El slug es obligatorio', 'error'); restoreBtn(btn); return; }
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(slug)) {
      T.toast('Slug invalido. Solo minusculas, numeros y guion. No empezar ni terminar con guion.', 'error');
      restoreBtn(btn); return;
    }

    // v2 BUG #2 fix: prevenir nivel 3. Si la categoria editada YA tiene hijos
    // y se intenta darle parent_id, error. El schema permite N niveles pero
    // el DESIGN limita a 2.
    if (cstate.formData.id && parent_id) {
      const tieneHijos = cstate.categorias.some(c => c.parent_id === cstate.formData.id);
      if (tieneHijos) {
        T.toast('No puedes convertir en subcategoria una categoria que ya tiene subcategorias propias. Maximo 2 niveles.', 'error');
        restoreBtn(btn);
        return;
      }
    }

    const payload = {
      tienda_id: tienda.id,
      nombre, slug,
      orden: Number.isFinite(orden) ? Math.max(0, orden) : 0,
      parent_id,
    };

    try {
      let result;
      if (cstate.formData.id) {
        const { tienda_id, ...patch } = payload;
        result = await sb.from('categorias').update(patch).eq('id', cstate.formData.id).eq('tienda_id', tienda.id).select().maybeSingle();
      } else {
        result = await sb.from('categorias').insert(payload).select().maybeSingle();
      }
      if (result.error) {
        // v2 BUG #3 fix: mapear codigos Postgres a mensajes amigables.
        // No exponer mensajes internos al usuario (pueden incluir nombres
        // de tablas/columnas/schema).
        const code = result.error.code;
        let msg;
        if (code === '23505') msg = 'Ya tienes una categoria con ese slug. Cambia el slug.';
        else if (code === '23503') msg = 'No se puede guardar: referencia invalida (la categoria padre no existe).';
        else if (code === '23514') msg = 'Algun valor no cumple las validaciones. Revisa los campos.';
        else msg = 'No pudimos guardar la categoria. Intenta de nuevo.';
        console.error('[categorias] save error', result.error);
        T.toast(msg, 'error');
        restoreBtn(btn);
        return;
      }
      if (cstate.formData.id && result.data === null) {
        T.toast('No se pudo actualizar.', 'error');
        restoreBtn(btn); return;
      }
      T.toast(cstate.formData.id ? 'Categoria actualizada' : 'Categoria creada', 'success');
      cstate.formAbierto = false;
      cstate.formData = null;
      await renderCategorias();
    } catch (e) {
      console.error('[cat-form] exception', e);
      T.toast('No pudimos guardar la categoria. Intenta de nuevo.', 'error');
      restoreBtn(btn);
    }
  }

  function restoreBtn(btn) {
    if (!btn || !btn.isConnected) {
      btn = window.TiendaIA.dom.mainView.querySelector('#cat-guardar');
    }
    if (!btn) return;
    btn.disabled = false;
    btn.textContent = cstate.formData?.id ? 'Guardar cambios' : 'Crear';
  }

  async function eliminarCategoria(id) {
    const T = window.TiendaIA;
    const sb = T.supabase();
    const tienda = T.state.tienda;
    const cat = cstate.categorias.find(c => c.id === id);
    if (!cat) return;

    const productosCount = cstate.productosPorCat[id] || 0;
    const hijosCount = cstate.categorias.filter(c => c.parent_id === id).length;

    let msg = '¿Eliminar categoria "' + cat.nombre + '"?';
    if (hijosCount > 0) msg += '\n\nTambien se eliminaran ' + hijosCount + ' subcategoria(s).';
    if (productosCount > 0) msg += '\n\n' + productosCount + ' producto(s) quedaran sin categoria asignada (no se eliminan).';
    if (!window.confirm(msg)) return;

    try {
      const { error } = await sb.from('categorias').delete().eq('id', id).eq('tienda_id', tienda.id);
      if (error) {
        console.error('[categorias] delete error', error);
        T.toast('No pudimos eliminar la categoria. Intenta de nuevo.', 'error');
        return;
      }
      T.toast('Categoria eliminada', 'success');
      await renderCategorias();
    } catch (e) {
      console.error('[categorias] delete exception', e);
      T.toast('No pudimos eliminar la categoria. Intenta de nuevo.', 'error');
    }
  }

  // ============================================================
  // Utils
  // ============================================================
  function slugify(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }
})();
