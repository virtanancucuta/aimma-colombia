export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log_cuenta: {
        Row: {
          created_at: string | null
          evento: string
          id: number
          ip: string | null
          metadata: Json | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          evento: string
          id?: number
          ip?: string | null
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          evento?: string
          id?: number
          ip?: string | null
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      categorias: {
        Row: {
          created_at: string
          foto_url: string | null
          id: string
          nombre: string
          orden: number
          parent_id: string | null
          slug: string
          tienda_id: string
        }
        Insert: {
          created_at?: string
          foto_url?: string | null
          id?: string
          nombre: string
          orden?: number
          parent_id?: string | null
          slug: string
          tienda_id: string
        }
        Update: {
          created_at?: string
          foto_url?: string | null
          id?: string
          nombre?: string
          orden?: number
          parent_id?: string | null
          slug?: string
          tienda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categorias_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categorias_tienda_id_fkey"
            columns: ["tienda_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnostico_gratuito: {
        Row: {
          a_que_se_dedica: string
          ciudad_sede: string
          correo: string
          created_at: string | null
          estado: string | null
          id: string
          instagram: string | null
          ip_address: string | null
          nombre_contacto: string
          nombre_empresa: string
          notas: string | null
          origen: string | null
          pagina_web: string | null
          procesos_a_automatizar: string
          telefono: string
          user_agent: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          a_que_se_dedica: string
          ciudad_sede: string
          correo: string
          created_at?: string | null
          estado?: string | null
          id?: string
          instagram?: string | null
          ip_address?: string | null
          nombre_contacto: string
          nombre_empresa: string
          notas?: string | null
          origen?: string | null
          pagina_web?: string | null
          procesos_a_automatizar: string
          telefono: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          a_que_se_dedica?: string
          ciudad_sede?: string
          correo?: string
          created_at?: string | null
          estado?: string | null
          id?: string
          instagram?: string | null
          ip_address?: string | null
          nombre_contacto?: string
          nombre_empresa?: string
          notas?: string | null
          origen?: string | null
          pagina_web?: string | null
          procesos_a_automatizar?: string
          telefono?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      email_rate_limit: {
        Row: {
          correo: string
          created_at: string
          evento: string
          id: number
        }
        Insert: {
          correo: string
          created_at?: string
          evento: string
          id?: number
        }
        Update: {
          correo?: string
          created_at?: string
          evento?: string
          id?: number
        }
        Relationships: []
      }
      envios_config: {
        Row: {
          envio_gratis_min: number | null
          metodo_default: string
          tarifa_default_ciudades: number | null
          tarifa_fija: number | null
          tienda_id: string
          updated_at: string
        }
        Insert: {
          envio_gratis_min?: number | null
          metodo_default?: string
          tarifa_default_ciudades?: number | null
          tarifa_fija?: number | null
          tienda_id: string
          updated_at?: string
        }
        Update: {
          envio_gratis_min?: number | null
          metodo_default?: string
          tarifa_default_ciudades?: number | null
          tarifa_fija?: number | null
          tienda_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "envios_config_tienda_id_fkey"
            columns: ["tienda_id"]
            isOneToOne: true
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
        ]
      }
      envios_tarifas_ciudad: {
        Row: {
          ciudad: string
          created_at: string
          id: string
          tarifa: number | null
          tienda_id: string
        }
        Insert: {
          ciudad: string
          created_at?: string
          id?: string
          tarifa?: number | null
          tienda_id: string
        }
        Update: {
          ciudad?: string
          created_at?: string
          id?: string
          tarifa?: number | null
          tienda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "envios_tarifas_ciudad_tienda_id_fkey"
            columns: ["tienda_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
        ]
      }
      image_jobs: {
        Row: {
          accion_rapida: string | null
          encolado_at: string | null
          error: string | null
          estado: string
          finalizado_at: string | null
          id: string
          input_url: string
          instruccion: string | null
          intentos: number
          kie_task_id: string | null
          modelo: string
          output_url: string | null
          procesando_desde: string | null
          return_to: string | null
          source: string
          target_campo: string | null
          target_producto_id: string | null
          tokens_reservados: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          accion_rapida?: string | null
          encolado_at?: string | null
          error?: string | null
          estado?: string
          finalizado_at?: string | null
          id?: string
          input_url: string
          instruccion?: string | null
          intentos?: number
          kie_task_id?: string | null
          modelo: string
          output_url?: string | null
          procesando_desde?: string | null
          return_to?: string | null
          source?: string
          target_campo?: string | null
          target_producto_id?: string | null
          tokens_reservados: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          accion_rapida?: string | null
          encolado_at?: string | null
          error?: string | null
          estado?: string
          finalizado_at?: string | null
          id?: string
          input_url?: string
          instruccion?: string | null
          intentos?: number
          kie_task_id?: string | null
          modelo?: string
          output_url?: string | null
          procesando_desde?: string | null
          return_to?: string | null
          source?: string
          target_campo?: string | null
          target_producto_id?: string | null
          tokens_reservados?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "image_jobs_modelo_fkey"
            columns: ["modelo"]
            isOneToOne: false
            referencedRelation: "model_costs"
            referencedColumns: ["modelo"]
          },
        ]
      }
      logs_acceso: {
        Row: {
          created_at: string | null
          evento: string
          id: string
          ip: string | null
          metadata: Json | null
          modulo: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          evento: string
          id?: string
          ip?: string | null
          metadata?: Json | null
          modulo?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          evento?: string
          id?: string
          ip?: string | null
          metadata?: Json | null
          modulo?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      model_costs: {
        Row: {
          activo: boolean
          costo_cop: number
          costo_usd: number
          created_at: string | null
          display_name: string
          id: number
          modelo: string
          multiplicador: number
          orden: number
          resolucion: string | null
          tokens_por_uso: number
          updated_at: string | null
        }
        Insert: {
          activo?: boolean
          costo_cop: number
          costo_usd: number
          created_at?: string | null
          display_name: string
          id?: number
          modelo: string
          multiplicador?: number
          orden?: number
          resolucion?: string | null
          tokens_por_uso: number
          updated_at?: string | null
        }
        Update: {
          activo?: boolean
          costo_cop?: number
          costo_usd?: number
          created_at?: string | null
          display_name?: string
          id?: number
          modelo?: string
          multiplicador?: number
          orden?: number
          resolucion?: string | null
          tokens_por_uso?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      mp_webhook_log: {
        Row: {
          data_id: string | null
          email_disparado: string | null
          error: string | null
          evento_action: string | null
          evento_type: string | null
          id: number
          payload: Json
          procesado: boolean
          procesado_at: string | null
          recibido_at: string
          signature_valid: boolean
          user_id: string | null
          x_request_id: string
        }
        Insert: {
          data_id?: string | null
          email_disparado?: string | null
          error?: string | null
          evento_action?: string | null
          evento_type?: string | null
          id?: number
          payload: Json
          procesado?: boolean
          procesado_at?: string | null
          recibido_at?: string
          signature_valid: boolean
          user_id?: string | null
          x_request_id: string
        }
        Update: {
          data_id?: string | null
          email_disparado?: string | null
          error?: string | null
          evento_action?: string | null
          evento_type?: string | null
          id?: number
          payload?: Json
          procesado?: boolean
          procesado_at?: string | null
          recibido_at?: string
          signature_valid?: boolean
          user_id?: string | null
          x_request_id?: string
        }
        Relationships: []
      }
      n8n_chat_histories: {
        Row: {
          created_at: string | null
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          created_at?: string | null
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      paginas_ia_generadas: {
        Row: {
          css_generado: string | null
          error: string | null
          estado: string
          finalizada_at: string | null
          generada_at: string
          html_generado: string | null
          id: string
          meta_tags: Json | null
          modelo: string
          prompt_inicial: Json
          publicada: boolean
          tienda_id: string
          tipo: string
          tokens_consumidos: number
        }
        Insert: {
          css_generado?: string | null
          error?: string | null
          estado?: string
          finalizada_at?: string | null
          generada_at?: string
          html_generado?: string | null
          id?: string
          meta_tags?: Json | null
          modelo: string
          prompt_inicial: Json
          publicada?: boolean
          tienda_id: string
          tipo: string
          tokens_consumidos?: number
        }
        Update: {
          css_generado?: string | null
          error?: string | null
          estado?: string
          finalizada_at?: string | null
          generada_at?: string
          html_generado?: string | null
          id?: string
          meta_tags?: Json | null
          modelo?: string
          prompt_inicial?: Json
          publicada?: boolean
          tienda_id?: string
          tipo?: string
          tokens_consumidos?: number
        }
        Relationships: [
          {
            foreignKeyName: "paginas_ia_generadas_tienda_id_fkey"
            columns: ["tienda_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
        ]
      }
      paginas_legales: {
        Row: {
          contenido_html: string
          id: string
          secciones: Json
          tienda_id: string
          tipo: string
          titulo: string
          ultima_actualiz: string
        }
        Insert: {
          contenido_html: string
          id?: string
          secciones?: Json
          tienda_id: string
          tipo: string
          titulo: string
          ultima_actualiz?: string
        }
        Update: {
          contenido_html?: string
          id?: string
          secciones?: Json
          tienda_id?: string
          tipo?: string
          titulo?: string
          ultima_actualiz?: string
        }
        Relationships: [
          {
            foreignKeyName: "paginas_legales_tienda_id_fkey"
            columns: ["tienda_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
        ]
      }
      paletas: {
        Row: {
          color_accent: string
          color_bg_base: string
          color_primary: string
          color_text_base: string
          created_at: string
          id: string
          nombre: string
          orden: number
          plantilla_id: string
          preview_url: string | null
          slug: string
        }
        Insert: {
          color_accent: string
          color_bg_base: string
          color_primary: string
          color_text_base: string
          created_at?: string
          id?: string
          nombre: string
          orden?: number
          plantilla_id: string
          preview_url?: string | null
          slug: string
        }
        Update: {
          color_accent?: string
          color_bg_base?: string
          color_primary?: string
          color_text_base?: string
          created_at?: string
          id?: string
          nombre?: string
          orden?: number
          plantilla_id?: string
          preview_url?: string | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "paletas_plantilla_id_fkey"
            columns: ["plantilla_id"]
            isOneToOne: false
            referencedRelation: "plantillas"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_items: {
        Row: {
          cantidad: number
          color: string | null
          id: string
          nombre: string
          pedido_id: string
          precio_unitario: number
          producto_id: string | null
          referencia: string
          subtotal: number
          talla: string | null
          variante_id: string | null
        }
        Insert: {
          cantidad: number
          color?: string | null
          id?: string
          nombre: string
          pedido_id: string
          precio_unitario: number
          producto_id?: string | null
          referencia: string
          subtotal: number
          talla?: string | null
          variante_id?: string | null
        }
        Update: {
          cantidad?: number
          color?: string | null
          id?: string
          nombre?: string
          pedido_id?: string
          precio_unitario?: number
          producto_id?: string | null
          referencia?: string
          subtotal?: number
          talla?: string | null
          variante_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedido_items_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "producto_variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          cancelado_at: string | null
          cancelado_razon: string | null
          codigo_publico: string
          comprador_ciudad: string
          comprador_direccion: string
          comprador_email: string | null
          comprador_nombre: string
          comprador_observ: string | null
          comprador_telefono: string
          confirmado_at: string | null
          costo_envio: number
          created_at: string
          estado: string
          id: string
          metodo_envio: string | null
          notif_email_enviado_at: string | null
          pendiente_at: string
          subtotal_productos: number
          tienda_cliente_id: string | null
          tienda_id: string
          total: number
          updated_at: string
        }
        Insert: {
          cancelado_at?: string | null
          cancelado_razon?: string | null
          codigo_publico: string
          comprador_ciudad: string
          comprador_direccion: string
          comprador_email?: string | null
          comprador_nombre: string
          comprador_observ?: string | null
          comprador_telefono: string
          confirmado_at?: string | null
          costo_envio?: number
          created_at?: string
          estado?: string
          id?: string
          metodo_envio?: string | null
          notif_email_enviado_at?: string | null
          pendiente_at?: string
          subtotal_productos: number
          tienda_cliente_id?: string | null
          tienda_id: string
          total: number
          updated_at?: string
        }
        Update: {
          cancelado_at?: string | null
          cancelado_razon?: string | null
          codigo_publico?: string
          comprador_ciudad?: string
          comprador_direccion?: string
          comprador_email?: string | null
          comprador_nombre?: string
          comprador_observ?: string | null
          comprador_telefono?: string
          confirmado_at?: string | null
          costo_envio?: number
          created_at?: string
          estado?: string
          id?: string
          metodo_envio?: string | null
          notif_email_enviado_at?: string | null
          pendiente_at?: string
          subtotal_productos?: number
          tienda_cliente_id?: string | null
          tienda_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_pedidos_tienda_cliente"
            columns: ["tienda_cliente_id"]
            isOneToOne: false
            referencedRelation: "tienda_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_tienda_id_fkey"
            columns: ["tienda_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
        ]
      }
      planes: {
        Row: {
          activo: boolean | null
          codigo: string
          created_at: string | null
          descripcion: string | null
          modulos_acceso: string[] | null
          nombre: string
          precio_mensual: number | null
          tokens_mensuales: number
        }
        Insert: {
          activo?: boolean | null
          codigo: string
          created_at?: string | null
          descripcion?: string | null
          modulos_acceso?: string[] | null
          nombre: string
          precio_mensual?: number | null
          tokens_mensuales?: number
        }
        Update: {
          activo?: boolean | null
          codigo?: string
          created_at?: string | null
          descripcion?: string | null
          modulos_acceso?: string[] | null
          nombre?: string
          precio_mensual?: number | null
          tokens_mensuales?: number
        }
        Relationships: []
      }
      plantillas: {
        Row: {
          activa: boolean
          created_at: string
          descripcion: string | null
          id: string
          nombre: string
          orden: number
          preview_url: string | null
          slug: string
        }
        Insert: {
          activa?: boolean
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre: string
          orden?: number
          preview_url?: string | null
          slug: string
        }
        Update: {
          activa?: boolean
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre?: string
          orden?: number
          preview_url?: string | null
          slug?: string
        }
        Relationships: []
      }
      producto_variantes: {
        Row: {
          color: string | null
          created_at: string
          foto_color_url: string | null
          id: string
          precio_override: number | null
          producto_id: string
          reservado: number
          sku: string
          stock: number
          talla: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          foto_color_url?: string | null
          id?: string
          precio_override?: number | null
          producto_id: string
          reservado?: number
          sku: string
          stock?: number
          talla?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          foto_color_url?: string | null
          id?: string
          precio_override?: number | null
          producto_id?: string
          reservado?: number
          sku?: string
          stock?: number
          talla?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "producto_variantes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          cantidad_min_mayorista: number | null
          categoria_id: string | null
          costo: number | null
          created_at: string
          descripcion: string | null
          estado: string
          ficha_editorial: Json | null
          foto_principal_url: string | null
          fotos_galeria: Json
          guia_tallas_url: string | null
          id: string
          nombre: string
          precio_mayorista: number | null
          precio_promo: number | null
          precio_venta: number
          referencia: string
          slug: string
          tienda_id: string
          updated_at: string
          variante_tipo_1: string | null
          variante_tipo_2: string | null
        }
        Insert: {
          cantidad_min_mayorista?: number | null
          categoria_id?: string | null
          costo?: number | null
          created_at?: string
          descripcion?: string | null
          estado?: string
          ficha_editorial?: Json | null
          foto_principal_url?: string | null
          fotos_galeria?: Json
          guia_tallas_url?: string | null
          id?: string
          nombre: string
          precio_mayorista?: number | null
          precio_promo?: number | null
          precio_venta: number
          referencia: string
          slug?: string
          tienda_id: string
          updated_at?: string
          variante_tipo_1?: string | null
          variante_tipo_2?: string | null
        }
        Update: {
          cantidad_min_mayorista?: number | null
          categoria_id?: string | null
          costo?: number | null
          created_at?: string
          descripcion?: string | null
          estado?: string
          ficha_editorial?: Json | null
          foto_principal_url?: string | null
          fotos_galeria?: Json
          guia_tallas_url?: string | null
          id?: string
          nombre?: string
          precio_mayorista?: number | null
          precio_promo?: number | null
          precio_venta?: number
          referencia?: string
          slug?: string
          tienda_id?: string
          updated_at?: string
          variante_tipo_1?: string | null
          variante_tipo_2?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "productos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_tienda_id_fkey"
            columns: ["tienda_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          cedula: string | null
          correo: string
          created_at: string | null
          cuenta_cancelacion_categoria: string | null
          cuenta_cancelacion_razon: string | null
          cuenta_cancelada_at: string | null
          direccion: string | null
          email_aimma_verificado: boolean
          estado: string | null
          id: string
          metodo_registro: string | null
          nombre_completo: string
          nombre_empresa: string | null
          pagina_web: string | null
          perfil_completo: boolean | null
          plan_actual: string | null
          rol: string | null
          telefono: string | null
          token_balance: number
          trial_consumed: boolean
          trial_ends_at: string | null
          trial_started_at: string | null
          updated_at: string | null
          verificacion_enviado_at: string | null
          verificacion_token: string
          welcome_enviado_at: string | null
        }
        Insert: {
          cedula?: string | null
          correo: string
          created_at?: string | null
          cuenta_cancelacion_categoria?: string | null
          cuenta_cancelacion_razon?: string | null
          cuenta_cancelada_at?: string | null
          direccion?: string | null
          email_aimma_verificado?: boolean
          estado?: string | null
          id: string
          metodo_registro?: string | null
          nombre_completo: string
          nombre_empresa?: string | null
          pagina_web?: string | null
          perfil_completo?: boolean | null
          plan_actual?: string | null
          rol?: string | null
          telefono?: string | null
          token_balance?: number
          trial_consumed?: boolean
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string | null
          verificacion_enviado_at?: string | null
          verificacion_token?: string
          welcome_enviado_at?: string | null
        }
        Update: {
          cedula?: string | null
          correo?: string
          created_at?: string | null
          cuenta_cancelacion_categoria?: string | null
          cuenta_cancelacion_razon?: string | null
          cuenta_cancelada_at?: string | null
          direccion?: string | null
          email_aimma_verificado?: boolean
          estado?: string | null
          id?: string
          metodo_registro?: string | null
          nombre_completo?: string
          nombre_empresa?: string | null
          pagina_web?: string | null
          perfil_completo?: boolean | null
          plan_actual?: string | null
          rol?: string | null
          telefono?: string | null
          token_balance?: number
          trial_consumed?: boolean
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string | null
          verificacion_enviado_at?: string | null
          verificacion_token?: string
          welcome_enviado_at?: string | null
        }
        Relationships: []
      }
      rate_buckets: {
        Row: {
          capacity: number
          last_refill_at: string
          provider: string
          refill_per_second: number
          tokens: number
          updated_at: string
        }
        Insert: {
          capacity: number
          last_refill_at?: string
          provider: string
          refill_per_second: number
          tokens: number
          updated_at?: string
        }
        Update: {
          capacity?: number
          last_refill_at?: string
          provider?: string
          refill_per_second?: number
          tokens?: number
          updated_at?: string
        }
        Relationships: []
      }
      reservas_stock: {
        Row: {
          cantidad: number
          expira_at: string
          id: string
          pedido_id: string
          reservado_at: string
          variante_id: string
        }
        Insert: {
          cantidad: number
          expira_at: string
          id?: string
          pedido_id: string
          reservado_at?: string
          variante_id: string
        }
        Update: {
          cantidad?: number
          expira_at?: string
          id?: string
          pedido_id?: string
          reservado_at?: string
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservas_stock_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_stock_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "producto_variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      resenas: {
        Row: {
          calificacion: number
          comentario: string | null
          created_at: string
          estado: string
          id: string
          nombre_cliente: string
          producto_id: string
          tienda_id: string
        }
        Insert: {
          calificacion: number
          comentario?: string | null
          created_at?: string
          estado?: string
          id?: string
          nombre_cliente: string
          producto_id: string
          tienda_id: string
        }
        Update: {
          calificacion?: number
          comentario?: string | null
          created_at?: string
          estado?: string
          id?: string
          nombre_cliente?: string
          producto_id?: string
          tienda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resenas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resenas_tienda_id_fkey"
            columns: ["tienda_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
        ]
      }
      suscripciones: {
        Row: {
          activada_en: string | null
          cancelacion_email_enviado_at: string | null
          cancelada_en: string | null
          cortesia: boolean
          cortesia_razon: string | null
          created_at: string | null
          estado: string | null
          fecha_fin: string | null
          fecha_inicio: string | null
          garantia_30_dias_hasta: string | null
          id: string
          metodo_pago: string | null
          monto: number | null
          mp_init_point: string | null
          mp_payment_id: string | null
          mp_preapproval_id: string | null
          mp_status: string | null
          plan_codigo: string
          plan_tipo: string | null
          proxima_facturacion: string | null
          updated_at: string | null
          user_id: string
          welcome_pro_enviado_at: string | null
        }
        Insert: {
          activada_en?: string | null
          cancelacion_email_enviado_at?: string | null
          cancelada_en?: string | null
          cortesia?: boolean
          cortesia_razon?: string | null
          created_at?: string | null
          estado?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          garantia_30_dias_hasta?: string | null
          id?: string
          metodo_pago?: string | null
          monto?: number | null
          mp_init_point?: string | null
          mp_payment_id?: string | null
          mp_preapproval_id?: string | null
          mp_status?: string | null
          plan_codigo: string
          plan_tipo?: string | null
          proxima_facturacion?: string | null
          updated_at?: string | null
          user_id: string
          welcome_pro_enviado_at?: string | null
        }
        Update: {
          activada_en?: string | null
          cancelacion_email_enviado_at?: string | null
          cancelada_en?: string | null
          cortesia?: boolean
          cortesia_razon?: string | null
          created_at?: string | null
          estado?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          garantia_30_dias_hasta?: string | null
          id?: string
          metodo_pago?: string | null
          monto?: number | null
          mp_init_point?: string | null
          mp_payment_id?: string | null
          mp_preapproval_id?: string | null
          mp_status?: string | null
          plan_codigo?: string
          plan_tipo?: string | null
          proxima_facturacion?: string | null
          updated_at?: string | null
          user_id?: string
          welcome_pro_enviado_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suscripciones_plan_codigo_fkey"
            columns: ["plan_codigo"]
            isOneToOne: false
            referencedRelation: "planes"
            referencedColumns: ["codigo"]
          },
        ]
      }
      system_config: {
        Row: {
          clave: string
          descripcion: string | null
          updated_at: string | null
          valor: string
        }
        Insert: {
          clave: string
          descripcion?: string | null
          updated_at?: string | null
          valor: string
        }
        Update: {
          clave?: string
          descripcion?: string | null
          updated_at?: string | null
          valor?: string
        }
        Relationships: []
      }
      tienda_clientes: {
        Row: {
          created_at: string
          direcciones: Json
          email: string
          id: string
          nombre: string | null
          telefono: string | null
          tienda_id: string
          ultimo_login_at: string | null
        }
        Insert: {
          created_at?: string
          direcciones?: Json
          email: string
          id?: string
          nombre?: string | null
          telefono?: string | null
          tienda_id: string
          ultimo_login_at?: string | null
        }
        Update: {
          created_at?: string
          direcciones?: Json
          email?: string
          id?: string
          nombre?: string | null
          telefono?: string | null
          tienda_id?: string
          ultimo_login_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tienda_clientes_tienda_id_fkey"
            columns: ["tienda_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
        ]
      }
      tienda_clientes_otp: {
        Row: {
          codigo_hash: string
          created_at: string
          email: string
          expira_at: string
          id: string
          intentos: number
          tienda_id: string
          usado: boolean
        }
        Insert: {
          codigo_hash: string
          created_at?: string
          email: string
          expira_at: string
          id?: string
          intentos?: number
          tienda_id: string
          usado?: boolean
        }
        Update: {
          codigo_hash?: string
          created_at?: string
          email?: string
          expira_at?: string
          id?: string
          intentos?: number
          tienda_id?: string
          usado?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "tienda_clientes_otp_tienda_id_fkey"
            columns: ["tienda_id"]
            isOneToOne: false
            referencedRelation: "tiendas"
            referencedColumns: ["id"]
          },
        ]
      }
      tienda_paginas_legales_templates: {
        Row: {
          actualizado_at: string
          contenido_html: string
          revisado_por_jorge: boolean
          secciones_template: Json
          tipo: string
          titulo: string
        }
        Insert: {
          actualizado_at?: string
          contenido_html: string
          revisado_por_jorge?: boolean
          secciones_template?: Json
          tipo: string
          titulo: string
        }
        Update: {
          actualizado_at?: string
          contenido_html?: string
          revisado_por_jorge?: boolean
          secciones_template?: Json
          tipo?: string
          titulo?: string
        }
        Relationships: []
      }
      tienda_slugs_reservados: {
        Row: {
          slug: string
        }
        Insert: {
          slug: string
        }
        Update: {
          slug?: string
        }
        Relationships: []
      }
      tiendas: {
        Row: {
          ciudad_negocio: string | null
          cortesia_razon: string | null
          created_at: string
          direccion: string | null
          easypanel_domain_id: string | null
          email_contacto: string | null
          estado: string
          horario_atencion: string | null
          id: string
          idioma: string
          logo_url: string | null
          mostrar_agotados: string
          nit: string | null
          nombre_legal: string | null
          nombre_negocio: string
          paleta_id: string | null
          personalizaciones: Json
          plan_tienda: string
          plantilla_id: string | null
          slug: string
          subdominio_publicado_at: string | null
          sync_dashboard_excel_activo: boolean
          telefono_contacto: string | null
          updated_at: string
          user_id: string
          whatsapp_dueno: string
        }
        Insert: {
          ciudad_negocio?: string | null
          cortesia_razon?: string | null
          created_at?: string
          direccion?: string | null
          easypanel_domain_id?: string | null
          email_contacto?: string | null
          estado?: string
          horario_atencion?: string | null
          id?: string
          idioma?: string
          logo_url?: string | null
          mostrar_agotados?: string
          nit?: string | null
          nombre_legal?: string | null
          nombre_negocio: string
          paleta_id?: string | null
          personalizaciones?: Json
          plan_tienda?: string
          plantilla_id?: string | null
          slug: string
          subdominio_publicado_at?: string | null
          sync_dashboard_excel_activo?: boolean
          telefono_contacto?: string | null
          updated_at?: string
          user_id: string
          whatsapp_dueno: string
        }
        Update: {
          ciudad_negocio?: string | null
          cortesia_razon?: string | null
          created_at?: string
          direccion?: string | null
          easypanel_domain_id?: string | null
          email_contacto?: string | null
          estado?: string
          horario_atencion?: string | null
          id?: string
          idioma?: string
          logo_url?: string | null
          mostrar_agotados?: string
          nit?: string | null
          nombre_legal?: string | null
          nombre_negocio?: string
          paleta_id?: string | null
          personalizaciones?: Json
          plan_tienda?: string
          plantilla_id?: string | null
          slug?: string
          subdominio_publicado_at?: string | null
          sync_dashboard_excel_activo?: boolean
          telefono_contacto?: string | null
          updated_at?: string
          user_id?: string
          whatsapp_dueno?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_tiendas_paleta"
            columns: ["paleta_id"]
            isOneToOne: false
            referencedRelation: "paletas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_tiendas_plantilla"
            columns: ["plantilla_id"]
            isOneToOne: false
            referencedRelation: "plantillas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tiendas_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      token_ledger: {
        Row: {
          created_at: string | null
          delta: number
          id: number
          referencia: string | null
          saldo_resultante: number
          tipo: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          delta: number
          id?: number
          referencia?: string | null
          saldo_resultante: number
          tipo: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          delta?: number
          id?: number
          referencia?: string | null
          saldo_resultante?: number
          tipo?: string
          user_id?: string
        }
        Relationships: []
      }
      token_pack_orders: {
        Row: {
          cantidad_tokens: number
          created_at: string | null
          estado: string
          external_reference: string | null
          id: string
          mp_init_point: string | null
          mp_payment_id: string | null
          mp_preference_id: string | null
          pack_codigo: string
          pagado_en: string | null
          precio_cop: number
          user_id: string
        }
        Insert: {
          cantidad_tokens: number
          created_at?: string | null
          estado?: string
          external_reference?: string | null
          id?: string
          mp_init_point?: string | null
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          pack_codigo: string
          pagado_en?: string | null
          precio_cop: number
          user_id: string
        }
        Update: {
          cantidad_tokens?: number
          created_at?: string | null
          estado?: string
          external_reference?: string | null
          id?: string
          mp_init_point?: string | null
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          pack_codigo?: string
          pagado_en?: string | null
          precio_cop?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_pack_orders_pack_codigo_fkey"
            columns: ["pack_codigo"]
            isOneToOne: false
            referencedRelation: "token_packs"
            referencedColumns: ["codigo"]
          },
        ]
      }
      token_packs: {
        Row: {
          activo: boolean
          cantidad_tokens: number
          codigo: string
          created_at: string | null
          id: number
          nombre: string
          orden: number
          precio_cop: number
        }
        Insert: {
          activo?: boolean
          cantidad_tokens: number
          codigo: string
          created_at?: string | null
          id?: number
          nombre: string
          orden?: number
          precio_cop: number
        }
        Update: {
          activo?: boolean
          cantidad_tokens?: number
          codigo?: string
          created_at?: string | null
          id?: number
          nombre?: string
          orden?: number
          precio_cop?: number
        }
        Relationships: []
      }
      wa_clientes: {
        Row: {
          cedula: string | null
          correo: string | null
          created_at: string
          empresa: string | null
          es_cliente_pro: boolean
          id: string
          instagram: string | null
          nombre: string | null
          nombre_whatsapp: string | null
          notas: string | null
          profile_id: string | null
          sitio_web: string | null
          telefono: string
          tipo: string
          updated_at: string
        }
        Insert: {
          cedula?: string | null
          correo?: string | null
          created_at?: string
          empresa?: string | null
          es_cliente_pro?: boolean
          id?: string
          instagram?: string | null
          nombre?: string | null
          nombre_whatsapp?: string | null
          notas?: string | null
          profile_id?: string | null
          sitio_web?: string | null
          telefono: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          cedula?: string | null
          correo?: string | null
          created_at?: string
          empresa?: string | null
          es_cliente_pro?: boolean
          id?: string
          instagram?: string | null
          nombre?: string | null
          nombre_whatsapp?: string | null
          notas?: string | null
          profile_id?: string | null
          sitio_web?: string | null
          telefono?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_clientes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_consultorias: {
        Row: {
          cliente_id: string | null
          conversacion_id: string | null
          created_at: string
          descripcion: string
          estado: string
          folio: string | null
          id: string
          notificado_ceo: boolean
          presupuesto_aprox: string | null
          prioridad: string
          tipo_solicitud: string
        }
        Insert: {
          cliente_id?: string | null
          conversacion_id?: string | null
          created_at?: string
          descripcion: string
          estado?: string
          folio?: string | null
          id?: string
          notificado_ceo?: boolean
          presupuesto_aprox?: string | null
          prioridad?: string
          tipo_solicitud: string
        }
        Update: {
          cliente_id?: string | null
          conversacion_id?: string | null
          created_at?: string
          descripcion?: string
          estado?: string
          folio?: string | null
          id?: string
          notificado_ceo?: boolean
          presupuesto_aprox?: string | null
          prioridad?: string
          tipo_solicitud?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_consultorias_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "wa_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_consultorias_conversacion_id_fkey"
            columns: ["conversacion_id"]
            isOneToOne: false
            referencedRelation: "wa_conversaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_conversaciones: {
        Row: {
          canal: string
          cerrada_en: string | null
          cliente_id: string
          estado: string
          id: string
          iniciada_en: string
          telefono: string
          ultimo_mensaje_en: string
        }
        Insert: {
          canal?: string
          cerrada_en?: string | null
          cliente_id: string
          estado?: string
          id?: string
          iniciada_en?: string
          telefono: string
          ultimo_mensaje_en?: string
        }
        Update: {
          canal?: string
          cerrada_en?: string | null
          cliente_id?: string
          estado?: string
          id?: string
          iniciada_en?: string
          telefono?: string
          ultimo_mensaje_en?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_conversaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "wa_clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_escalamientos: {
        Row: {
          cliente_id: string | null
          consultoria_id: string | null
          contexto: string | null
          conversacion_id: string | null
          created_at: string
          enviado_email: boolean
          enviado_whatsapp: boolean
          id: string
          motivo: string
          reclamo_id: string | null
          registrado_sheet: boolean
          urgencia: string
        }
        Insert: {
          cliente_id?: string | null
          consultoria_id?: string | null
          contexto?: string | null
          conversacion_id?: string | null
          created_at?: string
          enviado_email?: boolean
          enviado_whatsapp?: boolean
          id?: string
          motivo: string
          reclamo_id?: string | null
          registrado_sheet?: boolean
          urgencia?: string
        }
        Update: {
          cliente_id?: string | null
          consultoria_id?: string | null
          contexto?: string | null
          conversacion_id?: string | null
          created_at?: string
          enviado_email?: boolean
          enviado_whatsapp?: boolean
          id?: string
          motivo?: string
          reclamo_id?: string | null
          registrado_sheet?: boolean
          urgencia?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_escalamientos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "wa_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_escalamientos_consultoria_id_fkey"
            columns: ["consultoria_id"]
            isOneToOne: false
            referencedRelation: "wa_consultorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_escalamientos_conversacion_id_fkey"
            columns: ["conversacion_id"]
            isOneToOne: false
            referencedRelation: "wa_conversaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_escalamientos_reclamo_id_fkey"
            columns: ["reclamo_id"]
            isOneToOne: false
            referencedRelation: "wa_reclamos"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_mensajes: {
        Row: {
          audio_url: string | null
          cliente_id: string
          contenido: string | null
          conversacion_id: string
          created_at: string
          direccion: string
          id: string
          metadata: Json | null
          tipo: string
          tokens_usados: number
          whatsapp_message_id: string | null
        }
        Insert: {
          audio_url?: string | null
          cliente_id: string
          contenido?: string | null
          conversacion_id: string
          created_at?: string
          direccion: string
          id?: string
          metadata?: Json | null
          tipo: string
          tokens_usados?: number
          whatsapp_message_id?: string | null
        }
        Update: {
          audio_url?: string | null
          cliente_id?: string
          contenido?: string | null
          conversacion_id?: string
          created_at?: string
          direccion?: string
          id?: string
          metadata?: Json | null
          tipo?: string
          tokens_usados?: number
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_mensajes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "wa_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_mensajes_conversacion_id_fkey"
            columns: ["conversacion_id"]
            isOneToOne: false
            referencedRelation: "wa_conversaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_reclamos: {
        Row: {
          categoria: string
          cliente_id: string | null
          conversacion_id: string | null
          created_at: string
          descripcion: string
          detalle_problema: string | null
          escalado_ceo: boolean
          estado: string
          folio: string | null
          id: string
          resuelto_at: string | null
        }
        Insert: {
          categoria?: string
          cliente_id?: string | null
          conversacion_id?: string | null
          created_at?: string
          descripcion: string
          detalle_problema?: string | null
          escalado_ceo?: boolean
          estado?: string
          folio?: string | null
          id?: string
          resuelto_at?: string | null
        }
        Update: {
          categoria?: string
          cliente_id?: string | null
          conversacion_id?: string | null
          created_at?: string
          descripcion?: string
          detalle_problema?: string | null
          escalado_ceo?: boolean
          estado?: string
          folio?: string | null
          id?: string
          resuelto_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_reclamos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "wa_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_reclamos_conversacion_id_fkey"
            columns: ["conversacion_id"]
            isOneToOne: false
            referencedRelation: "wa_conversaciones"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acreditar_tokens: {
        Args: {
          p_cantidad: number
          p_referencia: string
          p_tipo: string
          p_user_id: string
        }
        Returns: Json
      }
      check_email_rate_limit: {
        Args: {
          p_correo: string
          p_evento: string
          p_max: number
          p_ventana_min: number
        }
        Returns: Json
      }
      is_admin: { Args: never; Returns: boolean }
      is_admin_or_cofounder: { Args: never; Returns: boolean }
      reembolsar_tokens: { Args: { p_job_id: string }; Returns: Json }
      reservar_tokens: {
        Args: { p_cantidad: number; p_job_id: string; p_user_id: string }
        Returns: Json
      }
      reservar_tokens_v2: {
        Args: { p_cantidad: number; p_job_id: string; p_user_id: string }
        Returns: Json
      }
      tienda_ia_es_dueno: { Args: { p_tienda_id: string }; Returns: boolean }
      tiene_acceso_pro: { Args: { p_user_id: string }; Returns: Json }
      try_consume_rate_token: { Args: { p_provider: string }; Returns: boolean }
      verify_email_by_token: { Args: { p_token: string }; Returns: Json }
      wa_fn_actualizar_cliente: {
        Args: {
          p_cedula: string
          p_cliente_id: string
          p_correo: string
          p_empresa: string
          p_nombre: string
        }
        Returns: undefined
      }
      wa_fn_consultoria: {
        Args: {
          p_cliente_id: string
          p_conversacion_id: string
          p_descripcion: string
          p_prioridad: string
          p_tipo: string
        }
        Returns: Json
      }
      wa_fn_entrante: {
        Args: {
          p_message_id: string
          p_nombre_wa: string
          p_telefono: string
          p_texto: string
          p_tipo: string
        }
        Returns: Json
      }
      wa_fn_reclamo: {
        Args: {
          p_categoria: string
          p_cliente_id: string
          p_conversacion_id: string
          p_descripcion: string
          p_detalle: string
        }
        Returns: Json
      }
      wa_fn_saliente: {
        Args: {
          p_cliente_id: string
          p_conversacion_id: string
          p_texto: string
          p_tokens: number
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
