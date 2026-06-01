-- AIMMA Editor PRO-MAX - Fixture aimma-test home con BlockRenderer
-- Aplicado durante Task 14 del Plan 1 (Foundation).
-- 2 sections (hero + productos) para validar render LIVE end-to-end.
-- IDs cumplen regex ^el_[a-z0-9]{4,}$ y ^sec_[a-z0-9]{4,}$.

UPDATE tiendas SET personalizaciones = jsonb_build_object(
  'schema_version', 2,
  'pages', jsonb_build_object(
    'home', jsonb_build_object(
      'version', 1,
      'updated_at', '2026-06-01T16:00:00Z',
      'sections', jsonb_build_array(
        -- Hero section
        jsonb_build_object(
          'id', 'sec_hero01', 'tipo', 'hero',
          'altura_filas', 10,
          'fondo', jsonb_build_object('tipo', 'transparente', 'valor', ''),
          'padding', 'lg',
          'elementos', jsonb_build_array(
            jsonb_build_object(
              'id', 'el_text01', 'tipo', 'texto',
              'grid', jsonb_build_object('col_start', 1, 'col_end', 14, 'row_start', 2, 'row_end', 7),
              'estilo', jsonb_build_object('alineacion', 'left', 'tamano', '3xl', 'peso', 'bold', 'color_texto', null),
              'props', jsonb_build_object('contenido', 'Tienda construida con el Editor PRO-MAX')
            ),
            jsonb_build_object(
              'id', 'el_text02', 'tipo', 'texto',
              'grid', jsonb_build_object('col_start', 1, 'col_end', 13, 'row_start', 7, 'row_end', 9),
              'estilo', jsonb_build_object('alineacion', 'left', 'tamano', 'lg', 'peso', 'normal', 'color_texto', null),
              'props', jsonb_build_object('contenido', 'Probamos el render del nuevo dispatcher.')
            ),
            jsonb_build_object(
              'id', 'el_btn001', 'tipo', 'boton',
              'grid', jsonb_build_object('col_start', 1, 'col_end', 7, 'row_start', 9, 'row_end', 11),
              'estilo', jsonb_build_object('alineacion', 'left', 'tamano', 'md', 'peso', 'semibold'),
              'props', jsonb_build_object('texto', 'Ver productos', 'url', '#productos', 'estilo_visual', 'primary', 'target', '_self')
            )
          )
        ),
        -- Productos section
        jsonb_build_object(
          'id', 'sec_prods01', 'tipo', 'productos',
          'altura_filas', 10,
          'fondo', jsonb_build_object('tipo', 'transparente', 'valor', ''),
          'padding', 'lg',
          'elementos', jsonb_build_array(
            jsonb_build_object(
              'id', 'el_prod01', 'tipo', 'productos',
              'grid', jsonb_build_object('col_start', 1, 'col_end', 25, 'row_start', 1, 'row_end', 10),
              'estilo', jsonb_build_object('alineacion', 'left', 'tamano', 'md', 'peso', 'normal'),
              'props', jsonb_build_object('categoria_id', null, 'limite', 4, 'orden', 'recientes', 'columnas', 'auto', 'mostrar_precio', true)
            )
          )
        )
      )
    )
  )
) WHERE slug='aimma-test';

-- NOTA: en el JSON real las claves son "tamano" -> "tamaño" (ñ).
-- Este SQL usa ASCII "tamano" como placeholder porque algunos shells
-- mangling el ñ. Al ejecutar real, reemplazar tamano -> tamaño antes.

-- Para revertir:
-- UPDATE tiendas SET personalizaciones = '{}'::jsonb WHERE slug='aimma-test';
