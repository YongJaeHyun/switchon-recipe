export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '12.2.3';
  };
  public: {
    Tables: {
      fasting: {
        Row: {
          created_at: string;
          days: number[] | null;
          id: number;
          start_minutes: Json | null;
          start_time: string | null;
          uid: string | null;
          was_sunday: boolean | null;
        };
        Insert: {
          created_at?: string;
          days?: number[] | null;
          id?: number;
          start_minutes?: Json | null;
          start_time?: string | null;
          uid?: string | null;
          was_sunday?: boolean | null;
        };
        Update: {
          created_at?: string;
          days?: number[] | null;
          id?: number;
          start_minutes?: Json | null;
          start_time?: string | null;
          uid?: string | null;
          was_sunday?: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: 'fasting_uid_fkey';
            columns: ['uid'];
            isOneToOne: true;
            referencedRelation: 'user';
            referencedColumns: ['id'];
          },
        ];
      };
      fasting_plan: {
        Row: {
          created_at: string | null;
          days: number[];
          start_date: string;
          start_minutes: Json | null;
          start_time: string | null;
          uid: string;
          updated_at: string;
          week_index: number;
        };
        Insert: {
          created_at?: string | null;
          days: number[];
          start_date: string;
          start_minutes?: Json | null;
          start_time?: string | null;
          uid: string;
          updated_at?: string;
          week_index: number;
        };
        Update: {
          created_at?: string | null;
          days?: number[];
          start_date?: string;
          start_minutes?: Json | null;
          start_time?: string | null;
          uid?: string;
          updated_at?: string;
          week_index?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'fasting_plan_uid_fkey';
            columns: ['uid'];
            isOneToOne: false;
            referencedRelation: 'user';
            referencedColumns: ['id'];
          },
        ];
      };
      fasting_result: {
        Row: {
          day: string;
          fasted_minutes: number | null;
          result: string;
          uid: string;
          updated_at: string;
        };
        Insert: {
          day: string;
          fasted_minutes?: number | null;
          result: string;
          uid: string;
          updated_at?: string;
        };
        Update: {
          day?: string;
          fasted_minutes?: number | null;
          result?: string;
          uid?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'fasting_result_uid_fkey';
            columns: ['uid'];
            isOneToOne: false;
            referencedRelation: 'user';
            referencedColumns: ['id'];
          },
        ];
      };
      food_check: {
        Row: {
          alternatives: string[] | null;
          basis: string | null;
          created_at: string;
          id: number;
          image_path: string | null;
          input_text: string | null;
          input_type: string;
          product_name: string | null;
          reasons: string[] | null;
          score: number | null;
          thumb_path: string | null;
          uid: string;
          verdict: string | null;
          week: number | null;
        };
        Insert: {
          alternatives?: string[] | null;
          basis?: string | null;
          created_at?: string;
          id?: number;
          image_path?: string | null;
          input_text?: string | null;
          input_type: string;
          product_name?: string | null;
          reasons?: string[] | null;
          score?: number | null;
          thumb_path?: string | null;
          uid: string;
          verdict?: string | null;
          week?: number | null;
        };
        Update: {
          alternatives?: string[] | null;
          basis?: string | null;
          created_at?: string;
          id?: number;
          image_path?: string | null;
          input_text?: string | null;
          input_type?: string;
          product_name?: string | null;
          reasons?: string[] | null;
          score?: number | null;
          thumb_path?: string | null;
          uid?: string;
          verdict?: string | null;
          week?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'food_check_uid_fkey';
            columns: ['uid'];
            isOneToOne: false;
            referencedRelation: 'user';
            referencedColumns: ['id'];
          },
        ];
      };
      ingredient: {
        Row: {
          ai_reason: string | null;
          created_at: string;
          id: number;
          image_source: string;
          image_url: string;
          is_active: boolean;
          is_carbohydrate: boolean;
          name: string;
          request_id: number | null;
          sort_order: number;
          source: string;
          sub_keywords: string[];
          week: number;
        };
        Insert: {
          ai_reason?: string | null;
          created_at?: string;
          id?: never;
          image_source: string;
          image_url: string;
          is_active?: boolean;
          is_carbohydrate?: boolean;
          name: string;
          request_id?: number | null;
          sort_order: number;
          source: string;
          sub_keywords?: string[];
          week: number;
        };
        Update: {
          ai_reason?: string | null;
          created_at?: string;
          id?: never;
          image_source?: string;
          image_url?: string;
          is_active?: boolean;
          is_carbohydrate?: boolean;
          name?: string;
          request_id?: number | null;
          sort_order?: number;
          source?: string;
          sub_keywords?: string[];
          week?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'ingredient_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'ingredient_request';
            referencedColumns: ['id'];
          },
        ];
      };
      ingredient_request: {
        Row: {
          created_at: string;
          id: number;
          name: string;
          normalized_name: string | null;
          result: Json | null;
          status: string;
          uid: string;
        };
        Insert: {
          created_at?: string;
          id?: never;
          name: string;
          normalized_name?: string | null;
          result?: Json | null;
          status?: string;
          uid?: string;
        };
        Update: {
          created_at?: string;
          id?: never;
          name?: string;
          normalized_name?: string | null;
          result?: Json | null;
          status?: string;
          uid?: string;
        };
        Relationships: [];
      };
      inquiry: {
        Row: {
          answer: string | null;
          category: string | null;
          created_at: string;
          id: number;
          message: string | null;
          status: string | null;
          title: string | null;
          uid: string | null;
        };
        Insert: {
          answer?: string | null;
          category?: string | null;
          created_at?: string;
          id?: number;
          message?: string | null;
          status?: string | null;
          title?: string | null;
          uid?: string | null;
        };
        Update: {
          answer?: string | null;
          category?: string | null;
          created_at?: string;
          id?: number;
          message?: string | null;
          status?: string | null;
          title?: string | null;
          uid?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'inquiry_uid_fkey';
            columns: ['uid'];
            isOneToOne: false;
            referencedRelation: 'user';
            referencedColumns: ['id'];
          },
        ];
      };
      notifications: {
        Row: {
          body: string | null;
          channel_id: string | null;
          created_at: string;
          href: string | null;
          id: number;
          is_read: boolean | null;
          title: string | null;
          type: string | null;
          uid: string | null;
        };
        Insert: {
          body?: string | null;
          channel_id?: string | null;
          created_at?: string;
          href?: string | null;
          id?: number;
          is_read?: boolean | null;
          title?: string | null;
          type?: string | null;
          uid?: string | null;
        };
        Update: {
          body?: string | null;
          channel_id?: string | null;
          created_at?: string;
          href?: string | null;
          id?: number;
          is_read?: boolean | null;
          title?: string | null;
          type?: string | null;
          uid?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_uid_fkey';
            columns: ['uid'];
            isOneToOne: false;
            referencedRelation: 'user';
            referencedColumns: ['id'];
          },
        ];
      };
      pass_purchase: {
        Row: {
          created_at: string;
          granted_from: string | null;
          granted_until: string | null;
          id: number;
          order_id: string | null;
          price_krw: number | null;
          product_id: string;
          purchase_token: string;
          purchased_at: string;
          raw: Json | null;
          status: string;
          uid: string | null;
        };
        Insert: {
          created_at?: string;
          granted_from?: string | null;
          granted_until?: string | null;
          id?: never;
          order_id?: string | null;
          price_krw?: number | null;
          product_id: string;
          purchase_token: string;
          purchased_at: string;
          raw?: Json | null;
          status: string;
          uid?: string | null;
        };
        Update: {
          created_at?: string;
          granted_from?: string | null;
          granted_until?: string | null;
          id?: never;
          order_id?: string | null;
          price_krw?: number | null;
          product_id?: string;
          purchase_token?: string;
          purchased_at?: string;
          raw?: Json | null;
          status?: string;
          uid?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'pass_purchase_uid_fkey';
            columns: ['uid'];
            isOneToOne: false;
            referencedRelation: 'user';
            referencedColumns: ['id'];
          },
        ];
      };
      premium_setting: {
        Row: {
          free_end: string | null;
          free_start: string | null;
          id: number;
        };
        Insert: {
          free_end?: string | null;
          free_start?: string | null;
          id?: number;
        };
        Update: {
          free_end?: string | null;
          free_start?: string | null;
          id?: number;
        };
        Relationships: [];
      };
      recipe: {
        Row: {
          cooking_steps: string | null;
          cooking_time: number | null;
          created_at: string;
          cuisine: string | null;
          id: number;
          image_uri: string | null;
          ingredient_tags: string[];
          ingredients: string | null;
          is_zero_carb: boolean | null;
          method: string | null;
          nutrition: string | null;
          recipe_name: string | null;
          servings: number | null;
          spicy: boolean | null;
          uid: string | null;
          week: number | null;
        };
        Insert: {
          cooking_steps?: string | null;
          cooking_time?: number | null;
          created_at?: string;
          cuisine?: string | null;
          id?: number;
          image_uri?: string | null;
          ingredient_tags?: string[];
          ingredients?: string | null;
          is_zero_carb?: boolean | null;
          method?: string | null;
          nutrition?: string | null;
          recipe_name?: string | null;
          servings?: number | null;
          spicy?: boolean | null;
          uid?: string | null;
          week?: number | null;
        };
        Update: {
          cooking_steps?: string | null;
          cooking_time?: number | null;
          created_at?: string;
          cuisine?: string | null;
          id?: number;
          image_uri?: string | null;
          ingredient_tags?: string[];
          ingredients?: string | null;
          is_zero_carb?: boolean | null;
          method?: string | null;
          nutrition?: string | null;
          recipe_name?: string | null;
          servings?: number | null;
          spicy?: boolean | null;
          uid?: string | null;
          week?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'recipe_uid_fkey';
            columns: ['uid'];
            isOneToOne: false;
            referencedRelation: 'user';
            referencedColumns: ['id'];
          },
        ];
      };
      recipe_duplicate: {
        Row: {
          cooking_steps: string | null;
          cooking_time: number | null;
          created_at: string;
          id: number;
          image_uri: string | null;
          image_uri_backup: string | null;
          ingredients: string | null;
          is_zero_carb: boolean | null;
          nutrition: string | null;
          recipe_name: string | null;
          uid: string | null;
          week: number | null;
        };
        Insert: {
          cooking_steps?: string | null;
          cooking_time?: number | null;
          created_at?: string;
          id?: number;
          image_uri?: string | null;
          image_uri_backup?: string | null;
          ingredients?: string | null;
          is_zero_carb?: boolean | null;
          nutrition?: string | null;
          recipe_name?: string | null;
          uid?: string | null;
          week?: number | null;
        };
        Update: {
          cooking_steps?: string | null;
          cooking_time?: number | null;
          created_at?: string;
          id?: number;
          image_uri?: string | null;
          image_uri_backup?: string | null;
          ingredients?: string | null;
          is_zero_carb?: boolean | null;
          nutrition?: string | null;
          recipe_name?: string | null;
          uid?: string | null;
          week?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'recipe_duplicate_uid_fkey';
            columns: ['uid'];
            isOneToOne: false;
            referencedRelation: 'user';
            referencedColumns: ['id'];
          },
        ];
      };
      saved_recipe: {
        Row: {
          created_at: string;
          id: number;
          recipe_id: number | null;
          uid: string | null;
        };
        Insert: {
          created_at?: string;
          id?: number;
          recipe_id?: number | null;
          uid?: string | null;
        };
        Update: {
          created_at?: string;
          id?: number;
          recipe_id?: number | null;
          uid?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'savedRecipe_recipe_id_fkey';
            columns: ['recipe_id'];
            isOneToOne: false;
            referencedRelation: 'recipe';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'savedRecipe_recipe_id_fkey';
            columns: ['recipe_id'];
            isOneToOne: false;
            referencedRelation: 'recipe_with_is_saved';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'savedRecipe_uid_fkey';
            columns: ['uid'];
            isOneToOne: false;
            referencedRelation: 'user';
            referencedColumns: ['id'];
          },
        ];
      };
      selected_ingredient: {
        Row: {
          created_at: string;
          id: number;
          ingredients: string | null;
          uid: string | null;
          zero_ingredients: string | null;
        };
        Insert: {
          created_at?: string;
          id?: number;
          ingredients?: string | null;
          uid?: string | null;
          zero_ingredients?: string | null;
        };
        Update: {
          created_at?: string;
          id?: number;
          ingredients?: string | null;
          uid?: string | null;
          zero_ingredients?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'selected_ingredient_uid_fkey';
            columns: ['uid'];
            isOneToOne: true;
            referencedRelation: 'user';
            referencedColumns: ['id'];
          },
        ];
      };
      statistics: {
        Row: {
          created_at: string | null;
          day: number | null;
          id: number;
          todo_rate: number;
          uid: string;
          week: number | null;
        };
        Insert: {
          created_at?: string | null;
          day?: number | null;
          id?: number;
          todo_rate?: number;
          uid?: string;
          week?: number | null;
        };
        Update: {
          created_at?: string | null;
          day?: number | null;
          id?: number;
          todo_rate?: number;
          uid?: string;
          week?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'statistics_uid_fkey';
            columns: ['uid'];
            isOneToOne: false;
            referencedRelation: 'user';
            referencedColumns: ['id'];
          },
        ];
      };
      todo: {
        Row: {
          checked_ids: number[] | null;
          created_at: string;
          id: number;
          uid: string;
          updated_at: string | null;
        };
        Insert: {
          checked_ids?: number[] | null;
          created_at?: string;
          id?: number;
          uid?: string;
          updated_at?: string | null;
        };
        Update: {
          checked_ids?: number[] | null;
          created_at?: string;
          id?: number;
          uid?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'todo_uid_fkey';
            columns: ['uid'];
            isOneToOne: true;
            referencedRelation: 'user';
            referencedColumns: ['id'];
          },
        ];
      };
      todo_daily: {
        Row: {
          checked: number[];
          day: string;
          items: string[];
          uid: string;
          updated_at: string;
        };
        Insert: {
          checked: number[];
          day: string;
          items: string[];
          uid: string;
          updated_at?: string;
        };
        Update: {
          checked?: number[];
          day?: string;
          items?: string[];
          uid?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'todo_daily_uid_fkey';
            columns: ['uid'];
            isOneToOne: false;
            referencedRelation: 'user';
            referencedColumns: ['id'];
          },
        ];
      };
      user: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          email: string | null;
          id: string;
          is_onboarded: boolean | null;
          program_start: string | null;
          provider: string | null;
          push_token: string | null;
          start_date: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          is_onboarded?: boolean | null;
          program_start?: string | null;
          provider?: string | null;
          push_token?: string | null;
          start_date?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          is_onboarded?: boolean | null;
          program_start?: string | null;
          provider?: string | null;
          push_token?: string | null;
          start_date?: string | null;
        };
        Relationships: [];
      };
      user_pass: {
        Row: {
          pass_expires_at: string;
          uid: string;
          updated_at: string;
        };
        Insert: {
          pass_expires_at: string;
          uid: string;
          updated_at?: string;
        };
        Update: {
          pass_expires_at?: string;
          uid?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_pass_uid_fkey';
            columns: ['uid'];
            isOneToOne: true;
            referencedRelation: 'user';
            referencedColumns: ['id'];
          },
        ];
      };
      user_recipe_preference: {
        Row: {
          excluded_ingredients: string[];
          uid: string;
          updated_at: string;
        };
        Insert: {
          excluded_ingredients?: string[];
          uid: string;
          updated_at?: string;
        };
        Update: {
          excluded_ingredients?: string[];
          uid?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_recipe_preference_uid_fkey';
            columns: ['uid'];
            isOneToOne: true;
            referencedRelation: 'user';
            referencedColumns: ['id'];
          },
        ];
      };
      user_search_category_history: {
        Row: {
          created_at: string;
          id: number;
          uid: string;
          value: string;
        };
        Insert: {
          created_at?: string;
          id?: number;
          uid?: string;
          value?: string;
        };
        Update: {
          created_at?: string;
          id?: number;
          uid?: string;
          value?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_search_category_history_uid_fkey';
            columns: ['uid'];
            isOneToOne: false;
            referencedRelation: 'user';
            referencedColumns: ['id'];
          },
        ];
      };
      user_search_history: {
        Row: {
          created_at: string;
          id: number;
          uid: string;
          value: string;
        };
        Insert: {
          created_at?: string;
          id?: number;
          uid?: string;
          value?: string;
        };
        Update: {
          created_at?: string;
          id?: number;
          uid?: string;
          value?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_search_history_uid_fkey';
            columns: ['uid'];
            isOneToOne: false;
            referencedRelation: 'user';
            referencedColumns: ['id'];
          },
        ];
      };
      user_setting: {
        Row: {
          uid: string;
          updated_at: string;
          weight_reminder: boolean;
          weight_reminder_asked: boolean;
        };
        Insert: {
          uid: string;
          updated_at?: string;
          weight_reminder?: boolean;
          weight_reminder_asked?: boolean;
        };
        Update: {
          uid?: string;
          updated_at?: string;
          weight_reminder?: boolean;
          weight_reminder_asked?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'user_setting_uid_fkey';
            columns: ['uid'];
            isOneToOne: true;
            referencedRelation: 'user';
            referencedColumns: ['id'];
          },
        ];
      };
      version: {
        Row: {
          created_at: string;
          id: number;
          latest_version: string | null;
        };
        Insert: {
          created_at?: string;
          id?: number;
          latest_version?: string | null;
        };
        Update: {
          created_at?: string;
          id?: number;
          latest_version?: string | null;
        };
        Relationships: [];
      };
      weekly_report: {
        Row: {
          content: Json | null;
          created_at: string;
          start_date: string;
          stats: Json;
          status: string;
          uid: string;
          week_index: number;
        };
        Insert: {
          content?: Json | null;
          created_at?: string;
          start_date: string;
          stats: Json;
          status?: string;
          uid: string;
          week_index: number;
        };
        Update: {
          content?: Json | null;
          created_at?: string;
          start_date?: string;
          stats?: Json;
          status?: string;
          uid?: string;
          week_index?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'weekly_report_uid_fkey';
            columns: ['uid'];
            isOneToOne: false;
            referencedRelation: 'user';
            referencedColumns: ['id'];
          },
        ];
      };
      weight_log: {
        Row: {
          day: string;
          fat_kg: number | null;
          muscle_kg: number | null;
          uid: string;
          updated_at: string;
          weight_kg: number;
        };
        Insert: {
          day: string;
          fat_kg?: number | null;
          muscle_kg?: number | null;
          uid: string;
          updated_at?: string;
          weight_kg: number;
        };
        Update: {
          day?: string;
          fat_kg?: number | null;
          muscle_kg?: number | null;
          uid?: string;
          updated_at?: string;
          weight_kg?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'weight_log_uid_fkey';
            columns: ['uid'];
            isOneToOne: false;
            referencedRelation: 'user';
            referencedColumns: ['id'];
          },
        ];
      };
      weight_reminder_sent: {
        Row: {
          created_at: string;
          day: string;
          uid: string;
        };
        Insert: {
          created_at?: string;
          day: string;
          uid: string;
        };
        Update: {
          created_at?: string;
          day?: string;
          uid?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'weight_reminder_sent_uid_fkey';
            columns: ['uid'];
            isOneToOne: false;
            referencedRelation: 'user';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      popular_categories: {
        Row: {
          count: number | null;
          value: string | null;
        };
        Relationships: [];
      };
      popular_categories_last_24h: {
        Row: {
          count: number | null;
          value: string | null;
        };
        Relationships: [];
      };
      recipe_with_is_saved: {
        Row: {
          cooking_steps: string | null;
          cooking_time: number | null;
          created_at: string | null;
          id: number | null;
          image_uri: string | null;
          ingredients: string | null;
          is_saved: boolean | null;
          is_zero_carb: boolean | null;
          nutrition: string | null;
          recipe_name: string | null;
          saved_at: string | null;
          saved_count: number | null;
          servings: number | null;
          uid: string | null;
          week: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'recipe_uid_fkey';
            columns: ['uid'];
            isOneToOne: false;
            referencedRelation: 'user';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      get_recent_keywords: {
        Args: { uid_input: string };
        Returns: {
          created_at: string;
          id: number;
          uid: string;
          value: string;
        }[];
      };
      get_premium_quota: { Args: { p_feature: string }; Returns: Json };
      get_recipe_quota: { Args: never; Returns: Json };
      has_premium_access: { Args: never; Returns: boolean };
      has_premium_access_for: { Args: { p_uid: string }; Returns: boolean };
      ingredient_request_count_today: {
        Args: { p_uid: string };
        Returns: number;
      };
      raise_pass_expiry: {
        Args: { p_expires_at: string; p_uid: string };
        Returns: string;
      };
      search_recipes: {
        Args: {
          filter_type?: string;
          keyword_input?: string;
          sort_type?: string;
          week_input?: number;
        };
        Returns: {
          cooking_steps: string;
          cooking_time: number;
          created_at: string;
          id: number;
          image_uri: string;
          ingredients: string;
          is_saved: boolean;
          is_zero_carb: boolean;
          nutrition: string;
          recipe_name: string;
          saved_at: string;
          saved_count: number;
          servings: number;
          week: number;
        }[];
      };
      search_saved_recipes: {
        Args: { filter_type?: string; sort_type?: string; week_input?: number };
        Returns: {
          cooking_steps: string;
          cooking_time: number;
          created_at: string;
          id: number;
          image_uri: string;
          ingredients: string;
          is_saved: boolean;
          is_zero_carb: boolean;
          nutrition: string;
          recipe_name: string;
          saved_at: string;
          saved_count: number;
          servings: number;
          uid: string;
          week: number;
        }[];
      };
      weekly_report_candidates: {
        Args: { p_today: string };
        Returns: {
          start_date: string;
          uid: string;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
