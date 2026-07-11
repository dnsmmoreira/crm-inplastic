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
      condicoes_pagamento: {
        Row: {
          active: boolean
          created_at: string
          id: string
          label: string
          method: string
          notes: string | null
          splits: Json
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id: string
          label: string
          method: string
          notes?: string | null
          splits?: Json
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          label?: string
          method?: string
          notes?: string | null
          splits?: Json
          updated_at?: string
        }
        Relationships: []
      }
      emitters: {
        Row: {
          address: string | null
          brand: string
          cnpj: string
          created_at: string
          email: string | null
          id: string
          ie: string | null
          is_default: boolean
          legal_name: string
          phone: string | null
          tagline: string | null
          updated_at: string
          website: string | null
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          brand: string
          cnpj: string
          created_at?: string
          email?: string | null
          id: string
          ie?: string | null
          is_default?: boolean
          legal_name: string
          phone?: string | null
          tagline?: string | null
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          brand?: string
          cnpj?: string
          created_at?: string
          email?: string | null
          id?: string
          ie?: string | null
          is_default?: boolean
          legal_name?: string
          phone?: string | null
          tagline?: string | null
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      fila_estado: {
        Row: {
          id: number
          ultimo_user_id: string | null
          updated_at: string
        }
        Insert: {
          id?: number
          ultimo_user_id?: string | null
          updated_at?: string
        }
        Update: {
          id?: number
          ultimo_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      fila_vendedores: {
        Row: {
          ativo: boolean
          created_at: string
          posicao: number
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          posicao?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          posicao?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lead_ai_actions: {
        Row: {
          content: string
          created_at: string
          id: string
          lead_id: string | null
          metadata: Json | null
          occurred_at: string
          owner_id: string | null
          type: Database["public"]["Enums"]["ai_action_type"]
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          occurred_at?: string
          owner_id?: string | null
          type: Database["public"]["Enums"]["ai_action_type"]
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          occurred_at?: string
          owner_id?: string | null
          type?: Database["public"]["Enums"]["ai_action_type"]
        }
        Relationships: [
          {
            foreignKeyName: "lead_ai_actions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_interactions: {
        Row: {
          content: string
          created_at: string
          id: string
          lead_id: string
          occurred_at: string
          owner_id: string | null
          type: Database["public"]["Enums"]["interaction_type"]
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          lead_id: string
          occurred_at?: string
          owner_id?: string | null
          type: Database["public"]["Enums"]["interaction_type"]
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          lead_id?: string
          occurred_at?: string
          owner_id?: string | null
          type?: Database["public"]["Enums"]["interaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "lead_interactions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          cnae_principal: string | null
          cnpj: string | null
          company: string
          contact_name: string
          created_at: string
          decisor_cargo: string | null
          decisor_nome: string | null
          email: string | null
          email_financeiro: string | null
          email_nf_xml: string | null
          endereco: Json | null
          esfriando: boolean
          estimated_value: number
          etapa_changed_at: string | null
          external_id: string | null
          faturamento_estimado: number | null
          id: string
          inscricao_estadual: string | null
          inscricao_municipal: string | null
          last_contact: string | null
          last_contact_at: string | null
          last_interaction_at: string | null
          next_followup: string | null
          nome_fantasia: string | null
          notes: string
          num_funcionarios: number | null
          origem: string | null
          owner_id: string | null
          phone: string | null
          porte: string | null
          product: string | null
          product_id: string | null
          proposta_enviada_at: string | null
          quantity: number
          razao_social: string | null
          segment: string | null
          site: string | null
          source: string
          stage: Database["public"]["Enums"]["lead_stage"]
          tags: string[]
          telefone_fixo: string | null
          telefone_whatsapp: string | null
          ultima_msg_cliente_at: string | null
          ultima_msg_vendedor_at: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          cnae_principal?: string | null
          cnpj?: string | null
          company: string
          contact_name?: string
          created_at?: string
          decisor_cargo?: string | null
          decisor_nome?: string | null
          email?: string | null
          email_financeiro?: string | null
          email_nf_xml?: string | null
          endereco?: Json | null
          esfriando?: boolean
          estimated_value?: number
          etapa_changed_at?: string | null
          external_id?: string | null
          faturamento_estimado?: number | null
          id?: string
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          last_contact?: string | null
          last_contact_at?: string | null
          last_interaction_at?: string | null
          next_followup?: string | null
          nome_fantasia?: string | null
          notes?: string
          num_funcionarios?: number | null
          origem?: string | null
          owner_id?: string | null
          phone?: string | null
          porte?: string | null
          product?: string | null
          product_id?: string | null
          proposta_enviada_at?: string | null
          quantity?: number
          razao_social?: string | null
          segment?: string | null
          site?: string | null
          source?: string
          stage?: Database["public"]["Enums"]["lead_stage"]
          tags?: string[]
          telefone_fixo?: string | null
          telefone_whatsapp?: string | null
          ultima_msg_cliente_at?: string | null
          ultima_msg_vendedor_at?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          cnae_principal?: string | null
          cnpj?: string | null
          company?: string
          contact_name?: string
          created_at?: string
          decisor_cargo?: string | null
          decisor_nome?: string | null
          email?: string | null
          email_financeiro?: string | null
          email_nf_xml?: string | null
          endereco?: Json | null
          esfriando?: boolean
          estimated_value?: number
          etapa_changed_at?: string | null
          external_id?: string | null
          faturamento_estimado?: number | null
          id?: string
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          last_contact?: string | null
          last_contact_at?: string | null
          last_interaction_at?: string | null
          next_followup?: string | null
          nome_fantasia?: string | null
          notes?: string
          num_funcionarios?: number | null
          origem?: string | null
          owner_id?: string | null
          phone?: string | null
          porte?: string | null
          product?: string | null
          product_id?: string | null
          proposta_enviada_at?: string | null
          quantity?: number
          razao_social?: string | null
          segment?: string | null
          site?: string | null
          source?: string
          stage?: Database["public"]["Enums"]["lead_stage"]
          tags?: string[]
          telefone_fixo?: string | null
          telefone_whatsapp?: string | null
          ultima_msg_cliente_at?: string | null
          ultima_msg_vendedor_at?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_itens: {
        Row: {
          description: string
          id: string
          pedido_id: string
          position: number
          product_id: string | null
          quantity: number
          sku: string
          unit: string
          unit_price: number
        }
        Insert: {
          description: string
          id?: string
          pedido_id: string
          position?: number
          product_id?: string | null
          quantity?: number
          sku: string
          unit?: string
          unit_price?: number
        }
        Update: {
          description?: string
          id?: string
          pedido_id?: string
          position?: number
          product_id?: string | null
          quantity?: number
          sku?: string
          unit?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "pedido_itens_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_itens_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          created_at: string
          id: string
          lead_id: string | null
          metadata: Json
          number: string
          owner_id: string
          proposta_id: string | null
          status: string
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id?: string | null
          metadata?: Json
          number: string
          owner_id: string
          proposta_id?: string | null
          status?: string
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string | null
          metadata?: Json
          number?: string
          owner_id?: string
          proposta_id?: string | null
          status?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: false
            referencedRelation: "propostas"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          active: boolean
          created_at: string
          default_price: number
          description: string
          height_cm: number
          id: string
          length_cm: number
          name: string
          ncm: string | null
          sku: string
          unit: string
          updated_at: string
          weight_kg: number
          width_cm: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_price?: number
          description?: string
          height_cm?: number
          id?: string
          length_cm?: number
          name: string
          ncm?: string | null
          sku: string
          unit?: string
          updated_at?: string
          weight_kg?: number
          width_cm?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          default_price?: number
          description?: string
          height_cm?: number
          id?: string
          length_cm?: number
          name?: string
          ncm?: string | null
          sku?: string
          unit?: string
          updated_at?: string
          weight_kg?: number
          width_cm?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_color: string
          created_at: string
          id: string
          name: string
          telefone_whatsapp: string | null
          updated_at: string
        }
        Insert: {
          avatar_color?: string
          created_at?: string
          id: string
          name?: string
          telefone_whatsapp?: string | null
          updated_at?: string
        }
        Update: {
          avatar_color?: string
          created_at?: string
          id?: string
          name?: string
          telefone_whatsapp?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      proposta_itens: {
        Row: {
          description: string
          id: string
          position: number
          product_id: string | null
          proposta_id: string
          quantity: number
          sku: string
          unit: string
          unit_price: number
        }
        Insert: {
          description: string
          id?: string
          position?: number
          product_id?: string | null
          proposta_id: string
          quantity?: number
          sku: string
          unit?: string
          unit_price?: number
        }
        Update: {
          description?: string
          id?: string
          position?: number
          product_id?: string | null
          proposta_id?: string
          quantity?: number
          sku?: string
          unit?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposta_itens_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposta_itens_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: false
            referencedRelation: "propostas"
            referencedColumns: ["id"]
          },
        ]
      }
      proposta_parcelas: {
        Row: {
          amount: number
          days: number
          id: string
          notes: string
          position: number
          proposta_id: string
        }
        Insert: {
          amount?: number
          days?: number
          id?: string
          notes?: string
          position?: number
          proposta_id: string
        }
        Update: {
          amount?: number
          days?: number
          id?: string
          notes?: string
          position?: number
          proposta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposta_parcelas_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: false
            referencedRelation: "propostas"
            referencedColumns: ["id"]
          },
        ]
      }
      propostas: {
        Row: {
          approval_reason: string | null
          approval_requested_at: string | null
          approved_at: string | null
          approved_by_user_id: string | null
          created_at: string
          discount_percent: number
          emitter_id: string
          id: string
          lead_id: string
          number: string
          observations: string
          order_created_at: string | null
          owner_id: string
          payment_term_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["proposal_status"]
          transport: Json
          updated_at: string
          validity_days: number
        }
        Insert: {
          approval_reason?: string | null
          approval_requested_at?: string | null
          approved_at?: string | null
          approved_by_user_id?: string | null
          created_at?: string
          discount_percent?: number
          emitter_id: string
          id?: string
          lead_id: string
          number: string
          observations?: string
          order_created_at?: string | null
          owner_id: string
          payment_term_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          transport?: Json
          updated_at?: string
          validity_days?: number
        }
        Update: {
          approval_reason?: string | null
          approval_requested_at?: string | null
          approved_at?: string | null
          approved_by_user_id?: string | null
          created_at?: string
          discount_percent?: number
          emitter_id?: string
          id?: string
          lead_id?: string
          number?: string
          observations?: string
          order_created_at?: string | null
          owner_id?: string
          payment_term_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          transport?: Json
          updated_at?: string
          validity_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "propostas_emitter_id_fkey"
            columns: ["emitter_id"]
            isOneToOne: false
            referencedRelation: "emitters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_payment_term_id_fkey"
            columns: ["payment_term_id"]
            isOneToOne: false
            referencedRelation: "condicoes_pagamento"
            referencedColumns: ["id"]
          },
        ]
      }
      system_workspace: {
        Row: {
          created_at: string
          data: Json
          id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      tarefas: {
        Row: {
          auto_generated: boolean
          concluida_at: string | null
          created_at: string
          descricao: string | null
          done: boolean
          due_date: string
          escalonamentos: number
          hora_sugerida: string | null
          id: string
          kind: string | null
          lead_id: string | null
          motivo_adiamento: string | null
          nota_conclusao: string | null
          origem: string
          owner_id: string | null
          prioridade: number
          status: string
          tipo: string | null
          title: string
          updated_at: string
        }
        Insert: {
          auto_generated?: boolean
          concluida_at?: string | null
          created_at?: string
          descricao?: string | null
          done?: boolean
          due_date: string
          escalonamentos?: number
          hora_sugerida?: string | null
          id?: string
          kind?: string | null
          lead_id?: string | null
          motivo_adiamento?: string | null
          nota_conclusao?: string | null
          origem?: string
          owner_id?: string | null
          prioridade?: number
          status?: string
          tipo?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          auto_generated?: boolean
          concluida_at?: string | null
          created_at?: string
          descricao?: string | null
          done?: boolean
          due_date?: string
          escalonamentos?: number
          hora_sugerida?: string | null
          id?: string
          kind?: string | null
          lead_id?: string | null
          motivo_adiamento?: string | null
          nota_conclusao?: string | null
          origem?: string
          owner_id?: string | null
          prioridade?: number
          status?: string
          tipo?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_workspaces: {
        Row: {
          created_at: string
          data: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vendedor_metas: {
        Row: {
          created_at: string
          meta_valor_mensal: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          meta_valor_mensal?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          meta_valor_mensal?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vendedor_metas_historico: {
        Row: {
          ano: number
          atingido_pct: number
          bateu: boolean
          ganhos_qtd: number
          ganhos_valor: number
          id: string
          mes: number
          meta_valor: number
          snapshot_at: string
          user_id: string
        }
        Insert: {
          ano: number
          atingido_pct?: number
          bateu?: boolean
          ganhos_qtd?: number
          ganhos_valor?: number
          id?: string
          mes: number
          meta_valor?: number
          snapshot_at?: string
          user_id: string
        }
        Update: {
          ano?: number
          atingido_pct?: number
          bateu?: boolean
          ganhos_qtd?: number
          ganhos_valor?: number
          id?: string
          mes?: number
          meta_valor?: number
          snapshot_at?: string
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_conversas: {
        Row: {
          created_at: string
          ia_ativa: boolean
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          lead_id: string | null
          name: string | null
          phone: string
          status: Database["public"]["Enums"]["conversa_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          ia_ativa?: boolean
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          lead_id?: string | null
          name?: string | null
          phone: string
          status?: Database["public"]["Enums"]["conversa_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          ia_ativa?: boolean
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          lead_id?: string | null
          name?: string | null
          phone?: string
          status?: Database["public"]["Enums"]["conversa_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_mensagens: {
        Row: {
          autor: Database["public"]["Enums"]["msg_autor"]
          conteudo: string
          conversa_id: string
          created_at: string
          direcao: Database["public"]["Enums"]["msg_direcao"]
          external_id: string | null
          id: string
        }
        Insert: {
          autor: Database["public"]["Enums"]["msg_autor"]
          conteudo: string
          conversa_id: string
          created_at?: string
          direcao: Database["public"]["Enums"]["msg_direcao"]
          external_id?: string | null
          id?: string
        }
        Update: {
          autor?: Database["public"]["Enums"]["msg_autor"]
          conteudo?: string
          conversa_id?: string
          created_at?: string
          direcao?: Database["public"]["Enums"]["msg_direcao"]
          external_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_mensagens_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      xerife_config: {
        Row: {
          ativo: boolean
          auto_atribuir_lead_orfao: boolean
          cadencia_proposta_dias: number[]
          carteira_alerta_dias: number
          carteira_critico_dias: number
          dias_sem_interacao_por_etapa: Json
          dias_uteis_fim: string
          dias_uteis_inicio: string
          horario_comercial_fim: string
          horario_comercial_inicio: string
          ia_sem_resposta_horas: number
          id: number
          max_dias_etapa: Json
          meta_atividades_dia: number
          placar_dias_sem_proposta_limite: number
          placar_peso_carteira_60: number
          placar_peso_ganho: number
          placar_peso_meta_batida: number
          placar_peso_pos_venda: number
          placar_peso_proposta: number
          placar_peso_sla_estourado: number
          placar_peso_tarefa: number
          pos_venda_dias: number[]
          proposta_enviada_dias: number
          reciclagem_perdidos_dias: number
          resumo_diario_ativo: boolean
          resumo_hora: string
          sla_lead_orfao_min: number
          sla_primeiro_contato_escalar_min: number
          sla_primeiro_contato_min: number
          sla_resposta_whatsapp_escalar_horas: number
          sla_resposta_whatsapp_horas: number
          tarefa_atrasada_horas: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          auto_atribuir_lead_orfao?: boolean
          cadencia_proposta_dias?: number[]
          carteira_alerta_dias?: number
          carteira_critico_dias?: number
          dias_sem_interacao_por_etapa?: Json
          dias_uteis_fim?: string
          dias_uteis_inicio?: string
          horario_comercial_fim?: string
          horario_comercial_inicio?: string
          ia_sem_resposta_horas?: number
          id?: number
          max_dias_etapa?: Json
          meta_atividades_dia?: number
          placar_dias_sem_proposta_limite?: number
          placar_peso_carteira_60?: number
          placar_peso_ganho?: number
          placar_peso_meta_batida?: number
          placar_peso_pos_venda?: number
          placar_peso_proposta?: number
          placar_peso_sla_estourado?: number
          placar_peso_tarefa?: number
          pos_venda_dias?: number[]
          proposta_enviada_dias?: number
          reciclagem_perdidos_dias?: number
          resumo_diario_ativo?: boolean
          resumo_hora?: string
          sla_lead_orfao_min?: number
          sla_primeiro_contato_escalar_min?: number
          sla_primeiro_contato_min?: number
          sla_resposta_whatsapp_escalar_horas?: number
          sla_resposta_whatsapp_horas?: number
          tarefa_atrasada_horas?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          auto_atribuir_lead_orfao?: boolean
          cadencia_proposta_dias?: number[]
          carteira_alerta_dias?: number
          carteira_critico_dias?: number
          dias_sem_interacao_por_etapa?: Json
          dias_uteis_fim?: string
          dias_uteis_inicio?: string
          horario_comercial_fim?: string
          horario_comercial_inicio?: string
          ia_sem_resposta_horas?: number
          id?: number
          max_dias_etapa?: Json
          meta_atividades_dia?: number
          placar_dias_sem_proposta_limite?: number
          placar_peso_carteira_60?: number
          placar_peso_ganho?: number
          placar_peso_meta_batida?: number
          placar_peso_pos_venda?: number
          placar_peso_proposta?: number
          placar_peso_sla_estourado?: number
          placar_peso_tarefa?: number
          pos_venda_dias?: number[]
          proposta_enviada_dias?: number
          reciclagem_perdidos_dias?: number
          resumo_diario_ativo?: boolean
          resumo_hora?: string
          sla_lead_orfao_min?: number
          sla_primeiro_contato_escalar_min?: number
          sla_primeiro_contato_min?: number
          sla_resposta_whatsapp_escalar_horas?: number
          sla_resposta_whatsapp_horas?: number
          tarefa_atrasada_horas?: number
          updated_at?: string
        }
        Relationships: []
      }
      xerife_log: {
        Row: {
          acao_tomada: string
          cliente_id: string | null
          created_at: string
          id: string
          lead_id: string | null
          payload: Json
          regra: string
          vendedor_id: string | null
        }
        Insert: {
          acao_tomada: string
          cliente_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          payload?: Json
          regra: string
          vendedor_id?: string | null
        }
        Update: {
          acao_tomada?: string
          cliente_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          payload?: Json
          regra?: string
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "xerife_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      zapi_inbox: {
        Row: {
          created_at: string
          id: string
          message: string
          name: string | null
          phone: string
          processed: boolean
          raw: Json | null
          received_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          name?: string | null
          phone: string
          processed?: boolean
          raw?: Json | null
          received_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          name?: string | null
          phone?: string
          processed?: boolean
          raw?: Json | null
          received_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      atribuir_proximo_vendedor: { Args: { _lead_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      placar_vendedores: {
        Args: { _periodo?: string }
        Returns: {
          avatar_color: string
          carteira_45_60: number
          carteira_60_mais: number
          conversao: number
          dias_sem_proposta: number
          dias_sem_proposta_limite: number
          ganhos_qtd: number
          ganhos_valor: number
          leads_contatados: number
          meta_batida: boolean
          meta_faixa: number
          meta_pace_esperado_pct: number
          meta_pct: number
          meta_valor: number
          nome: string
          perdas_qtd: number
          pos_venda_no_prazo_pct: number
          posicao: number
          propostas_qtd: number
          score: number
          score_periodo_anterior: number
          slas_estourados: number
          tempo_medio_primeira_resposta_min: number
          vendedor_id: string
        }[]
      }
      snapshot_metas_mes: {
        Args: { _ano: number; _mes: number }
        Returns: number
      }
    }
    Enums: {
      ai_action_type:
        | "followup"
        | "schedule"
        | "qualify"
        | "reply"
        | "alerta"
        | "resumo"
      app_role: "admin" | "vendedor"
      conversa_status:
        | "ia_atendendo"
        | "humano_atendendo"
        | "qualificado"
        | "encerrado"
      interaction_type: "email" | "call" | "meeting" | "note" | "whatsapp"
      lead_stage:
        | "atendimento"
        | "novo"
        | "qualificacao"
        | "proposta"
        | "negociacao"
        | "ganho"
        | "perdido"
      msg_autor: "cliente" | "ia" | "vendedor"
      msg_direcao: "entrada" | "saida"
      proposal_status:
        | "rascunho"
        | "enviada"
        | "aguardando_aprovacao"
        | "aprovada"
        | "recusada"
        | "pedido"
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
    Enums: {
      ai_action_type: [
        "followup",
        "schedule",
        "qualify",
        "reply",
        "alerta",
        "resumo",
      ],
      app_role: ["admin", "vendedor"],
      conversa_status: [
        "ia_atendendo",
        "humano_atendendo",
        "qualificado",
        "encerrado",
      ],
      interaction_type: ["email", "call", "meeting", "note", "whatsapp"],
      lead_stage: [
        "atendimento",
        "novo",
        "qualificacao",
        "proposta",
        "negociacao",
        "ganho",
        "perdido",
      ],
      msg_autor: ["cliente", "ia", "vendedor"],
      msg_direcao: ["entrada", "saida"],
      proposal_status: [
        "rascunho",
        "enviada",
        "aguardando_aprovacao",
        "aprovada",
        "recusada",
        "pedido",
      ],
    },
  },
} as const
