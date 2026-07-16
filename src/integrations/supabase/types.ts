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
      fedex_payout: {
        Row: {
          finish_position: number
          points: number
        }
        Insert: {
          finish_position: number
          points: number
        }
        Update: {
          finish_position?: number
          points?: number
        }
        Relationships: []
      }
      golfers: {
        Row: {
          created_at: string
          dg_player_id: string | null
          id: string
          is_active: boolean
          name: string
          salary: number
          tournament_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          dg_player_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          salary?: number
          tournament_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          dg_player_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          salary?: number
          tournament_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      league_members: {
        Row: {
          joined_at: string
          league_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          league_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          league_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_members_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          created_at: string
          created_by: string
          id: string
          invite_code: string
          max_players: number
          name: string
          salary_cap: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          invite_code: string
          max_players?: number
          name: string
          salary_cap?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          invite_code?: string
          max_players?: number
          name?: string
          salary_cap?: number
          updated_at?: string
        }
        Relationships: []
      }
      lineup_entries: {
        Row: {
          created_at: string
          golfer_id: string
          lineup_id: string
        }
        Insert: {
          created_at?: string
          golfer_id: string
          lineup_id: string
        }
        Update: {
          created_at?: string
          golfer_id?: string
          lineup_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lineup_entries_golfer_id_fkey"
            columns: ["golfer_id"]
            isOneToOne: false
            referencedRelation: "golfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineup_entries_lineup_id_fkey"
            columns: ["lineup_id"]
            isOneToOne: false
            referencedRelation: "lineups"
            referencedColumns: ["id"]
          },
        ]
      }
      lineups: {
        Row: {
          created_at: string
          id: string
          league_id: string
          total_points: number
          total_spent: number
          tournament_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          league_id: string
          total_points?: number
          total_spent?: number
          tournament_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          league_id?: string
          total_points?: number
          total_spent?: number
          tournament_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lineups_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineups_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      player_prices: {
        Row: {
          created_at: string
          decimal_odds: number | null
          golfer_id: string
          implied_prob: number | null
          salary: number
          tournament_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decimal_odds?: number | null
          golfer_id: string
          implied_prob?: number | null
          salary?: number
          tournament_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decimal_odds?: number | null
          golfer_id?: string
          implied_prob?: number | null
          salary?: number
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_prices_golfer_id_fkey"
            columns: ["golfer_id"]
            isOneToOne: false
            referencedRelation: "golfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_prices_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      player_results: {
        Row: {
          birdies: number
          created_at: string
          eagles: number
          fantasy_points: number
          golfer_id: string
          made_cut: boolean
          position: number | null
          rounds: Json
          status: string | null
          total_to_par: number | null
          tournament_id: string
          updated_at: string
        }
        Insert: {
          birdies?: number
          created_at?: string
          eagles?: number
          fantasy_points?: number
          golfer_id: string
          made_cut?: boolean
          position?: number | null
          rounds?: Json
          status?: string | null
          total_to_par?: number | null
          tournament_id: string
          updated_at?: string
        }
        Update: {
          birdies?: number
          created_at?: string
          eagles?: number
          fantasy_points?: number
          golfer_id?: string
          made_cut?: boolean
          position?: number | null
          rounds?: Json
          status?: string | null
          total_to_par?: number | null
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_results_golfer_id_fkey"
            columns: ["golfer_id"]
            isOneToOne: false
            referencedRelation: "golfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_results_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          is_admin: boolean
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          is_admin?: boolean
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_admin?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      season_standings: {
        Row: {
          events_played: number
          fedex_points: number
          league_id: string
          season_year: number
          updated_at: string
          user_id: string
        }
        Insert: {
          events_played?: number
          fedex_points?: number
          league_id: string
          season_year: number
          updated_at?: string
          user_id: string
        }
        Update: {
          events_played?: number
          fedex_points?: number
          league_id?: string
          season_year?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "season_standings_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          created_at: string
          dg_event_id: string
          end_date: string | null
          event_type: Database["public"]["Enums"]["tournament_event_type"]
          fedex_multiplier: number
          id: string
          lineup_lock_at: string | null
          name: string
          season_year: number
          start_date: string | null
          status: Database["public"]["Enums"]["tournament_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          dg_event_id: string
          end_date?: string | null
          event_type?: Database["public"]["Enums"]["tournament_event_type"]
          fedex_multiplier?: number
          id?: string
          lineup_lock_at?: string | null
          name: string
          season_year: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["tournament_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          dg_event_id?: string
          end_date?: string | null
          event_type?: Database["public"]["Enums"]["tournament_event_type"]
          fedex_multiplier?: number
          id?: string
          lineup_lock_at?: string | null
          name?: string
          season_year?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["tournament_status"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      compute_fantasy_points: {
        Args: {
          _birdies: number
          _eagles: number
          _made_cut: boolean
          _position: number | null
          _total_to_par: number | null
        }
        Returns: number
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_league_member: {
        Args: { _league_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      tournament_event_type: "standard" | "signature" | "major"
      tournament_status: "scheduled" | "open" | "in_progress" | "completed"
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
      tournament_event_type: ["standard", "signature", "major"],
      tournament_status: ["scheduled", "open", "in_progress", "completed"],
    },
  },
} as const
