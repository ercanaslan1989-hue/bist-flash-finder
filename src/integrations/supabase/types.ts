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
      ai_backtest_monthly: {
        Row: {
          id: number
          month: string | null
          occurrences: number | null
          precision_pct: number | null
          successes: number | null
          target_key: string | null
        }
        Insert: {
          id?: number
          month?: string | null
          occurrences?: number | null
          precision_pct?: number | null
          successes?: number | null
          target_key?: string | null
        }
        Update: {
          id?: number
          month?: string | null
          occurrences?: number | null
          precision_pct?: number | null
          successes?: number | null
          target_key?: string | null
        }
        Relationships: []
      }
      ai_combos: {
        Row: {
          ad_g10: number | null
          ad_g15: number | null
          ad_g20: number | null
          ad_lu: number | null
          af_g10: number | null
          af_g15: number | null
          af_g20: number | null
          af_lu: number | null
          id: number
          keys: string[] | null
          mf_g10: number | null
          mf_g15: number | null
          mf_g20: number | null
          mf_lu: number | null
          n_preds: number | null
          occ_g10: number | null
          occ_g15: number | null
          occ_g20: number | null
          occ_lu: number | null
          s_g10: number | null
          s_g15: number | null
          s_g20: number | null
          s_lu: number | null
        }
        Insert: {
          ad_g10?: number | null
          ad_g15?: number | null
          ad_g20?: number | null
          ad_lu?: number | null
          af_g10?: number | null
          af_g15?: number | null
          af_g20?: number | null
          af_lu?: number | null
          id?: number
          keys?: string[] | null
          mf_g10?: number | null
          mf_g15?: number | null
          mf_g20?: number | null
          mf_lu?: number | null
          n_preds?: number | null
          occ_g10?: number | null
          occ_g15?: number | null
          occ_g20?: number | null
          occ_lu?: number | null
          s_g10?: number | null
          s_g15?: number | null
          s_g20?: number | null
          s_lu?: number | null
        }
        Update: {
          ad_g10?: number | null
          ad_g15?: number | null
          ad_g20?: number | null
          ad_lu?: number | null
          af_g10?: number | null
          af_g15?: number | null
          af_g20?: number | null
          af_lu?: number | null
          id?: number
          keys?: string[] | null
          mf_g10?: number | null
          mf_g15?: number | null
          mf_g20?: number | null
          mf_lu?: number | null
          n_preds?: number | null
          occ_g10?: number | null
          occ_g15?: number | null
          occ_g20?: number | null
          occ_lu?: number | null
          s_g10?: number | null
          s_g15?: number | null
          s_g20?: number | null
          s_lu?: number | null
        }
        Relationships: []
      }
      ai_feature_importance: {
        Row: {
          appearances: number | null
          avg_lift: number | null
          avg_precision: number | null
          best_precision: number | null
          feature_group: string | null
          id: number
          importance: number | null
          label: string | null
          pred_key: string | null
          rank: number | null
          target_key: string | null
        }
        Insert: {
          appearances?: number | null
          avg_lift?: number | null
          avg_precision?: number | null
          best_precision?: number | null
          feature_group?: string | null
          id?: number
          importance?: number | null
          label?: string | null
          pred_key?: string | null
          rank?: number | null
          target_key?: string | null
        }
        Update: {
          appearances?: number | null
          avg_lift?: number | null
          avg_precision?: number | null
          best_precision?: number | null
          feature_group?: string | null
          id?: number
          importance?: number | null
          label?: string | null
          pred_key?: string | null
          rank?: number | null
          target_key?: string | null
        }
        Relationships: []
      }
      ai_meta: {
        Row: {
          current_run_id: number | null
          id: number
          last_run_at: string | null
          matrix_rows: number | null
          n_patterns: number | null
          n_significant: number | null
          phase: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          current_run_id?: number | null
          id?: number
          last_run_at?: string | null
          matrix_rows?: number | null
          n_patterns?: number | null
          n_significant?: number | null
          phase?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          current_run_id?: number | null
          id?: number
          last_run_at?: string | null
          matrix_rows?: number | null
          n_patterns?: number | null
          n_significant?: number | null
          phase?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ai_mf: {
        Row: {
          pred_key: string | null
          row_id: number | null
        }
        Insert: {
          pred_key?: string | null
          row_id?: number | null
        }
        Update: {
          pred_key?: string | null
          row_id?: number | null
        }
        Relationships: []
      }
      ai_oos_validation: {
        Row: {
          id: number
          in_sample_n: number | null
          in_sample_precision: number | null
          note: string | null
          oos_n: number | null
          oos_precision: number | null
          target_key: string | null
          test_period: string | null
          train_period: string | null
        }
        Insert: {
          id?: number
          in_sample_n?: number | null
          in_sample_precision?: number | null
          note?: string | null
          oos_n?: number | null
          oos_precision?: number | null
          target_key?: string | null
          test_period?: string | null
          train_period?: string | null
        }
        Update: {
          id?: number
          in_sample_n?: number | null
          in_sample_precision?: number | null
          note?: string | null
          oos_n?: number | null
          oos_precision?: number | null
          target_key?: string | null
          test_period?: string | null
          train_period?: string | null
        }
        Relationships: []
      }
      ai_params: {
        Row: {
          id: number
          mcap_med: number | null
          mcap_p20: number | null
          tv80: number | null
          tv90: number | null
          vol25: number | null
          vol75: number | null
        }
        Insert: {
          id?: number
          mcap_med?: number | null
          mcap_p20?: number | null
          tv80?: number | null
          tv90?: number | null
          vol25?: number | null
          vol75?: number | null
        }
        Update: {
          id?: number
          mcap_med?: number | null
          mcap_p20?: number | null
          tv80?: number | null
          tv90?: number | null
          vol25?: number | null
          vol75?: number | null
        }
        Relationships: []
      }
      ai_pattern_rows: {
        Row: {
          pattern_id: number | null
          row_id: number | null
        }
        Insert: {
          pattern_id?: number | null
          row_id?: number | null
        }
        Update: {
          pattern_id?: number | null
          row_id?: number | null
        }
        Relationships: []
      }
      ai_patterns: {
        Row: {
          avg_days_to_target: number | null
          avg_fwd: number | null
          base_rate_pct: number | null
          ci_high: number | null
          ci_low: number | null
          created_at: string
          failures: number | null
          fpr_pct: number | null
          horizon: number
          id: number
          label: string | null
          lift: number | null
          median_fwd: number | null
          n_preds: number
          occurrences: number | null
          overfit: boolean | null
          p_value: number | null
          parent_precision: number | null
          precision_gain: number | null
          precision_pct: number | null
          pred_keys: string[]
          rank: number | null
          recall_pct: number | null
          robust: boolean | null
          run_id: number | null
          significant: boolean | null
          successes: number | null
          target_key: string
          z_score: number | null
        }
        Insert: {
          avg_days_to_target?: number | null
          avg_fwd?: number | null
          base_rate_pct?: number | null
          ci_high?: number | null
          ci_low?: number | null
          created_at?: string
          failures?: number | null
          fpr_pct?: number | null
          horizon: number
          id?: never
          label?: string | null
          lift?: number | null
          median_fwd?: number | null
          n_preds: number
          occurrences?: number | null
          overfit?: boolean | null
          p_value?: number | null
          parent_precision?: number | null
          precision_gain?: number | null
          precision_pct?: number | null
          pred_keys: string[]
          rank?: number | null
          recall_pct?: number | null
          robust?: boolean | null
          run_id?: number | null
          significant?: boolean | null
          successes?: number | null
          target_key: string
          z_score?: number | null
        }
        Update: {
          avg_days_to_target?: number | null
          avg_fwd?: number | null
          base_rate_pct?: number | null
          ci_high?: number | null
          ci_low?: number | null
          created_at?: string
          failures?: number | null
          fpr_pct?: number | null
          horizon?: number
          id?: never
          label?: string | null
          lift?: number | null
          median_fwd?: number | null
          n_preds?: number
          occurrences?: number | null
          overfit?: boolean | null
          p_value?: number | null
          parent_precision?: number | null
          precision_gain?: number | null
          precision_pct?: number | null
          pred_keys?: string[]
          rank?: number | null
          recall_pct?: number | null
          robust?: boolean | null
          run_id?: number | null
          significant?: boolean | null
          successes?: number | null
          target_key?: string
          z_score?: number | null
        }
        Relationships: []
      }
      ai_pred_list: {
        Row: {
          is_top: boolean | null
          ord: number | null
          ord_top: number | null
          pred_key: string
        }
        Insert: {
          is_top?: boolean | null
          ord?: number | null
          ord_top?: number | null
          pred_key: string
        }
        Update: {
          is_top?: boolean | null
          ord?: number | null
          ord_top?: number | null
          pred_key?: string
        }
        Relationships: []
      }
      ai_progress: {
        Row: {
          combos_done: number
          combos_total: number
          cursor_pos: number
          error: string | null
          eta_seconds: number | null
          id: number
          min_sample: number
          min_support: number
          pct: number
          phase: string | null
          rows_done: number
          rows_total: number
          run_id: number | null
          scope_start: string
          stage: string
          stage_started_at: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          combos_done?: number
          combos_total?: number
          cursor_pos?: number
          error?: string | null
          eta_seconds?: number | null
          id?: number
          min_sample?: number
          min_support?: number
          pct?: number
          phase?: string | null
          rows_done?: number
          rows_total?: number
          run_id?: number | null
          scope_start?: string
          stage?: string
          stage_started_at?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          combos_done?: number
          combos_total?: number
          cursor_pos?: number
          error?: string | null
          eta_seconds?: number | null
          id?: number
          min_sample?: number
          min_support?: number
          pct?: number
          phase?: string | null
          rows_done?: number
          rows_total?: number
          run_id?: number | null
          scope_start?: string
          stage?: string
          stage_started_at?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_runs: {
        Row: {
          finished_at: string | null
          id: number
          n_patterns: number | null
          n_significant: number | null
          started_at: string
          status: string | null
        }
        Insert: {
          finished_at?: string | null
          id?: never
          n_patterns?: number | null
          n_significant?: number | null
          started_at?: string
          status?: string | null
        }
        Update: {
          finished_at?: string | null
          id?: never
          n_patterns?: number | null
          n_significant?: number | null
          started_at?: string
          status?: string | null
        }
        Relationships: []
      }
      ai_signal_quality: {
        Row: {
          best_label: string | null
          created_at: string
          id: number
          n_patterns: number | null
          n_significant: number | null
          run_date: string | null
          run_id: number | null
          target_key: string | null
          top_lift: number | null
          top_precision: number | null
        }
        Insert: {
          best_label?: string | null
          created_at?: string
          id?: never
          n_patterns?: number | null
          n_significant?: number | null
          run_date?: string | null
          run_id?: number | null
          target_key?: string | null
          top_lift?: number | null
          top_precision?: number | null
        }
        Update: {
          best_label?: string | null
          created_at?: string
          id?: never
          n_patterns?: number | null
          n_significant?: number | null
          run_date?: string | null
          run_id?: number | null
          target_key?: string | null
          top_lift?: number | null
          top_precision?: number | null
        }
        Relationships: []
      }
      ai_symbol_queue: {
        Row: {
          feat_done: boolean
          matrix_done: boolean
          symbol: string
        }
        Insert: {
          feat_done?: boolean
          matrix_done?: boolean
          symbol: string
        }
        Update: {
          feat_done?: boolean
          matrix_done?: boolean
          symbol?: string
        }
        Relationships: []
      }
      ai_top_patterns: {
        Row: {
          avg_days_to_target: number | null
          avg_fwd: number | null
          base_rate_pct: number | null
          ci_high: number | null
          ci_low: number | null
          failures: number | null
          fpr_pct: number | null
          horizon: number | null
          id: number
          label: string | null
          lift: number | null
          median_fwd: number | null
          n_preds: number | null
          occurrences: number | null
          overfit: boolean | null
          p_value: number | null
          precision_pct: number | null
          pred_keys: string[] | null
          rank: number | null
          recall_pct: number | null
          robust: boolean | null
          successes: number | null
          target_key: string | null
          z_score: number | null
        }
        Insert: {
          avg_days_to_target?: number | null
          avg_fwd?: number | null
          base_rate_pct?: number | null
          ci_high?: number | null
          ci_low?: number | null
          failures?: number | null
          fpr_pct?: number | null
          horizon?: number | null
          id?: number
          label?: string | null
          lift?: number | null
          median_fwd?: number | null
          n_preds?: number | null
          occurrences?: number | null
          overfit?: boolean | null
          p_value?: number | null
          precision_pct?: number | null
          pred_keys?: string[] | null
          rank?: number | null
          recall_pct?: number | null
          robust?: boolean | null
          successes?: number | null
          target_key?: string | null
          z_score?: number | null
        }
        Update: {
          avg_days_to_target?: number | null
          avg_fwd?: number | null
          base_rate_pct?: number | null
          ci_high?: number | null
          ci_low?: number | null
          failures?: number | null
          fpr_pct?: number | null
          horizon?: number | null
          id?: number
          label?: string | null
          lift?: number | null
          median_fwd?: number | null
          n_preds?: number | null
          occurrences?: number | null
          overfit?: boolean | null
          p_value?: number | null
          precision_pct?: number | null
          pred_keys?: string[] | null
          rank?: number | null
          recall_pct?: number | null
          robust?: boolean | null
          successes?: number | null
          target_key?: string | null
          z_score?: number | null
        }
        Relationships: []
      }
      ai_top_signals: {
        Row: {
          ci_low: number | null
          confidence: number | null
          horizon: number | null
          id: number
          label: string | null
          lift: number | null
          occurrences: number | null
          precision_pct: number | null
          pred_keys: string[] | null
          rank: number | null
          target_key: string | null
          z_score: number | null
        }
        Insert: {
          ci_low?: number | null
          confidence?: number | null
          horizon?: number | null
          id?: number
          label?: string | null
          lift?: number | null
          occurrences?: number | null
          precision_pct?: number | null
          pred_keys?: string[] | null
          rank?: number | null
          target_key?: string | null
          z_score?: number | null
        }
        Update: {
          ci_low?: number | null
          confidence?: number | null
          horizon?: number | null
          id?: number
          label?: string | null
          lift?: number | null
          occurrences?: number | null
          precision_pct?: number | null
          pred_keys?: string[] | null
          rank?: number | null
          target_key?: string | null
          z_score?: number | null
        }
        Relationships: []
      }
      ai_tstat: {
        Row: {
          pos: number | null
          tk: string
          tot: number | null
        }
        Insert: {
          pos?: number | null
          tk: string
          tot?: number | null
        }
        Update: {
          pos?: number | null
          tk?: string
          tot?: number | null
        }
        Relationships: []
      }
      ai_watchlist: {
        Row: {
          best_target: string | null
          company_name: string | null
          confidence: number | null
          hist_success_pct: number | null
          id: number
          matched_labels: string[] | null
          matched_patterns: number | null
          probability: number | null
          rank: number | null
          score_date: string | null
          sector: string | null
          symbol: string | null
          updated_at: string
        }
        Insert: {
          best_target?: string | null
          company_name?: string | null
          confidence?: number | null
          hist_success_pct?: number | null
          id?: number
          matched_labels?: string[] | null
          matched_patterns?: number | null
          probability?: number | null
          rank?: number | null
          score_date?: string | null
          sector?: string | null
          symbol?: string | null
          updated_at?: string
        }
        Update: {
          best_target?: string | null
          company_name?: string | null
          confidence?: number | null
          hist_success_pct?: number | null
          id?: number
          matched_labels?: string[] | null
          matched_patterns?: number | null
          probability?: number | null
          rank?: number | null
          score_date?: string | null
          sector?: string | null
          symbol?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      bist_active_universe: {
        Row: {
          company_name: string | null
          ipo_date: string | null
          is_active: boolean
          source: string | null
          symbol: string
          updated_at: string
        }
        Insert: {
          company_name?: string | null
          ipo_date?: string | null
          is_active?: boolean
          source?: string | null
          symbol: string
          updated_at?: string
        }
        Update: {
          company_name?: string | null
          ipo_date?: string | null
          is_active?: boolean
          source?: string | null
          symbol?: string
          updated_at?: string
        }
        Relationships: []
      }
      coverage_by_symbol: {
        Row: {
          company_name: string | null
          earliest_date: string | null
          has_data: boolean | null
          in_universe: boolean | null
          latest_date: string | null
          n_days: number | null
          symbol: string
        }
        Insert: {
          company_name?: string | null
          earliest_date?: string | null
          has_data?: boolean | null
          in_universe?: boolean | null
          latest_date?: string | null
          n_days?: number | null
          symbol: string
        }
        Update: {
          company_name?: string | null
          earliest_date?: string | null
          has_data?: boolean | null
          in_universe?: boolean | null
          latest_date?: string | null
          n_days?: number | null
          symbol?: string
        }
        Relationships: []
      }
      coverage_report: {
        Row: {
          coverage_pct: number | null
          generated_at: string | null
          id: number
          imported: number | null
          missing: number | null
          missing_symbols: string[] | null
          total_active: number | null
          universe_source: string | null
        }
        Insert: {
          coverage_pct?: number | null
          generated_at?: string | null
          id?: number
          imported?: number | null
          missing?: number | null
          missing_symbols?: string[] | null
          total_active?: number | null
          universe_source?: string | null
        }
        Update: {
          coverage_pct?: number | null
          generated_at?: string | null
          id?: number
          imported?: number | null
          missing?: number | null
          missing_symbols?: string[] | null
          total_active?: number | null
          universe_source?: string | null
        }
        Relationships: []
      }
      daily_snapshots: {
        Row: {
          close: number
          created_at: string
          daily_return_pct: number | null
          daily_traded_value: number | null
          day_index: number | null
          fwd_max_20d: number | null
          id: string
          kap_count: number
          last_kap_date: string | null
          market_value: number | null
          ret_10d: number | null
          ret_20d: number | null
          ret_2d: number | null
          ret_30d: number | null
          ret_3d: number | null
          ret_5d: number | null
          snapshot_date: string
          symbol: string
          vol_ratio_1d: number | null
          vol_ratio_20d: number | null
          vol_ratio_2d: number | null
          vol_ratio_3d: number | null
          vol_ratio_5d: number | null
          volume: number
        }
        Insert: {
          close: number
          created_at?: string
          daily_return_pct?: number | null
          daily_traded_value?: number | null
          day_index?: number | null
          fwd_max_20d?: number | null
          id?: string
          kap_count?: number
          last_kap_date?: string | null
          market_value?: number | null
          ret_10d?: number | null
          ret_20d?: number | null
          ret_2d?: number | null
          ret_30d?: number | null
          ret_3d?: number | null
          ret_5d?: number | null
          snapshot_date: string
          symbol: string
          vol_ratio_1d?: number | null
          vol_ratio_20d?: number | null
          vol_ratio_2d?: number | null
          vol_ratio_3d?: number | null
          vol_ratio_5d?: number | null
          volume: number
        }
        Update: {
          close?: number
          created_at?: string
          daily_return_pct?: number | null
          daily_traded_value?: number | null
          day_index?: number | null
          fwd_max_20d?: number | null
          id?: string
          kap_count?: number
          last_kap_date?: string | null
          market_value?: number | null
          ret_10d?: number | null
          ret_20d?: number | null
          ret_2d?: number | null
          ret_30d?: number | null
          ret_3d?: number | null
          ret_5d?: number | null
          snapshot_date?: string
          symbol?: string
          vol_ratio_1d?: number | null
          vol_ratio_20d?: number | null
          vol_ratio_2d?: number | null
          vol_ratio_3d?: number | null
          vol_ratio_5d?: number | null
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
      discovery_features: {
        Row: {
          close: number | null
          day_index: number | null
          dist_hi20: number | null
          dist_lo20: number | null
          dist_ma20: number | null
          green_streak: number | null
          hi20: number | null
          kap_category: string | null
          kap_count: number | null
          lo20: number | null
          ma20: number | null
          mcap: number | null
          range20: number | null
          red_streak: number | null
          ret: number | null
          ret_10d: number | null
          ret_20d: number | null
          ret_2d: number | null
          ret_3d: number | null
          ret_5d: number | null
          row_id: number
          sec_med_ret20: number | null
          sec_p75_ret20: number | null
          sector: string | null
          snap_id: string | null
          snapshot_date: string | null
          symbol: string | null
          tv: number | null
          vol20: number | null
          vr1: number | null
          vr2: number | null
          vr20: number | null
          vr3: number | null
          vr5: number | null
        }
        Insert: {
          close?: number | null
          day_index?: number | null
          dist_hi20?: number | null
          dist_lo20?: number | null
          dist_ma20?: number | null
          green_streak?: number | null
          hi20?: number | null
          kap_category?: string | null
          kap_count?: number | null
          lo20?: number | null
          ma20?: number | null
          mcap?: number | null
          range20?: number | null
          red_streak?: number | null
          ret?: number | null
          ret_10d?: number | null
          ret_20d?: number | null
          ret_2d?: number | null
          ret_3d?: number | null
          ret_5d?: number | null
          row_id?: number
          sec_med_ret20?: number | null
          sec_p75_ret20?: number | null
          sector?: string | null
          snap_id?: string | null
          snapshot_date?: string | null
          symbol?: string | null
          tv?: number | null
          vol20?: number | null
          vr1?: number | null
          vr2?: number | null
          vr20?: number | null
          vr3?: number | null
          vr5?: number | null
        }
        Update: {
          close?: number | null
          day_index?: number | null
          dist_hi20?: number | null
          dist_lo20?: number | null
          dist_ma20?: number | null
          green_streak?: number | null
          hi20?: number | null
          kap_category?: string | null
          kap_count?: number | null
          lo20?: number | null
          ma20?: number | null
          mcap?: number | null
          range20?: number | null
          red_streak?: number | null
          ret?: number | null
          ret_10d?: number | null
          ret_20d?: number | null
          ret_2d?: number | null
          ret_3d?: number | null
          ret_5d?: number | null
          row_id?: number
          sec_med_ret20?: number | null
          sec_p75_ret20?: number | null
          sector?: string | null
          snap_id?: string | null
          snapshot_date?: string | null
          symbol?: string | null
          tv?: number | null
          vol20?: number | null
          vr1?: number | null
          vr2?: number | null
          vr20?: number | null
          vr3?: number | null
          vr5?: number | null
        }
        Relationships: []
      }
      discovery_matrix: {
        Row: {
          eval_g10: boolean | null
          eval_g15: boolean | null
          eval_g20: boolean | null
          eval_lu: boolean | null
          g10_days: number | null
          g10_fwd: number | null
          g15_days: number | null
          g15_fwd: number | null
          g20_days: number | null
          g20_fwd: number | null
          lu_days: number | null
          lu_fwd: number | null
          market_value: number | null
          row_id: number
          sector: string | null
          snap_id: string | null
          snapshot_date: string | null
          symbol: string | null
          tgt_g10: boolean | null
          tgt_g15: boolean | null
          tgt_g20: boolean | null
          tgt_lu: boolean | null
        }
        Insert: {
          eval_g10?: boolean | null
          eval_g15?: boolean | null
          eval_g20?: boolean | null
          eval_lu?: boolean | null
          g10_days?: number | null
          g10_fwd?: number | null
          g15_days?: number | null
          g15_fwd?: number | null
          g20_days?: number | null
          g20_fwd?: number | null
          lu_days?: number | null
          lu_fwd?: number | null
          market_value?: number | null
          row_id: number
          sector?: string | null
          snap_id?: string | null
          snapshot_date?: string | null
          symbol?: string | null
          tgt_g10?: boolean | null
          tgt_g15?: boolean | null
          tgt_g20?: boolean | null
          tgt_lu?: boolean | null
        }
        Update: {
          eval_g10?: boolean | null
          eval_g15?: boolean | null
          eval_g20?: boolean | null
          eval_lu?: boolean | null
          g10_days?: number | null
          g10_fwd?: number | null
          g15_days?: number | null
          g15_fwd?: number | null
          g20_days?: number | null
          g20_fwd?: number | null
          lu_days?: number | null
          lu_fwd?: number | null
          market_value?: number | null
          row_id?: number
          sector?: string | null
          snap_id?: string | null
          snapshot_date?: string | null
          symbol?: string | null
          tgt_g10?: boolean | null
          tgt_g15?: boolean | null
          tgt_g20?: boolean | null
          tgt_lu?: boolean | null
        }
        Relationships: []
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
          ret_2d: number | null
          ret_30d: number | null
          ret_3d: number | null
          ret_5d: number | null
          sector: string | null
          symbol: string
          vol_ratio_1d: number | null
          vol_ratio_20d: number | null
          vol_ratio_2d: number | null
          vol_ratio_3d: number | null
          vol_ratio_5d: number | null
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
          ret_2d?: number | null
          ret_30d?: number | null
          ret_3d?: number | null
          ret_5d?: number | null
          sector?: string | null
          symbol: string
          vol_ratio_1d?: number | null
          vol_ratio_20d?: number | null
          vol_ratio_2d?: number | null
          vol_ratio_3d?: number | null
          vol_ratio_5d?: number | null
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
          ret_2d?: number | null
          ret_30d?: number | null
          ret_3d?: number | null
          ret_5d?: number | null
          sector?: string | null
          symbol?: string
          vol_ratio_1d?: number | null
          vol_ratio_20d?: number | null
          vol_ratio_2d?: number | null
          vol_ratio_3d?: number | null
          vol_ratio_5d?: number | null
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
          fwd_ret_20d: number | null
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
          fwd_ret_20d?: number | null
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
          fwd_ret_20d?: number | null
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
      kap_disclosures: {
        Row: {
          category: string | null
          company_name: string | null
          created_at: string
          disclosure_date: string
          disclosure_time: string | null
          disclosure_type: string | null
          id: string
          source_id: string | null
          summary: string | null
          symbol: string
          title: string | null
        }
        Insert: {
          category?: string | null
          company_name?: string | null
          created_at?: string
          disclosure_date: string
          disclosure_time?: string | null
          disclosure_type?: string | null
          id?: string
          source_id?: string | null
          summary?: string | null
          symbol: string
          title?: string | null
        }
        Update: {
          category?: string | null
          company_name?: string | null
          created_at?: string
          disclosure_date?: string
          disclosure_time?: string | null
          disclosure_type?: string | null
          id?: string
          source_id?: string | null
          summary?: string | null
          symbol?: string
          title?: string | null
        }
        Relationships: []
      }
      matrix_flags: {
        Row: {
          pred_key: string
          row_id: number
        }
        Insert: {
          pred_key: string
          row_id: number
        }
        Update: {
          pred_key?: string
          row_id?: number
        }
        Relationships: []
      }
      pred_catalog: {
        Row: {
          feature_group: string | null
          label: string | null
          pred_key: string
        }
        Insert: {
          feature_group?: string | null
          label?: string | null
          pred_key: string
        }
        Update: {
          feature_group?: string | null
          label?: string | null
          pred_key?: string
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
      research_progress: {
        Row: {
          features_generated: number
          id: number
          limit_up_events: number
          phase: string | null
          rows_processed: number
          run20_events: number
          scope_end: string | null
          scope_start: string | null
          started_at: string | null
          status: string
          stocks_done: number
          stocks_total: number
          updated_at: string
        }
        Insert: {
          features_generated?: number
          id?: number
          limit_up_events?: number
          phase?: string | null
          rows_processed?: number
          run20_events?: number
          scope_end?: string | null
          scope_start?: string | null
          started_at?: string | null
          status?: string
          stocks_done?: number
          stocks_total?: number
          updated_at?: string
        }
        Update: {
          features_generated?: number
          id?: number
          limit_up_events?: number
          phase?: string | null
          rows_processed?: number
          run20_events?: number
          scope_end?: string | null
          scope_start?: string | null
          started_at?: string | null
          status?: string
          stocks_done?: number
          stocks_total?: number
          updated_at?: string
        }
        Relationships: []
      }
      research_queue: {
        Row: {
          error: string | null
          limit_up: number
          n_rows: number
          processed_at: string | null
          run20: number
          status: string
          symbol: string
        }
        Insert: {
          error?: string | null
          limit_up?: number
          n_rows?: number
          processed_at?: string | null
          run20?: number
          status?: string
          symbol: string
        }
        Update: {
          error?: string | null
          limit_up?: number
          n_rows?: number
          processed_at?: string | null
          run20?: number
          status?: string
          symbol?: string
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
      research_signals: {
        Row: {
          avg_days_to_target: number | null
          avg_fwd_max20: number | null
          base_hits: number
          base_rate_pct: number | null
          base_support: number
          event_type: string
          failures: number | null
          fpr_pct: number | null
          hits: number
          horizon: number
          id: number
          lift: number | null
          median_fwd_max20: number | null
          occurrences: number | null
          precision_pct: number | null
          rank: number | null
          recall_pct: number | null
          signal_key: string
          signal_label: string
          successes: number | null
          support: number
          updated_at: string
        }
        Insert: {
          avg_days_to_target?: number | null
          avg_fwd_max20?: number | null
          base_hits?: number
          base_rate_pct?: number | null
          base_support?: number
          event_type: string
          failures?: number | null
          fpr_pct?: number | null
          hits?: number
          horizon: number
          id?: never
          lift?: number | null
          median_fwd_max20?: number | null
          occurrences?: number | null
          precision_pct?: number | null
          rank?: number | null
          recall_pct?: number | null
          signal_key: string
          signal_label: string
          successes?: number | null
          support?: number
          updated_at?: string
        }
        Update: {
          avg_days_to_target?: number | null
          avg_fwd_max20?: number | null
          base_hits?: number
          base_rate_pct?: number | null
          base_support?: number
          event_type?: string
          failures?: number | null
          fpr_pct?: number | null
          hits?: number
          horizon?: number
          id?: never
          lift?: number | null
          median_fwd_max20?: number | null
          occurrences?: number | null
          precision_pct?: number | null
          rank?: number | null
          recall_pct?: number | null
          signal_key?: string
          signal_label?: string
          successes?: number | null
          support?: number
          updated_at?: string
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
      ai_discovery_run: { Args: never; Returns: undefined }
      ai_discovery_start: {
        Args: { _min_sample?: number; _min_support?: number; _scope?: string }
        Returns: undefined
      }
      ai_drive: {
        Args: never
        Returns: {
          combos_done: number
          combos_total: number
          cursor_pos: number
          error: string | null
          eta_seconds: number | null
          id: number
          min_sample: number
          min_support: number
          pct: number
          phase: string | null
          rows_done: number
          rows_total: number
          run_id: number | null
          scope_start: string
          stage: string
          stage_started_at: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "ai_progress"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ai_score_daily: { Args: never; Returns: undefined }
      ai_stage_backtest: { Args: never; Returns: undefined }
      ai_stage_features: { Args: { _batch?: number }; Returns: undefined }
      ai_stage_flags: { Args: { _step?: number }; Returns: undefined }
      ai_stage_matrix: { Args: { _batch?: number }; Returns: undefined }
      ai_stage_oos: { Args: never; Returns: undefined }
      ai_stage_pair: { Args: { _pb?: number }; Returns: undefined }
      ai_stage_params: { Args: never; Returns: undefined }
      ai_stage_predcatalog: { Args: never; Returns: undefined }
      ai_stage_quality: { Args: never; Returns: undefined }
      ai_stage_reset: { Args: never; Returns: undefined }
      ai_stage_secstats: { Args: never; Returns: undefined }
      ai_stage_single: { Args: never; Returns: undefined }
      ai_stage_triple: { Args: { _pb?: number }; Returns: undefined }
      ai_stage_validate: { Args: never; Returns: undefined }
      build_coverage_report: { Args: never; Returns: undefined }
      build_discovery_matrix: { Args: never; Returns: undefined }
      build_research_aggregates: { Args: never; Returns: undefined }
      classify_kap: { Args: { _title: string; _type: string }; Returns: string }
      normal_cdf: { Args: { x: number }; Returns: number }
      process_stock: {
        Args: { _symbol: string }
        Returns: {
          feats: number
          lu: number
          rows_done: number
          run20: number
        }[]
      }
      refresh_kap_features: { Args: never; Returns: undefined }
      research_drive: {
        Args: { _batch?: number }
        Returns: {
          done: boolean
          processed: number
          remaining: number
        }[]
      }
      research_reset: { Args: { _scope?: string }; Returns: undefined }
      run_ai_discovery: {
        Args: { _min_sample?: number; _min_support?: number; _run_id?: number }
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
