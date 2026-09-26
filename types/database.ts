/**
 * Auto-generated Supabase types from schema
 * Generated from migrations: 0001_init.sql, 0002_queue_functions.sql
 * 
 * To regenerate after schema changes, run:
 *   supabase gen types typescript --project-id <PROJECT_ID> > types/database.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      queue_entries: {
        Row: {
          id: string
          queue_number: number
          queue_date: string
          telegram_chat_id: number
          client_name: string | null
          client_phone: string | null
          service_id: string | null
          status: 'waiting' | 'in_service' | 'completed' | 'skipped' | 'cancelled'
          notified_close: boolean
          notified_next: boolean
          notification_error: string | null
          notified_promoted: boolean
          notified_terminal: boolean
          notified_cancelled: boolean
          notified_skipped: boolean
          notified_completed: boolean
          joined_at: string
          started_at: string | null
          completed_at: string | null
        }
        Insert: {
          id?: string
          queue_number: number
          queue_date?: string
          telegram_chat_id: number
          client_name?: string | null
          client_phone?: string | null
          service_id?: string | null
          status?: 'waiting' | 'in_service' | 'completed' | 'skipped' | 'cancelled'
          notified_close?: boolean
          notified_next?: boolean
          notification_error?: string | null
          notified_promoted?: boolean
          notified_terminal?: boolean
          notified_cancelled?: boolean
          notified_skipped?: boolean
          notified_completed?: boolean
          joined_at?: string
          started_at?: string | null
          completed_at?: string | null
        }
        Update: {
          id?: string
          queue_number?: number
          queue_date?: string
          telegram_chat_id?: number
          client_name?: string | null
          client_phone?: string | null
          service_id?: string | null
          status?: 'waiting' | 'in_service' | 'completed' | 'skipped' | 'cancelled'
          notified_close?: boolean
          notified_next?: boolean
          notification_error?: string | null
          notified_promoted?: boolean
          notified_terminal?: boolean
          notified_cancelled?: boolean
          notified_skipped?: boolean
          notified_completed?: boolean
          joined_at?: string
          started_at?: string | null
          completed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "queue_entries_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          id: string
          name: string
          name_am: string | null
          is_active: boolean
          sort_order: number
        }
        Insert: {
          id?: string
          name: string
          name_am?: string | null
          is_active?: boolean
          sort_order?: number
        }
        Update: {
          id?: string
          name?: string
          name_am?: string | null
          is_active?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      bot_users: {
        Row: {
          telegram_chat_id: number
          language: 'am' | 'en'
          created_at: string
        }
        Insert: {
          telegram_chat_id: number
          language: 'am' | 'en'
          created_at?: string
        }
        Update: {
          telegram_chat_id?: number
          language?: 'am' | 'en'
          created_at?: string
        }
        Relationships: []
      }
      shop_state: {
        Row: {
          id: boolean
          accepting_queue: boolean
        }
        Insert: {
          id?: boolean
          accepting_queue?: boolean
        }
        Update: {
          id?: boolean
          accepting_queue?: boolean
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      assign_queue_number: {
        Args: {
          p_queue_date: string
          p_telegram_chat_id: number
          p_client_name: string
          p_client_phone: string
          p_service_id: string
        }
        Returns: Json
      }
      start_service: {
        Args: { p_queue_date: string }
        Returns: Json
      }
      advance_queue: {
        Args: {
          p_queue_date: string
          p_current_entry_id: string
          p_new_status: string
        }
        Returns: Json
      }
      toggle_accepting_queue: {
        Args: Record<string, never>
        Returns: Json
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    ? PublicTableNameOrOptions
    : PublicTableNameOrOptions extends { schema: keyof Database }
      ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
          Database[PublicTableNameOrOptions["schema"]]["Views"])
      : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] & {
      Schema: PublicTableNameOrOptions["schema"]
    }
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] & PublicSchema["Views"])[PublicTableNameOrOptions] & {
        Schema: "public"
      }
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    ? PublicTableNameOrOptions
    : PublicTableNameOrOptions extends { schema: keyof Database }
      ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
      : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    ? PublicTableNameOrOptions
    : PublicTableNameOrOptions extends { schema: keyof Database }
      ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
      : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
      ? PublicEnumNameOrOptions
      : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never
