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
      daily_snapshots: {
        Row: {
          close: number
          created_at: string
          daily_return_pct: number | null
          daily_traded_value: number | null
          day_index: number | null
          id: string
          kap_count: number
          last_kap_date: string | null
          market_value: number | null
          ret_10d: number | null
          ret_20d: number | null
          ret_30d: number | null
          ret_5d: number | null
          snapshot_date: string
          symbol: string
          vol_ratio_20d: number | null
          vol_ratio_2d: number | null
          vol_ratio_3d: number | null
          volume: number
        }
        Insert: {
          close: number
          created_at?: string
          daily_return_pct?: number | null
          daily_traded_value?: number | null
          day_index?: number | null
          id?: string
          kap_count?: number
          last_kap_date?: string | null
          market_value?: number | null
          ret_10d?: number | null
          ret_20d?: number | null
          ret_30d?: number | null
          ret_5d?: number | null
          snapshot_date: string
          symbol: string
          vol_ratio_20d?: number | null
          vol_ratio_2d?: number | null
          vol_ratio_3d?: number | null
          volume: number
        }
        Update: {
          close?: number
          created_at?: string
          daily_return_pct?: number | null
          daily_traded_value?: number | null
          day_index?: number | null
          id?: string
          kap_count?: number
          last_kap_date?: string | null
          market_value?: number | null
          ret_10d?: number | null
          ret_20d?: number | null
          ret_30d?: number | null
          ret_5d?: number | null
          snapshot_date?: string
          symbol?: string
          vol_ratio_20d?: number | null
          vol_ratio_2d?: number | null
          vol_ratio_3d?: number | null
          volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_snapshots_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "stocks"
            referencedColumns: ["symbol"]
          },
        ]
      }
      event_features: {
        Row: {
          close: number | null
          created_at: string
          daily_return_pct: number | null
          daily_traded_value: number | null
          days_before: number
          event_id: string
          feature_date: string
          id: string
          kap_count: number | null
          market_value: number | null
          ret_10d: number | null
          ret_20d: number | null
          ret_30d: number | null
          ret_5d: number | null
          sector: string | null
          symbol: string
          vol_ratio_20d: number | null
          vol_ratio_2d: number | null
          vol_ratio_3d: number | null
          volume: number | null
        }
        Insert: {
          close?: number | null
          created_at?: string
          daily_return_pct?: number | null
          daily_traded_value?: number | null
          days_before: number
          event_id: string
          feature_date: string
          id?: string
          kap_count?: number | null
          market_value?: number | null
          ret_10d?: number | null
          ret_20d?: number | null
          ret_30d?: number | null
          ret_5d?: number | null
          sector?: string | null
          symbol: string
          vol_ratio_20d?: number | null
          vol_ratio_2d?: number | null
          vol_ratio_3d?: number | null
          volume?: number | null
        }
        Update: {
          close?: number | null
          created_at?: string
          daily_return_pct?: number | null
          daily_traded_value?: number | null
          days_before?: number
          event_id?: string
          feature_date?: string
          id?: string
          kap_count?: number | null
          market_value?: number | null
          ret_10d?: number | null
          ret_20d?: number | null
          ret_30d?: number | null
          ret_5d?: number | null
          sector?: string | null
          symbol?: string
          vol_ratio_20d?: number | null
          vol_ratio_2d?: number | null
          vol_ratio_3d?: number | null
          volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "event_features_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          daily_return_pct: number
          event_date: string
          event_type: string
          id: string
          is_limit_up: boolean
          sector: string | null
          symbol: string
        }
        Insert: {
          created_at?: string
          daily_return_pct: number
          event_date: string
          event_type: string
          id?: string
          is_limit_up?: boolean
          sector?: string | null
          symbol: string
        }
        Update: {
          created_at?: string
          daily_return_pct?: number
          event_date?: string
          event_type?: string
          id?: string
          is_limit_up?: boolean
          sector?: string | null
          symbol?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "stocks"
            referencedColumns: ["symbol"]
          },
        ]
      }
      ingestion_meta: {
        Row: {
          data_source: string
          history_start: string | null
          id: number
          last_ingest_at: string | null
          notes: string | null
        }
        Insert: {
          data_source?: string
          history_start?: string | null
          id?: number
          last_ingest_at?: string | null
          notes?: string | null
        }
        Update: {
          data_source?: string
          history_start?: string | null
          id?: number
          last_ingest_at?: string | null
          notes?: string | null
        }
        Relationships: []
      }
      research_meta: {
        Row: {
          event_count: number
          first_date: string | null
          id: number
          last_date: string | null
          limit_up_count: number
          snapshot_count: number
          stock_count: number
          updated_at: string
        }
        Insert: {
          event_count?: number
          first_date?: string | null
          id?: number
          last_date?: string | null
          limit_up_count?: number
          snapshot_count?: number
          stock_count?: number
          updated_at?: string
        }
        Update: {
          event_count?: number
          first_date?: string | null
          id?: number
          last_date?: string | null
          limit_up_count?: number
          snapshot_count?: number
          stock_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      research_profile: {
        Row: {
          average: number | null
          days_before: number
          median: number | null
          metric: string
          ord: number
          unit: string
        }
        Insert: {
          average?: number | null
          days_before: number
          median?: number | null
          metric: string
          ord: number
          unit: string
        }
        Update: {
          average?: number | null
          days_before?: number
          median?: number | null
          metric?: string
          ord?: number
          unit?: string
        }
        Relationships: []
      }
      research_sectors: {
        Row: {
          count: number
          label: string
          ord: number
          pct: number
        }
        Insert: {
          count: number
          label: string
          ord: number
          pct: number
        }
        Update: {
          count?: number
          label?: string
          ord?: number
          pct?: number
        }
        Relationships: []
      }
      research_window_stats: {
        Row: {
          chart: string
          count: number
          days_before: number
          label: string
          ord: number
          pct: number
        }
        Insert: {
          chart: string
          count?: number
          days_before: number
          label: string
          ord: number
          pct?: number
        }
        Update: {
          chart?: string
          count?: number
          days_before?: number
          label?: string
          ord?: number
          pct?: number
        }
        Relationships: []
      }
      stocks: {
        Row: {
          company_name: string
          created_at: string
          sector: string
          shares_outstanding: number
          symbol: string
        }
        Insert: {
          company_name: string
          created_at?: string
          sector: string
          shares_outstanding?: number
          symbol: string
        }
        Update: {
          company_name?: string
          created_at?: string
          sector?: string
          shares_outstanding?: number
          symbol?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      recompute_research: { Args: never; Returns: undefined }
      run_recompute_once: { Args: never; Returns: undefined }
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
