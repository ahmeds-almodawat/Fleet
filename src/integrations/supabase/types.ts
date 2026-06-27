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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      attachments: {
        Row: {
          entity_id: string
          entity_type: string
          file_url: string
          id: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          entity_id: string
          entity_type: string
          file_url: string
          id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          entity_id?: string
          entity_typ          anomaly_distance_threshold_km?: number | null
          approvals_required?: boolean
          created_at?: string
          current_odometer?: number
          department_id?: string | null
          id?: string
          image_url?: string | null
          insurance_document_url?: string | null
          insurance_end_date?: string | null
          insurance_policy_no?: string | null
          insurance_start_date?: string | null
          registration_document_url?: string | null
          registration_end_date?: string | null
          registration_no?: string | null
          registration_start_date?: string | null
          notes?: string | null
          plate_no: string
          status?: string
          updated_at?: string
          vehicle_code: string
          vehicle_type_id?: string | nullRow: {
          key: string
          value: Json
          updated_at: string
        }
        Insert: {
          key: string
          value?: Json
          updated_at?: string
        }
        Update: {
          key?: string
          value?: Json
          updated_at?: string
        }
        Relationships: []
      }
      departments: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      destinations: {
        Row: {
          active: boolean
          category: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          category?: string | null
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      maintenance_types: {
        Row: {
          active: boolean
          created_at: string
          default_interval_days: number | null
          default_interval_km: number | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_interval_days?: number | null
          default_interval_km?: number | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_interval_days?: number | null
          default_interval_km?: number | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      permissions: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          key: string
          name: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          id?: string
          key: string
          name: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          department_id: string | null
          id: string
          job_title: string
          name_ar: string
          name_en: string
          phone: string | null
          staff_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          department_id?: string | null
          id: string
          job_title: string
          name_ar: string
          name_en: string
          phone?: string | null
          staff_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          department_id?: string | null
          id?: string
          job_title?: string
          name_ar?: string
          name_en?: string
          phone?: string | null
          staff_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          description: string | null
          id: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      trip_actions: {
        Row: {
          action: Database["public"]["Enums"]["trip_action_type"]
          actor_user_id: string | null
          comment: string | null
          created_at: string
          id: string
          metadata_json: Json | null
          trip_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["trip_action_type"]
          actor_user_id?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          metadata_json?: Json | null
          trip_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["trip_action_type"]
          actor_user_id?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          metadata_json?: Json | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_actions_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_actions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          anomaly_flag: boolean | null
          anomaly_reason: string | null
          approved_at: string | null
          approved_by_user_id: string | null
          closed_at: string | null
          created_at: string
          department_id: string | null
          destination_id: string | null
          destination_text: string
          distance_km: number | null
          driver_user_id: string
          end_fuel_level: string | null
          end_odometer_photo_url: string | null
          end_odometer_value: number | null
          id: string
          job_order_no: string | null
          purpose: string | null
          reject_reason: string | null
          rejected_at: string | null
          rejected_by_user_id: string | null
          requested_at: string
          start_fuel_level: string | null
          start_odometer_photo_url: string
          start_odometer_value: number
          status: Database["public"]["Enums"]["trip_status"]
          trip_no: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          anomaly_flag?: boolean | null
          anomaly_reason?: string | null
          approved_at?: string | null
          approved_by_user_id?: string | null
          closed_at?: string | null
          created_at?: string
          department_id?: string | null
          destination_id?: string | null
          destination_text: string
          distance_km?: number | null
          driver_user_id: string
          end_fuel_level?: string | null
          end_odometer_photo_url?: string | null
          end_odometer_value?: number | null
          id?: string
          job_order_no?: string | null
          purpose?: string | null
          reject_reason?: string | null
          rejected_at?: string | null
          rejected_by_user_id?: string | null
          requested_at?: string
          start_fuel_level?: string | null
          start_odometer_photo_url: string
          start_odometer_value: number
          status?: Database["public"]["Enums"]["trip_status"]
          trip_no: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          anomaly_flag?: boolean | null
          anomaly_reason?: string | null
          approved_at?: string | null
          approved_by_user_id?: string | null
          closed_at?: string | null
          created_at?: string
          department_id?: string | null
          destination_id?: string | null
          destination_text?: string
          distance_km?: number | null
          driver_user_id?: string
          end_fuel_level?: string | null
          end_odometer_photo_url?: string | null
          end_odometer_value?: number | null
          id?: string
          job_order_no?: string | null
          purpose?: string | null
          reject_reason?: string | null
          rejected_at?: string | null
          rejected_by_user_id?: string | null
          requested_at?: string
          start_fuel_level?: string | null
          start_odometer_photo_url?: string
          start_odometer_value?: number
          status?: Database["public"]["Enums"]["trip_status"]
          trip_no?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_approved_by_user_id_fkey"
            columns: ["approved_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_driver_user_id_fkey"
            columns: ["driver_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_rejected_by_user_id_fkey"
            columns: ["rejected_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_maintenance: {
        Row: {
          completed_date: string | null
          completed_odometer: number | null
          cost: number | null
          created_at: string
          created_by: string | null
          custom_type_name: string | null
          description: string | null
          id: string
          maintenance_type_id: string | null
          notes: string | null
          reminder_sent: boolean
          scheduled_date: string | null
          scheduled_odometer: number | null
          status: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          completed_date?: string | null
          completed_odometer?: number | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          custom_type_name?: string | null
          description?: string | null
          id?: string
          maintenance_type_id?: string | null
          notes?: string | null
          reminder_sent?: boolean
          scheduled_date?: string | null
          scheduled_odometer?: number | null
          status?: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          completed_date?: string | null
          completed_odometer?: number | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          custom_type_name?: string | null
          description?: string | null
          id?: string
          maintenance_type_id?: string | null
          notes?: string | null
          reminder_sent?: boolean
          scheduled_date?: string | null
          scheduled_odometer?: number | null
          status?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_maintenance_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_maintenance_maintenance_type_id_fkey"
            columns: ["maintenance_type_id"]
            isOneToOne: false
            referencedRelation: "maintenance_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_maintenance_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_types: {
        Row: {
          active: boolean
          created_at: string
          default_anomaly_distance_threshold_km: number | null
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_anomaly_distance_threshold_km?: number | null
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_anomaly_distance_threshold_km?: number | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          anomaly_distance_threshold_km: number | null
          approvals_required: boolean
          created_at: string
          current_odometer: number
          department_id: string | null
          id: string
          image_url: string | null
          insurance_document_url: string | null
          insurance_end_date: string | null
          insurance_policy_no: string | null
          insurance_start_date: string | null
          registration_document_url: string | null
          registration_end_date: string | null
          registration_no: string | null
          registration_start_date: string | null
          notes: string | null
          plate_no: string
          status: string
          updated_at: string
          vehicle_code: string
          vehicle_type_id: string | null
        }
        Insert: {
          anomaly_distance_threshold_km?: number | null
          approvals_required?: boolean
          created_at?: string
          current_odometer?: number
          department_id?: string | null
          id?: string
          image_url?: string | null
          insurance_document_url?: string | null
          insurance_end_date?: string | null
          insurance_policy_no?: string | null
          insurance_start_date?: string | null
          registration_document_url?: string | null
          registration_end_date?: string | null
          registration_no?: string | null
          registration_start_date?: string | null
          notes?: string | null
          plate_no: string
          status?: string
          updated_at?: string
          vehicle_code: string
          vehicle_type_id?: string | null
        }
        Update: {
          anomaly_distance_threshold_km?: number | null
          approvals_required?: boolean
          created_at?: string
          current_odometer?: number
          department_id?: string | null
          id?: string
          image_url?: string | null
          insurance_document_url?: string | null
          insurance_end_date?: string | null
          insurance_policy_no?: string | null
          insurance_start_date?: string | null
          registration_document_url?: string | null
          registration_end_date?: string | null
          registration_no?: string | null
          registration_start_date?: string | null
          notes?: string | null
          plate_no?: string
          status?: string
          updated_at?: string
          vehicle_code?: string
          vehicle_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_vehicle_type_id_fkey"
            columns: ["vehicle_type_id"]
            isOneToOne: false
            referencedRelation: "vehicle_types"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_permissions: {
        Args: { _user_id: string }
        Returns: {
          permission_key: string
        }[]
      }
      user_has_permission: {
        Args: { _permission_key: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      trip_action_type:
        | "Create"
        | "Submit"
        | "Approve"
        | "Reject"
        | "Start"
        | "Close"
        | "Reopen"
        | "Review"
        | "Edit"
      trip_status:
        | "Draft"
        | "PendingApproval"
        | "Approved"
        | "Active"
        | "Rejected"
        | "Closed"
        | "Reviewed"
        | "Cancelled"
        | "Reopened"
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
      trip_action_type: [
        "Create",
        "Submit",
        "Approve",
        "Reject",
        "Start",
        "Close",
        "Reopen",
        "Review",
        "Edit",
      ],
      trip_status: [
        "Draft",
        "PendingApproval",
        "Approved",
        "Active",
        "Rejected",
        "Closed",
        "Reviewed",
        "Cancelled",
        "Reopened",
      ],
    },
  },
} as const
