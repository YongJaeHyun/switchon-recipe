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
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      fasting: {
        Row: {
          created_at: string
          days: number[] | null
          id: number
          start_time: string | null
          uid: string | null
          was_sunday: boolean | null
        }
        Insert: {
          created_at?: string
          days?: number[] | null
          id?: number
          start_time?: string | null
          uid?: string | null
          was_sunday?: boolean | null
        }
        Update: {
          created_at?: string
          days?: number[] | null
          id?: number
          start_time?: string | null
          uid?: string | null
          was_sunday?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "fasting_uid_fkey"
            columns: ["uid"]
            isOneToOne: true
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry: {
        Row: {
          answer: string | null
          category: string | null
          created_at: string
          id: number
          message: string | null
          status: string | null
          title: string | null
          uid: string | null
        }
        Insert: {
          answer?: string | null
          category?: string | null
          created_at?: string
          id?: number
          message?: string | null
          status?: string | null
          title?: string | null
          uid?: string | null
        }
        Update: {
          answer?: string | null
          category?: string | null
          created_at?: string
          id?: number
          message?: string | null
          status?: string | null
          title?: string | null
          uid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inquiry_uid_fkey"
            columns: ["uid"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          channel_id: string | null
          created_at: string
          href: string | null
          id: number
          is_read: boolean | null
          title: string | null
          type: string | null
          uid: string | null
        }
        Insert: {
          body?: string | null
          channel_id?: string | null
          created_at?: string
          href?: string | null
          id?: number
          is_read?: boolean | null
          title?: string | null
          type?: string | null
          uid?: string | null
        }
        Update: {
          body?: string | null
          channel_id?: string | null
          created_at?: string
          href?: string | null
          id?: number
          is_read?: boolean | null
          title?: string | null
          type?: string | null
          uid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_uid_fkey"
            columns: ["uid"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe: {
        Row: {
          cooking_steps: string | null
          cooking_time: number | null
          created_at: string
          id: number
          image_uri: string | null
          ingredients: string | null
          is_zero_carb: boolean | null
          nutrition: string | null
          recipe_name: string | null
          uid: string | null
          week: number | null
        }
        Insert: {
          cooking_steps?: string | null
          cooking_time?: number | null
          created_at?: string
          id?: number
          image_uri?: string | null
          ingredients?: string | null
          is_zero_carb?: boolean | null
          nutrition?: string | null
          recipe_name?: string | null
          uid?: string | null
          week?: number | null
        }
        Update: {
          cooking_steps?: string | null
          cooking_time?: number | null
          created_at?: string
          id?: number
          image_uri?: string | null
          ingredients?: string | null
          is_zero_carb?: boolean | null
          nutrition?: string | null
          recipe_name?: string | null
          uid?: string | null
          week?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_uid_fkey"
            columns: ["uid"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_recipe: {
        Row: {
          created_at: string
          id: number
          recipe_id: number | null
          uid: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          recipe_id?: number | null
          uid?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          recipe_id?: number | null
          uid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "savedRecipe_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savedRecipe_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe_with_is_saved"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savedRecipe_uid_fkey"
            columns: ["uid"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      selected_ingredient: {
        Row: {
          created_at: string
          id: number
          ingredients: string | null
          uid: string | null
          zero_ingredients: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          ingredients?: string | null
          uid?: string | null
          zero_ingredients?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          ingredients?: string | null
          uid?: string | null
          zero_ingredients?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "selected_ingredient_uid_fkey"
            columns: ["uid"]
            isOneToOne: true
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      statistics: {
        Row: {
          created_at: string | null
          day: number | null
          id: number
          todo_rate: number
          uid: string
          week: number | null
        }
        Insert: {
          created_at?: string | null
          day?: number | null
          id?: number
          todo_rate?: number
          uid?: string
          week?: number | null
        }
        Update: {
          created_at?: string | null
          day?: number | null
          id?: number
          todo_rate?: number
          uid?: string
          week?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "statistics_uid_fkey"
            columns: ["uid"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      todo: {
        Row: {
          checked_ids: number[] | null
          created_at: string
          id: number
          uid: string
          updated_at: string | null
        }
        Insert: {
          checked_ids?: number[] | null
          created_at?: string
          id?: number
          uid?: string
          updated_at?: string | null
        }
        Update: {
          checked_ids?: number[] | null
          created_at?: string
          id?: number
          uid?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "todo_uid_fkey"
            columns: ["uid"]
            isOneToOne: true
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      user: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          id: string
          is_onboarded: boolean | null
          provider: string | null
          push_token: string | null
          start_date: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_onboarded?: boolean | null
          provider?: string | null
          push_token?: string | null
          start_date?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_onboarded?: boolean | null
          provider?: string | null
          push_token?: string | null
          start_date?: string | null
        }
        Relationships: []
      }
      user_search_category_history: {
        Row: {
          created_at: string
          id: number
          uid: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: number
          uid?: string
          value?: string
        }
        Update: {
          created_at?: string
          id?: number
          uid?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_search_category_history_uid_fkey"
            columns: ["uid"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      user_search_history: {
        Row: {
          created_at: string
          id: number
          uid: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: number
          uid?: string
          value?: string
        }
        Update: {
          created_at?: string
          id?: number
          uid?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_search_history_uid_fkey"
            columns: ["uid"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      version: {
        Row: {
          created_at: string
          id: number
          latest_version: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          latest_version?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          latest_version?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      popular_categories: {
        Row: {
          count: number | null
          value: string | null
        }
        Relationships: []
      }
      popular_categories_last_24h: {
        Row: {
          count: number | null
          value: string | null
        }
        Relationships: []
      }
      recipe_with_is_saved: {
        Row: {
          cooking_steps: string | null
          cooking_time: number | null
          created_at: string | null
          id: number | null
          image_uri: string | null
          ingredients: string | null
          is_saved: boolean | null
          is_zero_carb: boolean | null
          nutrition: string | null
          recipe_name: string | null
          saved_at: string | null
          saved_count: number | null
          uid: string | null
          week: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_uid_fkey"
            columns: ["uid"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      get_recent_keywords: {
        Args: { uid_input: string }
        Returns: {
          created_at: string
          id: number
          uid: string
          value: string
        }[]
      }
      search_recipes: {
        Args: {
          filter_type?: string
          keyword_input?: string
          sort_type?: string
          week_input?: number
        }
        Returns: {
          cooking_steps: string
          cooking_time: number
          created_at: string
          id: number
          image_uri: string
          ingredients: string
          is_saved: boolean
          is_zero_carb: boolean
          nutrition: string
          recipe_name: string
          saved_at: string
          saved_count: number
          week: number
        }[]
      }
      search_saved_recipes: {
        Args: { filter_type?: string; sort_type?: string; week_input?: number }
        Returns: {
          cooking_steps: string
          cooking_time: number
          created_at: string
          id: number
          image_uri: string
          ingredients: string
          is_saved: boolean
          is_zero_carb: boolean
          nutrition: string
          recipe_name: string
          saved_at: string
          saved_count: number
          week: number
        }[]
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
