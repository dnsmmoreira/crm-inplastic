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
      arena_aprovacoes_extraordinarias: {
        Row: {
          aprovador_id: string | null
          created_at: string
          decidido_em: string | null
          desconto_percent: number | null
          id: string
          margem_minima_pct: number | null
          margem_original_pct: number | null
          margem_proposta_pct: number | null
          motivo: string
          observacao: string | null
          proposta_id: string
          solicitante_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          aprovador_id?: string | null
          created_at?: string
          decidido_em?: string | null
          desconto_percent?: number | null
          id?: string
          margem_minima_pct?: number | null
          margem_original_pct?: number | null
          margem_proposta_pct?: number | null
          motivo: string
          observacao?: string | null
          proposta_id: string
          solicitante_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          aprovador_id?: string | null
          created_at?: string
          decidido_em?: string | null
          desconto_percent?: number | null
          id?: string
          margem_minima_pct?: number | null
          margem_original_pct?: number | null
          margem_proposta_pct?: number | null
          motivo?: string
          observacao?: string | null
          proposta_id?: string
          solicitante_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "arena_aprovacoes_extraordinarias_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: false
            referencedRelation: "propostas"
            referencedColumns: ["id"]
          },
        ]
      }
      arena_audit_log: {
        Row: {
          alvo_user_id: string | null
          ator_user_id: string | null
          campo: string
          criado_em: string
          entidade: string
          entidade_id: string | null
          id: string
          motivo: string | null
          valor_anterior: string | null
          valor_novo: string | null
        }
        Insert: {
          alvo_user_id?: string | null
          ator_user_id?: string | null
          campo: string
          criado_em?: string
          entidade: string
          entidade_id?: string | null
          id?: string
          motivo?: string | null
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Update: {
          alvo_user_id?: string | null
          ator_user_id?: string | null
          campo?: string
          criado_em?: string
          entidade?: string
          entidade_id?: string | null
          id?: string
          motivo?: string | null
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Relationships: []
      }
      arena_config: {
        Row: {
          aprovacao_primeira_compra_valor: number
          aprovacao_recorrencia_dias: number
          aprovacao_valor_obrigatorio: number
          arena_cap_temporada: number
          arena_data_inicio: string
          arena_orcamento_mensal: number
          base_calculo_default: string
          base_calculo_logiscal: string
          carencia_meses_default: number
          comissao_kelly_pct: number
          comissao_logiscal_pct: number
          created_at: string
          custo_interno_teto_pct: number
          custo_produto_pct_estimado: number
          encargos_fator: number
          id: number
          interno_custo_fixo_mensal: number
          interno_custo_variavel_pct: number
          margem_minima_pct: number
          margem_piso_comercial_pct: number
          meta_canal_representante: number
          piso_preco_pct: number
          piso_rodada_ativo: boolean
          piso_rodada_pace_pct: number
          rampa_metas: Json
          rep_custo_fixo_incremental_mensal: number
          rep_custo_variavel_pct: number
          temporada_meses: number
          updated_at: string
        }
        Insert: {
          aprovacao_primeira_compra_valor?: number
          aprovacao_recorrencia_dias?: number
          aprovacao_valor_obrigatorio?: number
          arena_cap_temporada?: number
          arena_data_inicio?: string
          arena_orcamento_mensal?: number
          base_calculo_default?: string
          base_calculo_logiscal?: string
          carencia_meses_default?: number
          comissao_kelly_pct?: number
          comissao_logiscal_pct?: number
          created_at?: string
          custo_interno_teto_pct?: number
          custo_produto_pct_estimado?: number
          encargos_fator?: number
          id?: number
          interno_custo_fixo_mensal?: number
          interno_custo_variavel_pct?: number
          margem_minima_pct?: number
          margem_piso_comercial_pct?: number
          meta_canal_representante?: number
          piso_preco_pct?: number
          piso_rodada_ativo?: boolean
          piso_rodada_pace_pct?: number
          rampa_metas?: Json
          rep_custo_fixo_incremental_mensal?: number
          rep_custo_variavel_pct?: number
          temporada_meses?: number
          updated_at?: string
        }
        Update: {
          aprovacao_primeira_compra_valor?: number
          aprovacao_recorrencia_dias?: number
          aprovacao_valor_obrigatorio?: number
          arena_cap_temporada?: number
          arena_data_inicio?: string
          arena_orcamento_mensal?: number
          base_calculo_default?: string
          base_calculo_logiscal?: string
          carencia_meses_default?: number
          comissao_kelly_pct?: number
          comissao_logiscal_pct?: number
          created_at?: string
          custo_interno_teto_pct?: number
          custo_produto_pct_estimado?: number
          encargos_fator?: number
          id?: number
          interno_custo_fixo_mensal?: number
          interno_custo_variavel_pct?: number
          margem_minima_pct?: number
          margem_piso_comercial_pct?: number
          meta_canal_representante?: number
          piso_preco_pct?: number
          piso_rodada_ativo?: boolean
          piso_rodada_pace_pct?: number
          rampa_metas?: Json
          rep_custo_fixo_incremental_mensal?: number
          rep_custo_variavel_pct?: number
          temporada_meses?: number
          updated_at?: string
        }
        Relationships: []
      }
      arena_custo_mensal: {
        Row: {
          ano: number
          canal: string
          categoria: string
          created_at: string
          formacao: boolean
          id: string
          mes: number
          observacao: string | null
          updated_at: string
          user_id: string | null
          valor: number
        }
        Insert: {
          ano: number
          canal?: string
          categoria: string
          created_at?: string
          formacao?: boolean
          id?: string
          mes: number
          observacao?: string | null
          updated_at?: string
          user_id?: string | null
          valor?: number
        }
        Update: {
          ano?: number
          canal?: string
          categoria?: string
          created_at?: string
          formacao?: boolean
          id?: string
          mes?: number
          observacao?: string | null
          updated_at?: string
          user_id?: string | null
          valor?: number
        }
        Relationships: []
      }
      arena_licitacoes: {
        Row: {
          created_at: string
          data_empenho: string | null
          data_habilitacao: string | null
          data_homologacao: string | null
          data_identificacao: string | null
          data_pregao: string | null
          id: string
          modalidade: string | null
          numero: string | null
          objeto: string
          observacao: string | null
          orgao: string
          situacao: string
          updated_at: string
          user_id: string | null
          valor_empenhado: number
          valor_estimado: number
          valor_homologado: number
          valor_proposto: number
          valor_recebido: number
        }
        Insert: {
          created_at?: string
          data_empenho?: string | null
          data_habilitacao?: string | null
          data_homologacao?: string | null
          data_identificacao?: string | null
          data_pregao?: string | null
          id?: string
          modalidade?: string | null
          numero?: string | null
          objeto?: string
          observacao?: string | null
          orgao: string
          situacao?: string
          updated_at?: string
          user_id?: string | null
          valor_empenhado?: number
          valor_estimado?: number
          valor_homologado?: number
          valor_proposto?: number
          valor_recebido?: number
        }
        Update: {
          created_at?: string
          data_empenho?: string | null
          data_habilitacao?: string | null
          data_homologacao?: string | null
          data_identificacao?: string | null
          data_pregao?: string | null
          id?: string
          modalidade?: string | null
          numero?: string | null
          objeto?: string
          observacao?: string | null
          orgao?: string
          situacao?: string
          updated_at?: string
          user_id?: string | null
          valor_empenhado?: number
          valor_estimado?: number
          valor_homologado?: number
          valor_proposto?: number
          valor_recebido?: number
        }
        Relationships: []
      }
      arena_participacao: {
        Row: {
          carencia_inicio: string | null
          carencia_meses: number
          created_at: string
          fase_rampa: number
          observacao: string | null
          participa_arena: boolean
          tipo_comercial: Database["public"]["Enums"]["arena_tipo_comercial"]
          updated_at: string
          user_id: string
        }
        Insert: {
          carencia_inicio?: string | null
          carencia_meses?: number
          created_at?: string
          fase_rampa?: number
          observacao?: string | null
          participa_arena?: boolean
          tipo_comercial?: Database["public"]["Enums"]["arena_tipo_comercial"]
          updated_at?: string
          user_id: string
        }
        Update: {
          carencia_inicio?: string | null
          carencia_meses?: number
          created_at?: string
          fase_rampa?: number
          observacao?: string | null
          participa_arena?: boolean
          tipo_comercial?: Database["public"]["Enums"]["arena_tipo_comercial"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      arena_receita_mensal: {
        Row: {
          ano: number
          canal: string
          created_at: string
          id: string
          mes: number
          observacao: string | null
          updated_at: string
          user_id: string | null
          valor_faturado: number
          valor_recebido: number
        }
        Insert: {
          ano: number
          canal?: string
          created_at?: string
          id?: string
          mes: number
          observacao?: string | null
          updated_at?: string
          user_id?: string | null
          valor_faturado?: number
          valor_recebido?: number
        }
        Update: {
          ano?: number
          canal?: string
          created_at?: string
          id?: string
          mes?: number
          observacao?: string | null
          updated_at?: string
          user_id?: string | null
          valor_faturado?: number
          valor_recebido?: number
        }
        Relationships: []
      }
      assistente_redacao_uso: {
        Row: {
          conversa_id: string | null
          created_at: string
          id: string
          modo: string
          usuario_id: string
        }
        Insert: {
          conversa_id?: string | null
          created_at?: string
          id?: string
          modo: string
          usuario_id: string
        }
        Update: {
          conversa_id?: string | null
          created_at?: string
          id?: string
          modo?: string
          usuario_id?: string
        }
        Relationships: []
      }
      cadencia_excecoes: {
        Row: {
          ativo: boolean
          cliente_id: string | null
          created_at: string
          created_by: string | null
          dias: Json | null
          escalar_diretoria: boolean
          escopo: string
          familia: string | null
          id: string
          observacao: string | null
          stage: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          dias?: Json | null
          escalar_diretoria?: boolean
          escopo: string
          familia?: string | null
          id?: string
          observacao?: string | null
          stage: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          dias?: Json | null
          escalar_diretoria?: boolean
          escopo?: string
          familia?: string | null
          id?: string
          observacao?: string | null
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cadencia_excecoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      cargos: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          ordem: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          ordem?: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
      clientes: {
        Row: {
          aceite_desconto_duplicata: boolean
          ativo: boolean
          atualizado_em: string
          bairro: string | null
          cep: string | null
          cidade: string | null
          cnpj: string | null
          complemento: string | null
          condicao_pagamento_padrao_id: string | null
          contato: string | null
          cpf: string | null
          criado_em: string
          criado_por: string | null
          email: string | null
          email_nf: string | null
          empresa_padrao: string | null
          endereco: string | null
          estado: string | null
          id: string
          ie_isento: boolean
          inscricao_estadual: string | null
          nome_fantasia: string | null
          numero: string | null
          observacao: string | null
          razao_social: string
          recorrente_manual: boolean
          regras_faturamento: string | null
          simples_optante: boolean | null
          suframa_isento: boolean | null
          suframa_numero: string | null
          telefone: string | null
          telefone2: string | null
          tipo_pessoa: string
          vendedor_id: string | null
          website: string | null
        }
        Insert: {
          aceite_desconto_duplicata?: boolean
          ativo?: boolean
          atualizado_em?: string
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          complemento?: string | null
          condicao_pagamento_padrao_id?: string | null
          contato?: string | null
          cpf?: string | null
          criado_em?: string
          criado_por?: string | null
          email?: string | null
          email_nf?: string | null
          empresa_padrao?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          ie_isento?: boolean
          inscricao_estadual?: string | null
          nome_fantasia?: string | null
          numero?: string | null
          observacao?: string | null
          razao_social: string
          recorrente_manual?: boolean
          regras_faturamento?: string | null
          simples_optante?: boolean | null
          suframa_isento?: boolean | null
          suframa_numero?: string | null
          telefone?: string | null
          telefone2?: string | null
          tipo_pessoa?: string
          vendedor_id?: string | null
          website?: string | null
        }
        Update: {
          aceite_desconto_duplicata?: boolean
          ativo?: boolean
          atualizado_em?: string
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          complemento?: string | null
          condicao_pagamento_padrao_id?: string | null
          contato?: string | null
          cpf?: string | null
          criado_em?: string
          criado_por?: string | null
          email?: string | null
          email_nf?: string | null
          empresa_padrao?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          ie_isento?: boolean
          inscricao_estadual?: string | null
          nome_fantasia?: string | null
          numero?: string | null
          observacao?: string | null
          razao_social?: string
          recorrente_manual?: boolean
          regras_faturamento?: string | null
          simples_optante?: boolean | null
          suframa_isento?: boolean | null
          suframa_numero?: string | null
          telefone?: string | null
          telefone2?: string | null
          tipo_pessoa?: string
          vendedor_id?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_condicao_pagamento_padrao_id_fkey"
            columns: ["condicao_pagamento_padrao_id"]
            isOneToOne: false
            referencedRelation: "condicoes_pagamento"
            referencedColumns: ["id"]
          },
        ]
      }
      condicoes_pagamento: {
        Row: {
          acrescimo_percent: number
          active: boolean
          created_at: string
          id: string
          label: string
          method: string
          notes: string | null
          ordem: number
          parcelas: Json
          permite_pf: boolean
          splits: Json
          updated_at: string
        }
        Insert: {
          acrescimo_percent?: number
          active?: boolean
          created_at?: string
          id: string
          label: string
          method: string
          notes?: string | null
          ordem?: number
          parcelas?: Json
          permite_pf?: boolean
          splits?: Json
          updated_at?: string
        }
        Update: {
          acrescimo_percent?: number
          active?: boolean
          created_at?: string
          id?: string
          label?: string
          method?: string
          notes?: string | null
          ordem?: number
          parcelas?: Json
          permite_pf?: boolean
          splits?: Json
          updated_at?: string
        }
        Relationships: []
      }
      contatos: {
        Row: {
          ativo: boolean
          atualizado_em: string
          cargo: string | null
          cliente_id: string | null
          criado_em: string
          criado_por: string | null
          email: string | null
          id: string
          lead_id: string | null
          nome: string
          observacao: string | null
          papel: string
          telefone: string | null
          telefone2: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          cargo?: string | null
          cliente_id?: string | null
          criado_em?: string
          criado_por?: string | null
          email?: string | null
          id?: string
          lead_id?: string | null
          nome: string
          observacao?: string | null
          papel: string
          telefone?: string | null
          telefone2?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          cargo?: string | null
          cliente_id?: string | null
          criado_em?: string
          criado_por?: string | null
          email?: string | null
          id?: string
          lead_id?: string | null
          nome?: string
          observacao?: string | null
          papel?: string
          telefone?: string | null
          telefone2?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contatos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contatos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos: {
        Row: {
          categoria: string
          categoria_outro: string | null
          content_type: string | null
          entidade_id: string
          entidade_tipo: string
          enviado_em: string
          enviado_por: string | null
          expira_em: string | null
          id: string
          nome_arquivo: string
          removido_em: string | null
          removido_por: string | null
          storage_path: string
          tamanho_bytes: number | null
        }
        Insert: {
          categoria: string
          categoria_outro?: string | null
          content_type?: string | null
          entidade_id: string
          entidade_tipo: string
          enviado_em?: string
          enviado_por?: string | null
          expira_em?: string | null
          id?: string
          nome_arquivo: string
          removido_em?: string | null
          removido_por?: string | null
          storage_path: string
          tamanho_bytes?: number | null
        }
        Update: {
          categoria?: string
          categoria_outro?: string | null
          content_type?: string | null
          entidade_id?: string
          entidade_tipo?: string
          enviado_em?: string
          enviado_por?: string | null
          expira_em?: string | null
          id?: string
          nome_arquivo?: string
          removido_em?: string | null
          removido_por?: string | null
          storage_path?: string
          tamanho_bytes?: number | null
        }
        Relationships: []
      }
      emitters: {
        Row: {
          address: string | null
          agencia: string | null
          banco: string | null
          brand: string
          cnpj: string
          conta: string | null
          created_at: string
          email: string | null
          id: string
          ie: string | null
          is_default: boolean
          legal_name: string
          phone: string | null
          pix: string | null
          tagline: string | null
          updated_at: string
          website: string | null
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          agencia?: string | null
          banco?: string | null
          brand: string
          cnpj: string
          conta?: string | null
          created_at?: string
          email?: string | null
          id: string
          ie?: string | null
          is_default?: boolean
          legal_name: string
          phone?: string | null
          pix?: string | null
          tagline?: string | null
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          agencia?: string | null
          banco?: string | null
          brand?: string
          cnpj?: string
          conta?: string | null
          created_at?: string
          email?: string | null
          id?: string
          ie?: string | null
          is_default?: boolean
          legal_name?: string
          phone?: string | null
          pix?: string | null
          tagline?: string | null
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      falhas_sistema: {
        Row: {
          contexto: Json | null
          id: string
          mensagem: string
          ocorrencias: number
          ocorrido_em: string
          origem: string
          resolvido_em: string | null
          resolvido_por: string | null
        }
        Insert: {
          contexto?: Json | null
          id?: string
          mensagem: string
          ocorrencias?: number
          ocorrido_em?: string
          origem: string
          resolvido_em?: string | null
          resolvido_por?: string | null
        }
        Update: {
          contexto?: Json | null
          id?: string
          mensagem?: string
          ocorrencias?: number
          ocorrido_em?: string
          origem?: string
          resolvido_em?: string | null
          resolvido_por?: string | null
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
      ia_respostas_pendentes: {
        Row: {
          conversa_id: string
          created_at: string
          enviado_em: string | null
          erro: string | null
          id: string
          mensagem: string
          responder_apos: string
          status: string
          updated_at: string
        }
        Insert: {
          conversa_id: string
          created_at?: string
          enviado_em?: string | null
          erro?: string | null
          id?: string
          mensagem: string
          responder_apos?: string
          status?: string
          updated_at?: string
        }
        Update: {
          conversa_id?: string
          created_at?: string
          enviado_em?: string | null
          erro?: string | null
          id?: string
          mensagem?: string
          responder_apos?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ia_respostas_pendentes_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversas"
            referencedColumns: ["id"]
          },
        ]
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
      lead_itens: {
        Row: {
          codigo_produto: number
          created_at: string
          desconto_percentual: number | null
          desconto_valor: number | null
          descricao: string
          id: string
          lead_id: string
          quantidade: number
          unidade: string | null
          valor_total: number | null
          valor_unitario: number
        }
        Insert: {
          codigo_produto: number
          created_at?: string
          desconto_percentual?: number | null
          desconto_valor?: number | null
          descricao: string
          id?: string
          lead_id: string
          quantidade: number
          unidade?: string | null
          valor_total?: number | null
          valor_unitario: number
        }
        Update: {
          codigo_produto?: number
          created_at?: string
          desconto_percentual?: number | null
          desconto_valor?: number | null
          descricao?: string
          id?: string
          lead_id?: string
          quantidade?: number
          unidade?: string | null
          valor_total?: number | null
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "lead_itens_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_owner_history: {
        Row: {
          contexto: Json | null
          criado_em: string
          id: string
          lead_id: string
          origem: string
          owner_anterior: string | null
          owner_novo: string | null
        }
        Insert: {
          contexto?: Json | null
          criado_em?: string
          id?: string
          lead_id: string
          origem: string
          owner_anterior?: string | null
          owner_novo?: string | null
        }
        Update: {
          contexto?: Json | null
          criado_em?: string
          id?: string
          lead_id?: string
          origem?: string
          owner_anterior?: string | null
          owner_novo?: string | null
        }
        Relationships: []
      }
      lead_stage_history: {
        Row: {
          contexto: Json | null
          criado_em: string
          etapa_anterior: string | null
          etapa_nova: string | null
          id: string
          lead_id: string
          origem: string
        }
        Insert: {
          contexto?: Json | null
          criado_em?: string
          etapa_anterior?: string | null
          etapa_nova?: string | null
          id?: string
          lead_id: string
          origem: string
        }
        Update: {
          contexto?: Json | null
          criado_em?: string
          etapa_anterior?: string | null
          etapa_nova?: string | null
          id?: string
          lead_id?: string
          origem?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          bairro: string | null
          capital_social: number | null
          cep: string | null
          cidade: string | null
          cliente_id: string | null
          cnae_principal: string | null
          cnpj: string | null
          codigo_parcela: string | null
          company: string
          complemento: string | null
          contact_name: string
          created_at: string
          data_abertura: string | null
          data_previsao_entrega: string | null
          decisor_cargo: string | null
          decisor_nome: string | null
          desconto_pedido: number | null
          email: string | null
          email_financeiro: string | null
          email_nf_xml: string | null
          empresa: string | null
          endereco: Json | null
          esfriando: boolean
          estado: string | null
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
          modalidade_frete: string | null
          motivo_perda: string | null
          motivo_perda_detalhe: string | null
          next_followup: string | null
          nome_fantasia: string | null
          notes: string
          num_funcionarios: number | null
          numero: string | null
          observacao_cliente: string | null
          observacoes_venda: string | null
          origem: string | null
          owner_id: string | null
          perdido_em: string | null
          phone: string | null
          porte: string | null
          product: string | null
          product_id: string | null
          proposta_enviada_at: string | null
          quantity: number
          razao_social: string | null
          reatribuido_abandono_em: string | null
          recontatar_em: string | null
          segment: string | null
          simples_optante: boolean | null
          site: string | null
          socios: Json | null
          source: string
          stage: Database["public"]["Enums"]["lead_stage"]
          suframa_isento: boolean | null
          suframa_numero: string | null
          tags: string[]
          telefone_fixo: string | null
          telefone_whatsapp: string | null
          telefone2: string | null
          ultima_msg_cliente_at: string | null
          ultima_msg_vendedor_at: string | null
          updated_at: string
          valor_frete: number | null
          whatsapp: string | null
        }
        Insert: {
          bairro?: string | null
          capital_social?: number | null
          cep?: string | null
          cidade?: string | null
          cliente_id?: string | null
          cnae_principal?: string | null
          cnpj?: string | null
          codigo_parcela?: string | null
          company: string
          complemento?: string | null
          contact_name?: string
          created_at?: string
          data_abertura?: string | null
          data_previsao_entrega?: string | null
          decisor_cargo?: string | null
          decisor_nome?: string | null
          desconto_pedido?: number | null
          email?: string | null
          email_financeiro?: string | null
          email_nf_xml?: string | null
          empresa?: string | null
          endereco?: Json | null
          esfriando?: boolean
          estado?: string | null
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
          modalidade_frete?: string | null
          motivo_perda?: string | null
          motivo_perda_detalhe?: string | null
          next_followup?: string | null
          nome_fantasia?: string | null
          notes?: string
          num_funcionarios?: number | null
          numero?: string | null
          observacao_cliente?: string | null
          observacoes_venda?: string | null
          origem?: string | null
          owner_id?: string | null
          perdido_em?: string | null
          phone?: string | null
          porte?: string | null
          product?: string | null
          product_id?: string | null
          proposta_enviada_at?: string | null
          quantity?: number
          razao_social?: string | null
          reatribuido_abandono_em?: string | null
          recontatar_em?: string | null
          segment?: string | null
          simples_optante?: boolean | null
          site?: string | null
          socios?: Json | null
          source?: string
          stage?: Database["public"]["Enums"]["lead_stage"]
          suframa_isento?: boolean | null
          suframa_numero?: string | null
          tags?: string[]
          telefone_fixo?: string | null
          telefone_whatsapp?: string | null
          telefone2?: string | null
          ultima_msg_cliente_at?: string | null
          ultima_msg_vendedor_at?: string | null
          updated_at?: string
          valor_frete?: number | null
          whatsapp?: string | null
        }
        Update: {
          bairro?: string | null
          capital_social?: number | null
          cep?: string | null
          cidade?: string | null
          cliente_id?: string | null
          cnae_principal?: string | null
          cnpj?: string | null
          codigo_parcela?: string | null
          company?: string
          complemento?: string | null
          contact_name?: string
          created_at?: string
          data_abertura?: string | null
          data_previsao_entrega?: string | null
          decisor_cargo?: string | null
          decisor_nome?: string | null
          desconto_pedido?: number | null
          email?: string | null
          email_financeiro?: string | null
          email_nf_xml?: string | null
          empresa?: string | null
          endereco?: Json | null
          esfriando?: boolean
          estado?: string | null
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
          modalidade_frete?: string | null
          motivo_perda?: string | null
          motivo_perda_detalhe?: string | null
          next_followup?: string | null
          nome_fantasia?: string | null
          notes?: string
          num_funcionarios?: number | null
          numero?: string | null
          observacao_cliente?: string | null
          observacoes_venda?: string | null
          origem?: string | null
          owner_id?: string | null
          perdido_em?: string | null
          phone?: string | null
          porte?: string | null
          product?: string | null
          product_id?: string | null
          proposta_enviada_at?: string | null
          quantity?: number
          razao_social?: string | null
          reatribuido_abandono_em?: string | null
          recontatar_em?: string | null
          segment?: string | null
          simples_optante?: boolean | null
          site?: string | null
          socios?: Json | null
          source?: string
          stage?: Database["public"]["Enums"]["lead_stage"]
          suframa_isento?: boolean | null
          suframa_numero?: string | null
          tags?: string[]
          telefone_fixo?: string | null
          telefone_whatsapp?: string | null
          telefone2?: string | null
          ultima_msg_cliente_at?: string | null
          ultima_msg_vendedor_at?: string | null
          updated_at?: string
          valor_frete?: number | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagem_templates: {
        Row: {
          ativo: boolean
          categoria: string
          corpo: string
          created_at: string
          criado_por: string | null
          id: string
          meta_categoria: string | null
          meta_enviado_em: string | null
          meta_erro: string | null
          meta_id: string | null
          meta_mapa: Json | null
          meta_nome: string | null
          meta_status: string | null
          meta_sugerido: boolean
          ordem: number
          titulo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria: string
          corpo: string
          created_at?: string
          criado_por?: string | null
          id?: string
          meta_categoria?: string | null
          meta_enviado_em?: string | null
          meta_erro?: string | null
          meta_id?: string | null
          meta_mapa?: Json | null
          meta_nome?: string | null
          meta_status?: string | null
          meta_sugerido?: boolean
          ordem?: number
          titulo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string
          corpo?: string
          created_at?: string
          criado_por?: string | null
          id?: string
          meta_categoria?: string | null
          meta_enviado_em?: string | null
          meta_erro?: string | null
          meta_id?: string | null
          meta_mapa?: Json | null
          meta_nome?: string | null
          meta_status?: string | null
          meta_sugerido?: boolean
          ordem?: number
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      n8n_reenvio_fila: {
        Row: {
          conversa_id: string | null
          created_at: string
          id: string
          max_tentativas: number
          payload: Json
          proxima_tentativa_em: string
          status: string
          tentativas: number
          ultimo_erro: string | null
          updated_at: string
        }
        Insert: {
          conversa_id?: string | null
          created_at?: string
          id?: string
          max_tentativas?: number
          payload: Json
          proxima_tentativa_em?: string
          status?: string
          tentativas?: number
          ultimo_erro?: string | null
          updated_at?: string
        }
        Update: {
          conversa_id?: string | null
          created_at?: string
          id?: string
          max_tentativas?: number
          payload?: Json
          proxima_tentativa_em?: string
          status?: string
          tentativas?: number
          ultimo_erro?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "n8n_reenvio_fila_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes: {
        Row: {
          aceito_em: string | null
          adiado_ate: string | null
          conversa_id: string | null
          created_at: string
          exige_aceite: boolean
          id: string
          lida_em: string | null
          pedido_id: string | null
          tipo: string
          titulo: string | null
          user_id: string
        }
        Insert: {
          aceito_em?: string | null
          adiado_ate?: string | null
          conversa_id?: string | null
          created_at?: string
          exige_aceite?: boolean
          id?: string
          lida_em?: string | null
          pedido_id?: string | null
          tipo: string
          titulo?: string | null
          user_id: string
        }
        Update: {
          aceito_em?: string | null
          adiado_ate?: string | null
          conversa_id?: string | null
          created_at?: string
          exige_aceite?: boolean
          id?: string
          lida_em?: string | null
          pedido_id?: string | null
          tipo?: string
          titulo?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_fiscal_history: {
        Row: {
          alterado_em: string
          alterado_por: string | null
          campo: string
          id: string
          pedido_id: string
          valor_anterior: string | null
          valor_novo: string | null
        }
        Insert: {
          alterado_em?: string
          alterado_por?: string | null
          campo: string
          id?: string
          pedido_id: string
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Update: {
          alterado_em?: string
          alterado_por?: string | null
          campo?: string
          id?: string
          pedido_id?: string
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedido_fiscal_history_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
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
      pedido_notificacoes: {
        Row: {
          classificacao: string
          criado_em: string
          criado_por: string | null
          destinatario_tipo: string
          destinatario_user_id: string | null
          enviado_em: string | null
          erro: string | null
          etapa_anterior: Database["public"]["Enums"]["pedido_stage"] | null
          evento_id: string
          id: string
          mensagem: string
          nova_etapa: Database["public"]["Enums"]["pedido_stage"]
          pedido_id: string
          status: string
          tentativas: number
        }
        Insert: {
          classificacao?: string
          criado_em?: string
          criado_por?: string | null
          destinatario_tipo?: string
          destinatario_user_id?: string | null
          enviado_em?: string | null
          erro?: string | null
          etapa_anterior?: Database["public"]["Enums"]["pedido_stage"] | null
          evento_id: string
          id?: string
          mensagem: string
          nova_etapa: Database["public"]["Enums"]["pedido_stage"]
          pedido_id: string
          status?: string
          tentativas?: number
        }
        Update: {
          classificacao?: string
          criado_em?: string
          criado_por?: string | null
          destinatario_tipo?: string
          destinatario_user_id?: string | null
          enviado_em?: string | null
          erro?: string | null
          etapa_anterior?: Database["public"]["Enums"]["pedido_stage"] | null
          evento_id?: string
          id?: string
          mensagem?: string
          nova_etapa?: Database["public"]["Enums"]["pedido_stage"]
          pedido_id?: string
          status?: string
          tentativas?: number
        }
        Relationships: [
          {
            foreignKeyName: "pedido_notificacoes_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_ocorrencias: {
        Row: {
          created_at: string
          criada_por: string | null
          descricao: string
          id: string
          pedido_id: string
          resolucao_nota: string | null
          resolvida: boolean
          resolvida_em: string | null
          resolvida_por: string | null
          severidade: string
          stage_no_momento: Database["public"]["Enums"]["pedido_stage"] | null
          tipo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          criada_por?: string | null
          descricao: string
          id?: string
          pedido_id: string
          resolucao_nota?: string | null
          resolvida?: boolean
          resolvida_em?: string | null
          resolvida_por?: string | null
          severidade?: string
          stage_no_momento?: Database["public"]["Enums"]["pedido_stage"] | null
          tipo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          criada_por?: string | null
          descricao?: string
          id?: string
          pedido_id?: string
          resolucao_nota?: string | null
          resolvida?: boolean
          resolvida_em?: string | null
          resolvida_por?: string | null
          severidade?: string
          stage_no_momento?: Database["public"]["Enums"]["pedido_stage"] | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_ocorrencias_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_romaneios: {
        Row: {
          concluido_em: string | null
          concluido_por: string | null
          gerado_em: string
          gerado_por: string | null
          id: string
          itens: Json
          itens_conferidos: Json
          pedido_id: string
          tipo: string
        }
        Insert: {
          concluido_em?: string | null
          concluido_por?: string | null
          gerado_em?: string
          gerado_por?: string | null
          id?: string
          itens?: Json
          itens_conferidos?: Json
          pedido_id: string
          tipo: string
        }
        Update: {
          concluido_em?: string | null
          concluido_por?: string | null
          gerado_em?: string
          gerado_por?: string | null
          id?: string
          itens?: Json
          itens_conferidos?: Json
          pedido_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_romaneios_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_stage_history: {
        Row: {
          created_at: string
          from_stage: Database["public"]["Enums"]["pedido_stage"] | null
          id: string
          is_backward: boolean
          motivo: string | null
          moved_by: string | null
          pedido_id: string
          to_stage: Database["public"]["Enums"]["pedido_stage"]
        }
        Insert: {
          created_at?: string
          from_stage?: Database["public"]["Enums"]["pedido_stage"] | null
          id?: string
          is_backward?: boolean
          motivo?: string | null
          moved_by?: string | null
          pedido_id: string
          to_stage: Database["public"]["Enums"]["pedido_stage"]
        }
        Update: {
          created_at?: string
          from_stage?: Database["public"]["Enums"]["pedido_stage"] | null
          id?: string
          is_backward?: boolean
          motivo?: string | null
          moved_by?: string | null
          pedido_id?: string
          to_stage?: Database["public"]["Enums"]["pedido_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "pedido_stage_history_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          aprovacao_decidida_em: string | null
          aprovacao_decidida_por: string | null
          aprovacao_decisao: string | null
          aprovacao_motivo: string | null
          aprovacao_observacao: string | null
          aprovacao_rota: string | null
          aprovacao_solicitada_em: string | null
          aprovacao_solicitada_por: string | null
          checklist_atualizado_em: string | null
          checklist_atualizado_por: string | null
          checklist_conferencia: Json
          created_at: string
          despachado_em: string | null
          encerrado_em: string | null
          entrega_confirmada: string | null
          entrega_recebida_por: string | null
          entregue_em: string | null
          equipe_responsavel: string | null
          fiscal_status: string | null
          forma_atendimento: string | null
          id: string
          lead_id: string | null
          metadata: Json
          modalidade_entrega: string
          motorista: string | null
          nf_chave: string | null
          nf_emitida_em: string | null
          nf_numero: string | null
          nf_pdf_url: string | null
          nf_serie: string | null
          nf_valor: number | null
          nf_xml_url: string | null
          number: string
          ocorrencia: string | null
          owner_id: string
          placa: string | null
          pos_venda_status: string | null
          previsao_entrega: string | null
          prioridade: string | null
          proposta_id: string | null
          proposta_snapshot: Json | null
          reprovacao_motivo: string | null
          responsavel_atual_id: string | null
          stage: Database["public"]["Enums"]["pedido_stage"]
          status: string
          total: number
          transportadora: string | null
          updated_at: string
          vendedor_proprietario_id: string | null
        }
        Insert: {
          aprovacao_decidida_em?: string | null
          aprovacao_decidida_por?: string | null
          aprovacao_decisao?: string | null
          aprovacao_motivo?: string | null
          aprovacao_observacao?: string | null
          aprovacao_rota?: string | null
          aprovacao_solicitada_em?: string | null
          aprovacao_solicitada_por?: string | null
          checklist_atualizado_em?: string | null
          checklist_atualizado_por?: string | null
          checklist_conferencia?: Json
          created_at?: string
          despachado_em?: string | null
          encerrado_em?: string | null
          entrega_confirmada?: string | null
          entrega_recebida_por?: string | null
          entregue_em?: string | null
          equipe_responsavel?: string | null
          fiscal_status?: string | null
          forma_atendimento?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json
          modalidade_entrega?: string
          motorista?: string | null
          nf_chave?: string | null
          nf_emitida_em?: string | null
          nf_numero?: string | null
          nf_pdf_url?: string | null
          nf_serie?: string | null
          nf_valor?: number | null
          nf_xml_url?: string | null
          number: string
          ocorrencia?: string | null
          owner_id: string
          placa?: string | null
          pos_venda_status?: string | null
          previsao_entrega?: string | null
          prioridade?: string | null
          proposta_id?: string | null
          proposta_snapshot?: Json | null
          reprovacao_motivo?: string | null
          responsavel_atual_id?: string | null
          stage?: Database["public"]["Enums"]["pedido_stage"]
          status?: string
          total?: number
          transportadora?: string | null
          updated_at?: string
          vendedor_proprietario_id?: string | null
        }
        Update: {
          aprovacao_decidida_em?: string | null
          aprovacao_decidida_por?: string | null
          aprovacao_decisao?: string | null
          aprovacao_motivo?: string | null
          aprovacao_observacao?: string | null
          aprovacao_rota?: string | null
          aprovacao_solicitada_em?: string | null
          aprovacao_solicitada_por?: string | null
          checklist_atualizado_em?: string | null
          checklist_atualizado_por?: string | null
          checklist_conferencia?: Json
          created_at?: string
          despachado_em?: string | null
          encerrado_em?: string | null
          entrega_confirmada?: string | null
          entrega_recebida_por?: string | null
          entregue_em?: string | null
          equipe_responsavel?: string | null
          fiscal_status?: string | null
          forma_atendimento?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json
          modalidade_entrega?: string
          motorista?: string | null
          nf_chave?: string | null
          nf_emitida_em?: string | null
          nf_numero?: string | null
          nf_pdf_url?: string | null
          nf_serie?: string | null
          nf_valor?: number | null
          nf_xml_url?: string | null
          number?: string
          ocorrencia?: string | null
          owner_id?: string
          placa?: string | null
          pos_venda_status?: string | null
          previsao_entrega?: string | null
          prioridade?: string | null
          proposta_id?: string | null
          proposta_snapshot?: Json | null
          reprovacao_motivo?: string | null
          responsavel_atual_id?: string | null
          stage?: Database["public"]["Enums"]["pedido_stage"]
          status?: string
          total?: number
          transportadora?: string | null
          updated_at?: string
          vendedor_proprietario_id?: string | null
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
      perfil_permissoes: {
        Row: {
          perfil_id: string
          permissao_chave: string
          valor_numerico: number | null
        }
        Insert: {
          perfil_id: string
          permissao_chave: string
          valor_numerico?: number | null
        }
        Update: {
          perfil_id?: string
          permissao_chave?: string
          valor_numerico?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "perfil_permissoes_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfil_permissoes_permissao_chave_fkey"
            columns: ["permissao_chave"]
            isOneToOne: false
            referencedRelation: "permissoes"
            referencedColumns: ["chave"]
          },
        ]
      }
      perfis: {
        Row: {
          ativo: boolean
          base_role: Database["public"]["Enums"]["app_role"]
          created_at: string
          descricao: string | null
          id: string
          nome: string
          papel: string
        }
        Insert: {
          ativo?: boolean
          base_role: Database["public"]["Enums"]["app_role"]
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          papel: string
        }
        Update: {
          ativo?: boolean
          base_role?: Database["public"]["Enums"]["app_role"]
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          papel?: string
        }
        Relationships: []
      }
      permissoes: {
        Row: {
          chave: string
          descricao: string | null
          grupo: string
          rotulo: string
          tipo: string
        }
        Insert: {
          chave: string
          descricao?: string | null
          grupo: string
          rotulo: string
          tipo?: string
        }
        Update: {
          chave?: string
          descricao?: string | null
          grupo?: string
          rotulo?: string
          tipo?: string
        }
        Relationships: []
      }
      produtos: {
        Row: {
          active: boolean
          created_at: string
          default_price: number
          description: string
          estoque_atual: number
          family: string | null
          height_cm: number
          id: string
          length_cm: number
          name: string
          ncm: string | null
          pecas_por_coluna: number
          sku: string
          stack_height_cm: number | null
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
          estoque_atual?: number
          family?: string | null
          height_cm?: number
          id?: string
          length_cm?: number
          name: string
          ncm?: string | null
          pecas_por_coluna?: number
          sku: string
          stack_height_cm?: number | null
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
          estoque_atual?: number
          family?: string | null
          height_cm?: number
          id?: string
          length_cm?: number
          name?: string
          ncm?: string | null
          pecas_por_coluna?: number
          sku?: string
          stack_height_cm?: number | null
          unit?: string
          updated_at?: string
          weight_kg?: number
          width_cm?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ativo: boolean
          avatar_color: string
          canais_entrada: string[]
          cargo: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          email_cache: string | null
          fuso_horario: string
          id: string
          limite_leads_simultaneos: number | null
          name: string
          senha_reset_exigido: boolean
          telefone_whatsapp: string | null
          telegram_chat_id: string | null
          telegram_vinculo_codigo: string | null
          ultimo_acesso_em: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          avatar_color?: string
          canais_entrada?: string[]
          cargo?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          email_cache?: string | null
          fuso_horario?: string
          id: string
          limite_leads_simultaneos?: number | null
          name?: string
          senha_reset_exigido?: boolean
          telefone_whatsapp?: string | null
          telegram_chat_id?: string | null
          telegram_vinculo_codigo?: string | null
          ultimo_acesso_em?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          avatar_color?: string
          canais_entrada?: string[]
          cargo?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          email_cache?: string | null
          fuso_horario?: string
          id?: string
          limite_leads_simultaneos?: number | null
          name?: string
          senha_reset_exigido?: boolean
          telefone_whatsapp?: string | null
          telegram_chat_id?: string | null
          telegram_vinculo_codigo?: string | null
          ultimo_acesso_em?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      proposta_itens: {
        Row: {
          codigo_produto: number | null
          description: string
          id: string
          ncm: string | null
          position: number
          product_id: string | null
          proposta_id: string
          quantity: number
          sku: string
          unit: string
          unit_price: number
        }
        Insert: {
          codigo_produto?: number | null
          description: string
          id?: string
          ncm?: string | null
          position?: number
          product_id?: string | null
          proposta_id: string
          quantity?: number
          sku: string
          unit?: string
          unit_price?: number
        }
        Update: {
          codigo_produto?: number | null
          description?: string
          id?: string
          ncm?: string | null
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
          due_date: string | null
          id: string
          notes: string
          percentual: number | null
          position: number
          proposta_id: string
        }
        Insert: {
          amount?: number
          days?: number
          due_date?: string | null
          id?: string
          notes?: string
          percentual?: number | null
          position?: number
          proposta_id: string
        }
        Update: {
          amount?: number
          days?: number
          due_date?: string | null
          id?: string
          notes?: string
          percentual?: number | null
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
          aprovacao_cliente_detalhe: string | null
          aprovacao_cliente_meio: string | null
          conferencia_confirmada_em: string | null
          conferencia_confirmada_por_user_id: string | null
          created_at: string
          discount_percent: number
          edit_request_reason: string | null
          edit_requested_at: string | null
          edit_requested_by_user_id: string | null
          edit_unlocked_at: string | null
          edit_unlocked_by_user_id: string | null
          em_negociacao: boolean
          emitter_id: string
          expected_delivery_date: string | null
          forma_pagamento: string | null
          id: string
          lead_id: string
          number: string
          numero_pedido_cliente: string | null
          observacoes_pedido: string | null
          observations: string
          order_created_at: string | null
          owner_id: string
          payment_term_id: string | null
          previsao_faturamento: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["proposal_status"]
          transport: Json
          tratativa_comercial: string | null
          updated_at: string
          validity_days: number
        }
        Insert: {
          approval_reason?: string | null
          approval_requested_at?: string | null
          approved_at?: string | null
          approved_by_user_id?: string | null
          aprovacao_cliente_detalhe?: string | null
          aprovacao_cliente_meio?: string | null
          conferencia_confirmada_em?: string | null
          conferencia_confirmada_por_user_id?: string | null
          created_at?: string
          discount_percent?: number
          edit_request_reason?: string | null
          edit_requested_at?: string | null
          edit_requested_by_user_id?: string | null
          edit_unlocked_at?: string | null
          edit_unlocked_by_user_id?: string | null
          em_negociacao?: boolean
          emitter_id: string
          expected_delivery_date?: string | null
          forma_pagamento?: string | null
          id?: string
          lead_id: string
          number: string
          numero_pedido_cliente?: string | null
          observacoes_pedido?: string | null
          observations?: string
          order_created_at?: string | null
          owner_id: string
          payment_term_id?: string | null
          previsao_faturamento?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          transport?: Json
          tratativa_comercial?: string | null
          updated_at?: string
          validity_days?: number
        }
        Update: {
          approval_reason?: string | null
          approval_requested_at?: string | null
          approved_at?: string | null
          approved_by_user_id?: string | null
          aprovacao_cliente_detalhe?: string | null
          aprovacao_cliente_meio?: string | null
          conferencia_confirmada_em?: string | null
          conferencia_confirmada_por_user_id?: string | null
          created_at?: string
          discount_percent?: number
          edit_request_reason?: string | null
          edit_requested_at?: string | null
          edit_requested_by_user_id?: string | null
          edit_unlocked_at?: string | null
          edit_unlocked_by_user_id?: string | null
          em_negociacao?: boolean
          emitter_id?: string
          expected_delivery_date?: string | null
          forma_pagamento?: string | null
          id?: string
          lead_id?: string
          number?: string
          numero_pedido_cliente?: string | null
          observacoes_pedido?: string | null
          observations?: string
          order_created_at?: string | null
          owner_id?: string
          payment_term_id?: string | null
          previsao_faturamento?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          transport?: Json
          tratativa_comercial?: string | null
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
          pedido_id: string | null
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
          pedido_id?: string | null
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
          pedido_id?: string | null
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
          {
            foreignKeyName: "tarefas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      transportadoras: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_audit_log: {
        Row: {
          alvo_user_id: string
          ator_user_id: string | null
          campo: string
          criado_em: string
          id: string
          valor_anterior: string | null
          valor_novo: string | null
        }
        Insert: {
          alvo_user_id: string
          ator_user_id?: string | null
          campo: string
          criado_em?: string
          id?: string
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Update: {
          alvo_user_id?: string
          ator_user_id?: string | null
          campo?: string
          criado_em?: string
          id?: string
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Relationships: []
      }
      user_perfis: {
        Row: {
          created_at: string
          perfil_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          perfil_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          perfil_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_perfis_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          configurar_integracoes: boolean
          created_at: string
          editar_propostas: boolean
          excluir_propostas: boolean
          exportar_dados: boolean
          gerenciar_usuarios: boolean
          updated_at: string
          user_id: string
          ver_relatorios: boolean
          ver_todos_leads: boolean
        }
        Insert: {
          configurar_integracoes?: boolean
          created_at?: string
          editar_propostas?: boolean
          excluir_propostas?: boolean
          exportar_dados?: boolean
          gerenciar_usuarios?: boolean
          updated_at?: string
          user_id: string
          ver_relatorios?: boolean
          ver_todos_leads?: boolean
        }
        Update: {
          configurar_integracoes?: boolean
          created_at?: string
          editar_propostas?: boolean
          excluir_propostas?: boolean
          exportar_dados?: boolean
          gerenciar_usuarios?: boolean
          updated_at?: string
          user_id?: string
          ver_relatorios?: boolean
          ver_todos_leads?: boolean
        }
        Relationships: []
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
      wa_cloud_eventos: {
        Row: {
          erro: string | null
          id: number
          payload: Json | null
          phone: string | null
          processado: boolean
          recebido_em: string
          tipo: string | null
          wa_message_id: string | null
        }
        Insert: {
          erro?: string | null
          id?: number
          payload?: Json | null
          phone?: string | null
          processado?: boolean
          recebido_em?: string
          tipo?: string | null
          wa_message_id?: string | null
        }
        Update: {
          erro?: string | null
          id?: number
          payload?: Json | null
          phone?: string | null
          processado?: boolean
          recebido_em?: string
          tipo?: string | null
          wa_message_id?: string | null
        }
        Relationships: []
      }
      whatsapp_conversas: {
        Row: {
          atribuido_em: string | null
          atribuido_para: string | null
          created_at: string
          em_espera_desde: string | null
          em_espera_por: string | null
          espera_alertada_em: string | null
          handoff_alertado_em: string | null
          handoff_realertado_em: string | null
          ia_ativa: boolean
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          lead_id: string | null
          motivo_handoff: string | null
          name: string | null
          phone: string
          requer_humano: boolean
          status: Database["public"]["Enums"]["conversa_status"]
          updated_at: string
        }
        Insert: {
          atribuido_em?: string | null
          atribuido_para?: string | null
          created_at?: string
          em_espera_desde?: string | null
          em_espera_por?: string | null
          espera_alertada_em?: string | null
          handoff_alertado_em?: string | null
          handoff_realertado_em?: string | null
          ia_ativa?: boolean
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          lead_id?: string | null
          motivo_handoff?: string | null
          name?: string | null
          phone: string
          requer_humano?: boolean
          status?: Database["public"]["Enums"]["conversa_status"]
          updated_at?: string
        }
        Update: {
          atribuido_em?: string | null
          atribuido_para?: string | null
          created_at?: string
          em_espera_desde?: string | null
          em_espera_por?: string | null
          espera_alertada_em?: string | null
          handoff_alertado_em?: string | null
          handoff_realertado_em?: string | null
          ia_ativa?: boolean
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          lead_id?: string | null
          motivo_handoff?: string | null
          name?: string | null
          phone?: string
          requer_humano?: boolean
          status?: Database["public"]["Enums"]["conversa_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversas_em_espera_por_fkey"
            columns: ["em_espera_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
          midia: Json | null
          tipo: string
          usuario_id: string | null
        }
        Insert: {
          autor: Database["public"]["Enums"]["msg_autor"]
          conteudo: string
          conversa_id: string
          created_at?: string
          direcao: Database["public"]["Enums"]["msg_direcao"]
          external_id?: string | null
          id?: string
          midia?: Json | null
          tipo?: string
          usuario_id?: string | null
        }
        Update: {
          autor?: Database["public"]["Enums"]["msg_autor"]
          conteudo?: string
          conversa_id?: string
          created_at?: string
          direcao?: Database["public"]["Enums"]["msg_direcao"]
          external_id?: string | null
          id?: string
          midia?: Json | null
          tipo?: string
          usuario_id?: string | null
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
      whatsapp_optout: {
        Row: {
          created_at: string
          motivo: string | null
          phone: string
        }
        Insert: {
          created_at?: string
          motivo?: string | null
          phone: string
        }
        Update: {
          created_at?: string
          motivo?: string | null
          phone?: string
        }
        Relationships: []
      }
      xerife_config: {
        Row: {
          ativo: boolean
          auto_atribuir_lead_orfao: boolean
          cadencia_abandono_dias: number[]
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
          reatribuir_lead_abandonado: boolean
          reciclagem_perdidos_dias: number
          resumo_diario_ativo: boolean
          resumo_hora: string
          sla_lead_orfao_min: number
          sla_primeiro_contato_escalar_min: number
          sla_primeiro_contato_min: number
          sla_resposta_whatsapp_escalar_horas: number
          sla_resposta_whatsapp_horas: number
          tarefa_atrasada_horas: number
          telegram_ativo: boolean
          updated_at: string
          watchdog_conversa_ativo: boolean
          watchdog_conversa_fria_min: number
          watchdog_conversa_ia_min: number
          whatsapp_interno_ativo: boolean
        }
        Insert: {
          ativo?: boolean
          auto_atribuir_lead_orfao?: boolean
          cadencia_abandono_dias?: number[]
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
          reatribuir_lead_abandonado?: boolean
          reciclagem_perdidos_dias?: number
          resumo_diario_ativo?: boolean
          resumo_hora?: string
          sla_lead_orfao_min?: number
          sla_primeiro_contato_escalar_min?: number
          sla_primeiro_contato_min?: number
          sla_resposta_whatsapp_escalar_horas?: number
          sla_resposta_whatsapp_horas?: number
          tarefa_atrasada_horas?: number
          telegram_ativo?: boolean
          updated_at?: string
          watchdog_conversa_ativo?: boolean
          watchdog_conversa_fria_min?: number
          watchdog_conversa_ia_min?: number
          whatsapp_interno_ativo?: boolean
        }
        Update: {
          ativo?: boolean
          auto_atribuir_lead_orfao?: boolean
          cadencia_abandono_dias?: number[]
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
          reatribuir_lead_abandonado?: boolean
          reciclagem_perdidos_dias?: number
          resumo_diario_ativo?: boolean
          resumo_hora?: string
          sla_lead_orfao_min?: number
          sla_primeiro_contato_escalar_min?: number
          sla_primeiro_contato_min?: number
          sla_resposta_whatsapp_escalar_horas?: number
          sla_resposta_whatsapp_horas?: number
          tarefa_atrasada_horas?: number
          telegram_ativo?: boolean
          updated_at?: string
          watchdog_conversa_ativo?: boolean
          watchdog_conversa_fria_min?: number
          watchdog_conversa_ia_min?: number
          whatsapp_interno_ativo?: boolean
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
      zapi_alertas: {
        Row: {
          canal: string
          created_at: string
          detalhe: string | null
          id: string
          tipo: string
        }
        Insert: {
          canal: string
          created_at?: string
          detalhe?: string | null
          id?: string
          tipo: string
        }
        Update: {
          canal?: string
          created_at?: string
          detalhe?: string | null
          id?: string
          tipo?: string
        }
        Relationships: []
      }
      zapi_envios: {
        Row: {
          canal: string
          created_at: string
          ctx: string | null
          id: string
          mensagem_hash: string | null
          phone: string
        }
        Insert: {
          canal: string
          created_at?: string
          ctx?: string | null
          id?: string
          mensagem_hash?: string | null
          phone: string
        }
        Update: {
          canal?: string
          created_at?: string
          ctx?: string | null
          id?: string
          mensagem_hash?: string | null
          phone?: string
        }
        Relationships: []
      }
      zapi_estado: {
        Row: {
          chave: string
          updated_at: string
          valor: Json
        }
        Insert: {
          chave: string
          updated_at?: string
          valor?: Json
        }
        Update: {
          chave?: string
          updated_at?: string
          valor?: Json
        }
        Relationships: []
      }
      zapi_eventos: {
        Row: {
          created_at: string
          id: string
          payload: Json
          telefone_mascarado: string | null
          tipo: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          telefone_mascarado?: string | null
          tipo: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          telefone_mascarado?: string | null
          tipo?: string
        }
        Relationships: []
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
      admins_ativos_count: { Args: never; Returns: number }
      atribuir_proximo_vendedor: { Args: { _lead_id: string }; Returns: string }
      cnpj_status:
        | {
            Args: { _cnpj: string }
            Returns: {
              ativo: boolean
              cliente_id: string
              existe: boolean
              mesmo_vendedor: boolean
            }[]
          }
        | {
            Args: { _cnpj: string; _vendedor_id: string }
            Returns: {
              ativo: boolean
              cliente_id: string
              existe: boolean
              mesmo_vendedor: boolean
            }[]
          }
      ganhos_fora_do_placar: {
        Args: { _periodo?: string }
        Returns: {
          avatar_color: string
          ganhos_qtd: number
          ganhos_valor: number
          nome: string
          vendedor_id: string
        }[]
      }
      ganhos_por_vendedor: {
        Args: { _end: string; _start: string }
        Returns: {
          qtd: number
          valor: number
          vid: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      next_pedido_number: { Args: { _year: number }; Returns: string }
      next_proposta_number: { Args: { _year: number }; Returns: string }
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
      pode_editar_documento: {
        Args: { _entidade_id: string; _tipo: string }
        Returns: boolean
      }
      pode_ver_documento: {
        Args: { _entidade_id: string; _tipo: string }
        Returns: boolean
      }
      snapshot_metas_mes: {
        Args: { _ano: number; _mes: number }
        Returns: number
      }
      tem_permissao: {
        Args: { _chave: string; _user_id: string }
        Returns: boolean
      }
      valor_permissao: {
        Args: { _chave: string; _user_id: string }
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
      arena_tipo_comercial:
        | "interno"
        | "representante"
        | "licitacoes"
        | "nao_comercial"
      conversa_status:
        | "ia_atendendo"
        | "humano_atendendo"
        | "qualificado"
        | "encerrado"
        | "aguardando_humano"
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
      pedido_stage:
        | "pedido_recebido"
        | "em_validacao"
        | "aguardando_aprovacao"
        | "aprovado_programado"
        | "em_producao"
        | "separacao_conferencia"
        | "faturado_aguardando_coleta"
        | "despachado_transporte"
        | "pedido_entregue"
        | "concluido"
        | "analise_financeira"
        | "programacao"
        | "pronto"
        | "faturado_em_rota"
        | "pos_venda"
        | "reprovado_financeiro"
        | "aguardando_pagamento"
        | "cancelado"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      arena_tipo_comercial: [
        "interno",
        "representante",
        "licitacoes",
        "nao_comercial",
      ],
      conversa_status: [
        "ia_atendendo",
        "humano_atendendo",
        "qualificado",
        "encerrado",
        "aguardando_humano",
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
      pedido_stage: [
        "pedido_recebido",
        "em_validacao",
        "aguardando_aprovacao",
        "aprovado_programado",
        "em_producao",
        "separacao_conferencia",
        "faturado_aguardando_coleta",
        "despachado_transporte",
        "pedido_entregue",
        "concluido",
        "analise_financeira",
        "programacao",
        "pronto",
        "faturado_em_rota",
        "pos_venda",
        "reprovado_financeiro",
        "aguardando_pagamento",
        "cancelado",
      ],
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
