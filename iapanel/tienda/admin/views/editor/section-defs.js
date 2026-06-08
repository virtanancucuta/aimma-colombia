/* AIMMA Tienda IA · Editor PRO-MAX · Fase A.1 · section-defs.js v1
 * Registro UNICO de metadata de UI de secciones (admin-only). Consumido por
 * editor-inspector (generador), editor-state (defaults) y editor-modal-catalog.
 * NO lo consume el storefront (renderiza desde section.props). Marker: editor-a1-sectiondefs.
 */
(function (window) {
  'use strict';

  // Listas de opciones compartidas (transcritas 1:1 de editor-inspector.js).
  const OPTS = {
    ALIGN: [{ v: 'left', l: 'Izquierda' }, { v: 'center', l: 'Centro' }, { v: 'right', l: 'Derecha' }],
    TAMANIO: [{ v: 'sm', l: 'Pequeno' }, { v: 'md', l: 'Mediano' }, { v: 'lg', l: 'Grande' }, { v: 'xl', l: 'Extra grande' }],
    PADDING: [{ v: 'sm', l: 'Pequeno' }, { v: 'md', l: 'Medio' }, { v: 'lg', l: 'Grande' }, { v: 'xl', l: 'Extra grande' }],
    ANCHO: [{ v: 'completo', l: 'Ancho completo (borde a borde)' }, { v: 'contenido', l: 'Centrado (con margenes)' }],
    ESTILO_VISUAL: [{ v: 'primary', l: 'Principal' }, { v: 'secondary', l: 'Secundario' }, { v: 'ghost', l: 'Fantasma' }, { v: 'outline', l: 'Borde' }],
    TARGET: [{ v: '_self', l: 'Misma pestana' }, { v: '_blank', l: 'Nueva pestana' }],
    ICONO: [{ v: '', l: 'Sin icono' }, { v: 'arrow', l: 'Flecha' }, { v: 'whatsapp', l: 'WhatsApp' }, { v: 'email', l: 'Email' }, { v: 'phone', l: 'Telefono' }, { v: 'location', l: 'Ubicacion' }, { v: 'link', l: 'Link' }],
    CAMPO_TIPO: [{ v: 'text', l: 'Texto corto' }, { v: 'email', l: 'Email' }, { v: 'tel', l: 'Telefono' }, { v: 'textarea', l: 'Texto largo' }, { v: 'select', l: 'Lista de opciones' }, { v: 'checkbox', l: 'Casilla de verificacion' }],
    OBJETO: [{ v: 'cover', l: 'Cubrir (recorta si hace falta)' }, { v: 'contain', l: 'Contener (sin recorte)' }],
    ASPECT_IMG: [{ v: '', l: 'Automatica' }, { v: '16/9', l: '16:9' }, { v: '4/3', l: '4:3' }, { v: '1/1', l: '1:1 (cuadrada)' }, { v: '3/4', l: '3:4 (vertical)' }, { v: '4/5', l: '4:5 (vertical)' }],
    ASPECT_VIDEO: [{ v: '16/9', l: '16:9 (video)' }, { v: '4/3', l: '4:3' }, { v: '1/1', l: '1:1 (cuadrado)' }],
    ORDEN: [{ v: 'recientes', l: 'Mas recientes' }, { v: 'precio_asc', l: 'Precio: menor a mayor' }, { v: 'precio_desc', l: 'Precio: mayor a menor' }, { v: 'manual', l: 'Manual' }],
    COLUMNAS: [{ v: 'auto', l: 'Automatico' }, { v: 2, l: '2 columnas' }, { v: 3, l: '3 columnas' }, { v: 4, l: '4 columnas' }],
    GALERIA_LAYOUT: [{ v: 'grid', l: 'Grilla uniforme' }, { v: 'carrusel', l: 'Carrusel horizontal' }, { v: 'mosaico', l: 'Mosaico' }],
    GALERIA_GAP: [{ v: 'tight', l: 'Compacto' }, { v: 'normal', l: 'Normal' }, { v: 'loose', l: 'Aireado' }],
    // B-secciones Lote 1
    POSICION_IMAGEN: [{ v: 'izquierda', l: 'Imagen a la izquierda' }, { v: 'derecha', l: 'Imagen a la derecha' }],
    COLUMNAS_FIJAS: [{ v: 2, l: '2 columnas' }, { v: 3, l: '3 columnas' }, { v: 4, l: '4 columnas' }],
    FEATURE_ICONOS: [
      { v: 'envio', l: 'Envio' }, { v: 'garantia', l: 'Garantia' }, { v: 'pago', l: 'Pago seguro' },
      { v: 'calidad', l: 'Calidad' }, { v: 'soporte', l: 'Soporte' }, { v: 'reloj', l: 'Rapidez' },
      { v: 'estrella', l: 'Estrella' }, { v: 'check', l: 'Check' }, { v: 'regalo', l: 'Regalo' },
      { v: 'corazon', l: 'Corazon' }, { v: 'devoluciones', l: 'Devoluciones' },
    ],
    COLUMNAS_TESTIM: [{ v: 1, l: '1 columna' }, { v: 2, l: '2 columnas' }, { v: 3, l: '3 columnas' }],
    RATING_OPTS: [{ v: '', l: 'Sin estrellas' }, { v: 1, l: '1 estrella' }, { v: 2, l: '2 estrellas' }, { v: 3, l: '3 estrellas' }, { v: 4, l: '4 estrellas' }, { v: 5, l: '5 estrellas' }],
    LOGOS_LAYOUT: [{ v: 'grilla', l: 'Grilla' }, { v: 'tira', l: 'Tira' }],
  };

  const defs = {
    banner: {
      label: 'Banner principal',
      catalog: { group: 'esencial', icon: '★', desc: 'La foto grande y el titulo que ve el cliente al entrar.' },
      context: null, render_strategy: 'per-template',
      ancho_default: 'completo', padding_default: 'lg',
      campos: [
        { key: 'titulo', control: 'text', label: 'Titulo', default: 'Tu titulo aqui', opts: { maxLength: 200 } },
        { key: 'subtitulo', control: 'textarea', label: 'Subtitulo (opcional)', default: 'Una frase corta que describa tu negocio.', optional: true, opts: { maxLength: 500, rows: 3 }, empty_to_undefined: true },
        { key: 'alineacion', control: 'select', label: 'Alineacion', default: 'left', opts: { options: 'ALIGN' } },
        { key: 'imagen_fondo', control: 'toggle-object', label: 'Usar imagen de fondo', default: undefined, optional: true,
          on_default: { src: 'https://placehold.co/1600x900', alt: '', objeto: 'cover' },
          subfields: [
            { key: 'src', control: 'image', label: 'Imagen' },
            { key: 'alt', control: 'text', label: 'Texto alternativo (alt)', opts: { maxLength: 200 } },
          ] },
        { key: 'boton', control: 'toggle-object', label: 'Mostrar boton', default: { texto: 'Ver productos', url: '#productos', estilo_visual: 'primary', target: '_self', icono: 'arrow' }, optional: true,
          on_default: { texto: 'Ver productos', url: '#productos', estilo_visual: 'primary', target: '_self', icono: 'arrow' },
          subfields: [
            { key: 'texto', control: 'text', label: 'Texto del boton', opts: { maxLength: 80 } },
            { key: 'url', control: 'url', label: 'URL (https / mailto / tel / # / /)' },
            { key: 'estilo_visual', control: 'select', label: 'Estilo del boton', opts: { options: 'ESTILO_VISUAL' } },
            { key: 'icono', control: 'select', label: 'Icono', opts: { options: 'ICONO' }, empty_to_undefined: true },
            { key: 'target', control: 'select', label: 'Abrir en', opts: { options: 'TARGET' } },
          ] },
      ],
    },

    texto: {
      label: 'Texto',
      catalog: { group: 'esencial', icon: '¶', desc: 'Un parrafo o titulo para contar algo de tu negocio.' },
      context: null, render_strategy: 'unified',
      ancho_default: 'contenido', padding_default: 'md',
      campos: [
        { key: 'contenido', control: 'richtext', label: 'Contenido', default: 'Escribi aqui tu texto.', opts: { maxLength: 5000, rows: 5 } },
        { key: 'alineacion', control: 'select', label: 'Alineacion', default: 'left', opts: { options: 'ALIGN' } },
        { key: 'tamanio', control: 'select', label: 'Tamano del texto', default: 'md', opts: { options: 'TAMANIO' } },
      ],
    },

    imagen: {
      label: 'Imagen',
      catalog: { group: 'avanzado', icon: '▢', desc: 'Una sola imagen destacada de tu negocio.' },
      context: null, render_strategy: 'unified',
      ancho_default: 'completo', padding_default: 'md',
      campos: [
        { key: 'src', control: 'image', label: 'Imagen', default: 'https://placehold.co/1200x600' },
        { key: 'alt', control: 'text', label: 'Texto alternativo (alt)', default: 'Imagen', opts: { maxLength: 200 } },
        { key: 'objeto', control: 'select', label: 'Ajuste', default: 'cover', opts: { options: 'OBJETO' } },
        { key: 'aspect_ratio', control: 'select', label: 'Proporcion', default: undefined, optional: true, opts: { options: 'ASPECT_IMG' }, empty_to_undefined: true },
        { key: 'link_url', control: 'url', label: 'Link al hacer click (opcional)', default: undefined, optional: true, empty_to_undefined: true },
      ],
    },

    botones: {
      label: 'Botones',
      catalog: { group: 'esencial', icon: '◉', desc: 'Botones de accion: WhatsApp, ubicacion, llamar.' },
      context: null, render_strategy: 'unified',
      ancho_default: 'contenido', padding_default: 'md',
      campos: [
        { key: 'items', control: 'list', min: 1, max: 6, item_label: 'Boton',
          add_label: '+ Agregar boton', add_default: { texto: 'Nuevo boton', url: '#', estilo_visual: 'secondary', target: '_self' },
          max_note: 'Maximo 6 botones por seccion.',
          default: [
            { texto: 'WhatsApp', url: 'https://wa.me/57XXXXXXXXXX', estilo_visual: 'primary', target: '_blank', icono: 'whatsapp' },
            { texto: 'Ubicacion', url: 'https://maps.google.com', estilo_visual: 'secondary', target: '_blank', icono: 'location' },
          ],
          item: [
            { key: 'texto', control: 'text', label: 'Texto', opts: { maxLength: 80 } },
            { key: 'url', control: 'url', label: 'URL' },
            { key: 'estilo_visual', control: 'select', label: 'Estilo', opts: { options: 'ESTILO_VISUAL' } },
            { key: 'icono', control: 'select', label: 'Icono', opts: { options: 'ICONO' }, empty_to_undefined: true },
            { key: 'target', control: 'select', label: 'Abrir en', opts: { options: 'TARGET' } },
          ] },
      ],
    },

    productos: {
      label: 'Productos',
      catalog: { group: 'esencial', icon: '▦', desc: 'La grilla con los productos de tu tienda.' },
      context: 'product', render_strategy: 'unified',
      ancho_default: 'completo', padding_default: 'md',
      campos: [
        { key: 'categoria_id', control: 'category', label: 'Categoria de productos', default: null, nullable: true, empty_to_null: true },
        { key: 'limite', control: 'slider', label: 'Cantidad de productos', default: 8, opts: { min: 1, max: 12, step: 1 } },
        { key: 'orden', control: 'select', label: 'Ordenar por', default: 'recientes', opts: { options: 'ORDEN' } },
        { key: 'columnas', control: 'select', label: 'Columnas', default: 'auto', opts: { options: 'COLUMNAS' } },
        { key: 'mostrar_precio', control: 'switch', label: 'Mostrar precio', default: true },
      ],
    },

    galeria: {
      label: 'Galeria',
      catalog: { group: 'avanzado', icon: '▤', desc: 'Varias fotos juntas en grilla, mosaico o carrusel.' },
      context: null, render_strategy: 'unified',
      ancho_default: 'completo', padding_default: 'md',
      campos: [
        { key: 'layout', control: 'select', label: 'Disposicion', default: 'grid', opts: { options: 'GALERIA_LAYOUT' } },
        { key: 'gap', control: 'select', label: 'Espaciado', default: 'normal', opts: { options: 'GALERIA_GAP' } },
        { key: 'imagenes', control: 'list', min: 3, max: 12, item_label: 'Imagen',
          add_label: '+ Agregar imagen', add_default_fn: 'galeria_img',
          max_note: 'Maximo 12 imagenes en la galeria.',
          min_note: 'La galeria necesita al menos 3 imagenes para verse bien.',
          default: [
            { src: 'https://placehold.co/800x800/eee/666?text=1', alt: 'Imagen 1' },
            { src: 'https://placehold.co/800x800/eee/666?text=2', alt: 'Imagen 2' },
            { src: 'https://placehold.co/800x800/eee/666?text=3', alt: 'Imagen 3' },
          ],
          item: [
            { key: 'src', control: 'image', label: 'Imagen' },
            { key: 'alt', control: 'text', label: 'Texto alternativo (alt)', opts: { maxLength: 200 } },
          ] },
      ],
    },

    formulario: {
      label: 'Formulario',
      catalog: { group: 'avanzado', icon: '✎', desc: 'Para que los clientes te dejen sus datos y mensajes.' },
      context: null, render_strategy: 'unified',
      ancho_default: 'contenido', padding_default: 'md',
      campos: [
        { key: 'titulo', control: 'text', label: 'Titulo (opcional)', default: 'Escribinos', optional: true, opts: { maxLength: 200 }, empty_to_undefined: true },
        { key: 'boton_texto', control: 'text', label: 'Texto del boton', default: 'Enviar', display_fallback: 'Enviar', opts: { maxLength: 80 } },
        { key: 'campos', control: 'list', min: 1, max: 8, item_label: 'Campo',
          add_label: '+ Agregar campo', add_default: { tipo_campo: 'text', label: 'Nuevo campo', requerido: false },
          max_note: 'Maximo 8 campos en el formulario.',
          default: [
            { tipo_campo: 'text', label: 'Nombre', requerido: true },
            { tipo_campo: 'email', label: 'Email', requerido: true },
            { tipo_campo: 'textarea', label: 'Mensaje', requerido: false },
          ],
          item: [
            { key: 'label', control: 'text', label: 'Etiqueta', opts: { maxLength: 120 } },
            { key: 'tipo_campo', control: 'select', label: 'Tipo de campo', opts: { options: 'CAMPO_TIPO' }, rebuild_on_change: true },
            { key: 'placeholder', control: 'text', label: 'Placeholder (opcional)', opts: { maxLength: 200 }, empty_to_undefined: true },
            { key: 'opciones', control: 'textarea', label: 'Opciones (una por linea)', opts: { rows: 3, placeholder: 'Opcion 1\nOpcion 2' }, when: { field: 'tipo_campo', eq: 'select' }, transform: 'lines' },
            { key: 'requerido', control: 'switch', label: 'Requerido' },
          ] },
      ],
    },

    espacio: {
      label: 'Espacio en blanco',
      catalog: { group: 'avanzado', icon: '⎵', desc: 'Un respiro vertical entre dos secciones.' },
      context: null, render_strategy: 'unified',
      ancho_default: 'contenido', padding_default: 'sm',
      campos: [
        { key: 'altura', control: 'select', label: 'Altura del espacio', default: 'md', opts: { options: 'TAMANIO' } },
      ],
    },

    video: {
      label: 'Video o mapa',
      catalog: { group: 'avanzado', icon: '▷', desc: 'Un video de YouTube/Vimeo o un mapa de Google.' },
      context: null, render_strategy: 'unified',
      ancho_default: 'completo', padding_default: 'md',
      campos: [
        { key: 'html', control: 'textarea', label: 'Codigo del video (iframe)', default: '', opts: { maxLength: 2000, rows: 6, placeholder: '<iframe src="https://www.youtube.com/embed/..."></iframe>' } },
        { __info: 'Solo se permiten videos o mapas de: YouTube, Vimeo, CodePen, CodeSandbox, Google Maps o Spotify.' },
        { key: 'aspect_ratio', control: 'select', label: 'Proporcion', default: '16/9', opts: { options: 'ASPECT_VIDEO' } },
      ],
    },

    // ---- B-secciones Lote 1 (keys + opcionalidad en sync con editor-schema.ts; drift-guard 03) ----
    imagen_con_texto: {
      label: 'Imagen con texto',
      catalog: { group: 'esencial', icon: '◧', desc: 'Una imagen al lado de un titulo y texto, con boton opcional.' },
      context: null, render_strategy: 'unified',
      ancho_default: 'contenido', padding_default: 'lg',
      campos: [
        { key: 'src', control: 'image', label: 'Imagen', default: 'https://placehold.co/800x600' },
        { key: 'alt', control: 'text', label: 'Texto alternativo (alt)', default: 'Imagen', opts: { maxLength: 200 } },
        { key: 'titulo', control: 'text', label: 'Titulo', default: 'Un titulo que acompana la imagen', opts: { maxLength: 200 } },
        { key: 'texto', control: 'textarea', label: 'Texto (opcional)', default: 'Conta algo de tu producto o servicio en pocas lineas.', optional: true, opts: { maxLength: 2000, rows: 4 }, empty_to_undefined: true },
        { key: 'posicion_imagen', control: 'select', label: 'Posicion de la imagen', default: 'izquierda', opts: { options: 'POSICION_IMAGEN' } },
        { key: 'boton', control: 'toggle-object', label: 'Mostrar boton', default: undefined, optional: true,
          on_default: { texto: 'Ver mas', url: '#', estilo_visual: 'primary', target: '_self', icono: 'arrow' },
          subfields: [
            { key: 'texto', control: 'text', label: 'Texto del boton', opts: { maxLength: 80 } },
            { key: 'url', control: 'url', label: 'URL (https / mailto / tel / # / /)' },
            { key: 'estilo_visual', control: 'select', label: 'Estilo del boton', opts: { options: 'ESTILO_VISUAL' } },
            { key: 'icono', control: 'select', label: 'Icono', opts: { options: 'ICONO' }, empty_to_undefined: true },
            { key: 'target', control: 'select', label: 'Abrir en', opts: { options: 'TARGET' } },
          ] },
      ],
    },

    caracteristicas: {
      label: 'Caracteristicas',
      catalog: { group: 'avanzado', icon: '✦', desc: 'Grilla de beneficios con icono: envio, garantia, pago seguro.' },
      context: null, render_strategy: 'unified',
      ancho_default: 'contenido', padding_default: 'lg',
      campos: [
        { key: 'titulo', control: 'text', label: 'Titulo (opcional)', default: 'Por que elegirnos', optional: true, opts: { maxLength: 200 }, empty_to_undefined: true },
        { key: 'columnas', control: 'select', label: 'Columnas', default: 3, opts: { options: 'COLUMNAS_FIJAS' } },
        { key: 'items', control: 'list', min: 1, max: 8, item_label: 'Caracteristica',
          add_label: '+ Agregar caracteristica', add_default: { icono: 'check', titulo: 'Nueva caracteristica', texto: '' },
          max_note: 'Maximo 8 caracteristicas.',
          default: [
            { icono: 'envio', titulo: 'Envio a todo el pais', texto: 'Recibi tu pedido donde estes.' },
            { icono: 'garantia', titulo: 'Garantia', texto: 'Productos con garantia real.' },
            { icono: 'pago', titulo: 'Pago seguro', texto: 'Compra con confianza.' },
          ],
          item: [
            { key: 'icono', control: 'select', label: 'Icono', opts: { options: 'FEATURE_ICONOS' } },
            { key: 'titulo', control: 'text', label: 'Titulo', opts: { maxLength: 120 } },
            { key: 'texto', control: 'textarea', label: 'Texto (opcional)', opts: { maxLength: 300, rows: 2 }, empty_to_undefined: true },
          ] },
      ],
    },

    cita: {
      label: 'Cita destacada',
      catalog: { group: 'avanzado', icon: '❝', desc: 'Una frase grande destacada, con autor opcional.' },
      context: null, render_strategy: 'unified',
      ancho_default: 'contenido', padding_default: 'xl',
      campos: [
        { key: 'texto', control: 'textarea', label: 'Frase', default: 'Una frase que inspire a tus clientes.', opts: { maxLength: 500, rows: 3 } },
        { key: 'autor', control: 'text', label: 'Autor (opcional)', default: undefined, optional: true, opts: { maxLength: 120 }, empty_to_undefined: true },
        { key: 'alineacion', control: 'select', label: 'Alineacion', default: 'center', opts: { options: 'ALIGN' } },
      ],
    },

    // ---- B-secciones Lote 2 (keys + opcionalidad top-level en sync con editor-schema.ts; drift-guard 03) ----
    testimonios: {
      label: 'Testimonios',
      catalog: { group: 'avanzado', icon: '☆', desc: 'Resenas de clientes con autor, cargo, foto y estrellas.' },
      context: null, render_strategy: 'unified',
      ancho_default: 'contenido', padding_default: 'lg',
      campos: [
        { key: 'titulo', control: 'text', label: 'Titulo (opcional)', default: 'Lo que dicen nuestros clientes', optional: true, opts: { maxLength: 200 }, empty_to_undefined: true },
        { key: 'columnas', control: 'select', label: 'Columnas', default: 3, opts: { options: 'COLUMNAS_TESTIM' } },
        { key: 'items', control: 'list', min: 1, max: 9, item_label: 'Testimonio',
          add_label: '+ Agregar testimonio', add_default: { texto: 'Una resena breve del cliente.', autor: 'Nombre Apellido' },
          max_note: 'Maximo 9 testimonios.',
          default: [
            { texto: 'Excelente atencion y productos de calidad. Volveria a comprar sin dudarlo.', autor: 'Maria Lopez', cargo: 'Cliente', rating: 5 },
            { texto: 'Envio rapido y todo tal cual la descripcion. Recomendado.', autor: 'Carlos Ruiz', cargo: 'Cliente', rating: 5 },
            { texto: 'Muy buena experiencia de compra de principio a fin.', autor: 'Ana Gomez', cargo: 'Cliente', rating: 4 },
          ],
          item: [
            { key: 'texto', control: 'textarea', label: 'Resena', opts: { maxLength: 600, rows: 3 } },
            { key: 'autor', control: 'text', label: 'Autor', opts: { maxLength: 120 } },
            { key: 'cargo', control: 'text', label: 'Cargo (opcional)', opts: { maxLength: 120 }, empty_to_undefined: true },
            { key: 'foto', control: 'image', label: 'Foto (opcional)', optional: true },
            { key: 'rating', control: 'select', label: 'Estrellas (opcional)', opts: { options: 'RATING_OPTS' }, optional: true, empty_to_undefined: true },
          ] },
      ],
    },

    faq: {
      label: 'Preguntas frecuentes',
      catalog: { group: 'avanzado', icon: '?', desc: 'Acordeon de preguntas y respuestas (FAQ).' },
      context: null, render_strategy: 'unified',
      ancho_default: 'contenido', padding_default: 'lg',
      campos: [
        { key: 'titulo', control: 'text', label: 'Titulo (opcional)', default: 'Preguntas frecuentes', optional: true, opts: { maxLength: 200 }, empty_to_undefined: true },
        { key: 'items', control: 'list', min: 1, max: 12, item_label: 'Pregunta',
          add_label: '+ Agregar pregunta', add_default: { pregunta: 'Nueva pregunta', respuesta: 'La respuesta aca.' },
          max_note: 'Maximo 12 preguntas.',
          default: [
            { pregunta: 'Como hago un pedido?', respuesta: 'Elegi tus productos y finaliza la compra por WhatsApp. Te confirmamos enseguida.' },
            { pregunta: 'Hacen envios?', respuesta: 'Si, enviamos a todo el pais. El costo y el tiempo dependen de tu ciudad.' },
            { pregunta: 'Que medios de pago aceptan?', respuesta: 'Aceptamos transferencia, efectivo y los medios habilitados en tu tienda.' },
          ],
          item: [
            { key: 'pregunta', control: 'text', label: 'Pregunta', opts: { maxLength: 300 } },
            { key: 'respuesta', control: 'textarea', label: 'Respuesta', opts: { maxLength: 1500, rows: 4 } },
          ] },
      ],
    },

    logos: {
      label: 'Logos / marcas',
      catalog: { group: 'avanzado', icon: '▦', desc: 'Tira o grilla de logos: marcas, alianzas o medios de pago.' },
      context: null, render_strategy: 'unified',
      ancho_default: 'contenido', padding_default: 'lg',
      campos: [
        { key: 'titulo', control: 'text', label: 'Titulo (opcional)', default: 'Marcas que confian en nosotros', optional: true, opts: { maxLength: 200 }, empty_to_undefined: true },
        { key: 'layout', control: 'select', label: 'Disposicion', default: 'grilla', opts: { options: 'LOGOS_LAYOUT' } },
        { key: 'items', control: 'list', min: 1, max: 12, item_label: 'Logo',
          add_label: '+ Agregar logo', add_default: { logo: 'https://placehold.co/200x80', alt: 'Marca' },
          max_note: 'Maximo 12 logos.',
          default: [
            { logo: 'https://placehold.co/200x80', alt: 'Marca 1' },
            { logo: 'https://placehold.co/200x80', alt: 'Marca 2' },
            { logo: 'https://placehold.co/200x80', alt: 'Marca 3' },
            { logo: 'https://placehold.co/200x80', alt: 'Marca 4' },
          ],
          item: [
            { key: 'logo', control: 'image', label: 'Logo' },
            { key: 'alt', control: 'text', label: 'Texto alternativo (alt)', opts: { maxLength: 200 } },
            { key: 'link', control: 'url', label: 'Link (opcional, https o /ruta)', empty_to_undefined: true },
          ] },
      ],
    },
  };

  window.TiendaIA = window.TiendaIA || {};
  window.TiendaIA.editorSectionDefs = { OPTS, defs };
})(window);
