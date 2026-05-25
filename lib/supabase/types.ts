// =========================================================================
// AUTO-GENERATED. Do not edit by hand.
// Regenerate via: `pnpm db:types`
// =========================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      chat_conversations: {
        Row: {
          created_at: string
          id: string
          org_id: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "make_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          cited_scenario_ids: string[] | null
          content: string
          conversation_id: string
          created_at: string
          id: string
          llm_model_used: string | null
          llm_tokens_in: number | null
          llm_tokens_out: number | null
          role: string
        }
        Insert: {
          cited_scenario_ids?: string[] | null
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          llm_model_used?: string | null
          llm_tokens_in?: number | null
          llm_tokens_out?: number | null
          role: string
        }
        Update: {
          cited_scenario_ids?: string[] | null
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          llm_model_used?: string | null
          llm_tokens_in?: number | null
          llm_tokens_out?: number | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_queue: {
        Row: {
          attempts: number
          enqueued_at: string
          folder_id: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          org_id: string | null
          priority: number
          scenario_id: string
          team_id: string | null
        }
        Insert: {
          attempts?: number
          enqueued_at?: string
          folder_id?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          org_id?: string | null
          priority?: number
          scenario_id: string
          team_id?: string | null
        }
        Update: {
          attempts?: number
          enqueued_at?: string
          folder_id?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          org_id?: string | null
          priority?: number
          scenario_id?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_queue_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "make_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingestion_queue_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "make_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingestion_queue_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "make_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_runs: {
        Row: {
          blueprint_hash: string | null
          duration_ms: number | null
          embedding_cost_usd: number | null
          embedding_tokens: number | null
          error_message: string | null
          error_stack: string | null
          finished_at: string | null
          id: string
          llm_cost_usd: number | null
          llm_model_used: string | null
          llm_prompt_version: string | null
          llm_tokens_in: number | null
          llm_tokens_out: number | null
          scenario_id: string
          started_at: string
          status: string
          trigger: string
        }
        Insert: {
          blueprint_hash?: string | null
          duration_ms?: number | null
          embedding_cost_usd?: number | null
          embedding_tokens?: number | null
          error_message?: string | null
          error_stack?: string | null
          finished_at?: string | null
          id?: string
          llm_cost_usd?: number | null
          llm_model_used?: string | null
          llm_prompt_version?: string | null
          llm_tokens_in?: number | null
          llm_tokens_out?: number | null
          scenario_id: string
          started_at?: string
          status: string
          trigger: string
        }
        Update: {
          blueprint_hash?: string | null
          duration_ms?: number | null
          embedding_cost_usd?: number | null
          embedding_tokens?: number | null
          error_message?: string | null
          error_stack?: string | null
          finished_at?: string | null
          id?: string
          llm_cost_usd?: number | null
          llm_model_used?: string | null
          llm_prompt_version?: string | null
          llm_tokens_in?: number | null
          llm_tokens_out?: number | null
          scenario_id?: string
          started_at?: string
          status?: string
          trigger?: string
        }
        Relationships: []
      }
      llm_call_log: {
        Row: {
          cost_usd: number
          created_at: string
          id: string
          model: string
          stage: string
          tokens_in: number
          tokens_out: number
          user_id: string | null
        }
        Insert: {
          cost_usd?: number
          created_at?: string
          id?: string
          model: string
          stage: string
          tokens_in?: number
          tokens_out?: number
          user_id?: string | null
        }
        Update: {
          cost_usd?: number
          created_at?: string
          id?: string
          model?: string
          stage?: string
          tokens_in?: number
          tokens_out?: number
          user_id?: string | null
        }
        Relationships: []
      }
      make_folders: {
        Row: {
          folder_name: string
          id: string
          make_folder_id: string
          team_id: string | null
        }
        Insert: {
          folder_name: string
          id?: string
          make_folder_id: string
          team_id?: string | null
        }
        Update: {
          folder_name?: string
          id?: string
          make_folder_id?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "make_folders_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "make_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      make_organizations: {
        Row: {
          id: string
          make_org_id: string
          org_name: string
        }
        Insert: {
          id?: string
          make_org_id: string
          org_name: string
        }
        Update: {
          id?: string
          make_org_id?: string
          org_name?: string
        }
        Relationships: []
      }
      make_scenarios: {
        Row: {
          analyzed_at: string | null
          apps_involved: Json | null
          blueprint_clean_json: Json | null
          blueprint_hash: string | null
          blueprint_json: Json | null
          blueprint_storage_url: string | null
          branches_summary: Json | null
          business_purpose: string | null
          category: string | null
          complexity: string | null
          created_by_name: string | null
          created_by_user_id: string | null
          data_flow: string | null
          embedding: string | null
          error_handling: string | null
          folder_id: string | null
          folder_name: string | null
          full_description: string | null
          id: string
          imported_at: string | null
          llm_analysis_json: Json | null
          llm_model_used: string | null
          llm_prompt_version: string | null
          make_created_at: string | null
          make_created_by_id: string | null
          make_folder_id: string | null
          make_org_id: string | null
          make_scenario_id: string
          make_team_id: string | null
          make_updated_at: string | null
          one_line_summary: string | null
          org_id: string | null
          org_name: string | null
          reanalyzed_at: string | null
          reuse_notes: string | null
          scenario_name: string
          search_text: unknown
          tags: Json | null
          team_id: string | null
          team_name: string | null
          trigger_app: string | null
          trigger_event: string | null
          trigger_type: string | null
          use_cases: Json | null
        }
        Insert: {
          analyzed_at?: string | null
          apps_involved?: Json | null
          blueprint_clean_json?: Json | null
          blueprint_hash?: string | null
          blueprint_json?: Json | null
          blueprint_storage_url?: string | null
          branches_summary?: Json | null
          business_purpose?: string | null
          category?: string | null
          complexity?: string | null
          created_by_name?: string | null
          created_by_user_id?: string | null
          data_flow?: string | null
          embedding?: string | null
          error_handling?: string | null
          folder_id?: string | null
          folder_name?: string | null
          full_description?: string | null
          id?: string
          imported_at?: string | null
          llm_analysis_json?: Json | null
          llm_model_used?: string | null
          llm_prompt_version?: string | null
          make_created_at?: string | null
          make_created_by_id?: string | null
          make_folder_id?: string | null
          make_org_id?: string | null
          make_scenario_id: string
          make_team_id?: string | null
          make_updated_at?: string | null
          one_line_summary?: string | null
          org_id?: string | null
          org_name?: string | null
          reanalyzed_at?: string | null
          reuse_notes?: string | null
          scenario_name: string
          search_text?: unknown
          tags?: Json | null
          team_id?: string | null
          team_name?: string | null
          trigger_app?: string | null
          trigger_event?: string | null
          trigger_type?: string | null
          use_cases?: Json | null
        }
        Update: {
          analyzed_at?: string | null
          apps_involved?: Json | null
          blueprint_clean_json?: Json | null
          blueprint_hash?: string | null
          blueprint_json?: Json | null
          blueprint_storage_url?: string | null
          branches_summary?: Json | null
          business_purpose?: string | null
          category?: string | null
          complexity?: string | null
          created_by_name?: string | null
          created_by_user_id?: string | null
          data_flow?: string | null
          embedding?: string | null
          error_handling?: string | null
          folder_id?: string | null
          folder_name?: string | null
          full_description?: string | null
          id?: string
          imported_at?: string | null
          llm_analysis_json?: Json | null
          llm_model_used?: string | null
          llm_prompt_version?: string | null
          make_created_at?: string | null
          make_created_by_id?: string | null
          make_folder_id?: string | null
          make_org_id?: string | null
          make_scenario_id?: string
          make_team_id?: string | null
          make_updated_at?: string | null
          one_line_summary?: string | null
          org_id?: string | null
          org_name?: string | null
          reanalyzed_at?: string | null
          reuse_notes?: string | null
          scenario_name?: string
          search_text?: unknown
          tags?: Json | null
          team_id?: string | null
          team_name?: string | null
          trigger_app?: string | null
          trigger_event?: string | null
          trigger_type?: string | null
          use_cases?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "make_scenarios_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "make_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "make_scenarios_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "make_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "make_scenarios_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "make_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "make_scenarios_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "make_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      make_teams: {
        Row: {
          id: string
          make_team_id: string
          org_id: string | null
          team_name: string
        }
        Insert: {
          id?: string
          make_team_id: string
          org_id?: string | null
          team_name: string
        }
        Update: {
          id?: string
          make_team_id?: string
          org_id?: string | null
          team_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "make_teams_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "make_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      make_users: {
        Row: {
          email: string | null
          id: string
          make_user_id: string
          user_name: string | null
        }
        Insert: {
          email?: string | null
          id?: string
          make_user_id: string
          user_name?: string | null
        }
        Update: {
          email?: string | null
          id?: string
          make_user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      scenario_patterns: {
        Row: {
          apps_in_pattern: Json | null
          category: string | null
          created_at: string
          embedding: string | null
          id: string
          member_scenario_ids: string[] | null
          org_id: string | null
          pattern_name: string
          pattern_summary: string
          representative_scenario_id: string | null
          updated_at: string
        }
        Insert: {
          apps_in_pattern?: Json | null
          category?: string | null
          created_at?: string
          embedding?: string | null
          id?: string
          member_scenario_ids?: string[] | null
          org_id?: string | null
          pattern_name: string
          pattern_summary: string
          representative_scenario_id?: string | null
          updated_at?: string
        }
        Update: {
          apps_in_pattern?: Json | null
          category?: string | null
          created_at?: string
          embedding?: string | null
          id?: string
          member_scenario_ids?: string[] | null
          org_id?: string | null
          pattern_name?: string
          pattern_summary?: string
          representative_scenario_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenario_patterns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "make_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenario_patterns_representative_scenario_id_fkey"
            columns: ["representative_scenario_id"]
            isOneToOne: false
            referencedRelation: "make_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      user_org_memberships: {
        Row: {
          created_at: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          org_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_org_memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "make_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      vw_daily_spend: {
        Row: {
          day: string | null
          embedding_usd: number | null
          failed_runs: number | null
          llm_usd: number | null
          runs: number | null
          total_usd: number | null
        }
        Relationships: []
      }
      vw_ingestion_health: {
        Row: {
          avg_duration_ms: number | null
          failures: number | null
          hour: string | null
          p95_duration_ms: number | null
          skipped: number | null
          successes: number | null
          total: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      search_scenarios: {
        Args: {
          p_apps?: Json
          p_categories?: string[]
          p_complexity?: string[]
          p_match_count?: number
          p_query_embedding: string
          p_query_text: string
          p_team_ids?: string[]
          p_trigger_types?: string[]
          p_vector_weight?: number
        }
        Returns: {
          apps_involved: Json
          category: string
          complexity: string
          id: string
          make_scenario_id: string
          one_line_summary: string
          scenario_name: string
          score: number
          tags: Json
          team_name: string
          trigger_app: string
          trigger_type: string
        }[]
      }
      user_org_ids: { Args: never; Returns: string[] }
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
