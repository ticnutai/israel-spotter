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
      documents: {
        Row: {
          category: string
          doc_date: string | null
          downloaded_at: string | null
          file_name: string | null
          file_path: string
          file_size: number | null
          file_type: string | null
          gush: number
          helka: number
          id: number
          is_georef: number | null
          is_takanon: number | null
          is_tashrit: number | null
          plan_number: string | null
          subcategory: string | null
          title: string
        }
        Insert: {
          category: string
          doc_date?: string | null
          downloaded_at?: string | null
          file_name?: string | null
          file_path: string
          file_size?: number | null
          file_type?: string | null
          gush: number
          helka: number
          id?: number
          is_georef?: number | null
          is_takanon?: number | null
          is_tashrit?: number | null
          plan_number?: string | null
          subcategory?: string | null
          title: string
        }
        Update: {
          category?: string
          doc_date?: string | null
          downloaded_at?: string | null
          file_name?: string | null
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          gush?: number
          helka?: number
          id?: number
          is_georef?: number | null
          is_takanon?: number | null
          is_tashrit?: number | null
          plan_number?: string | null
          subcategory?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_gush_fkey"
            columns: ["gush"]
            isOneToOne: false
            referencedRelation: "gushim"
            referencedColumns: ["gush"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          gush: number
          helka: number
          id: string
          label: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          gush: number
          helka: number
          id?: string
          label?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          gush?: number
          helka?: number
          id?: string
          label?: string | null
          user_id?: string
        }
        Relationships: []
      }
      gis_layers: {
        Row: {
          created_at: string
          file_path: string
          file_type: string
          geojson: Json | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          file_path: string
          file_type: string
          geojson?: Json | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          file_path?: string
          file_type?: string
          geojson?: Json | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      gushim: {
        Row: {
          area_type: string | null
          gush: number
          name: string | null
          notes: string | null
          parcel_count: number | null
          permit_count: number | null
          plan_count: number | null
        }
        Insert: {
          area_type?: string | null
          gush: number
          name?: string | null
          notes?: string | null
          parcel_count?: number | null
          permit_count?: number | null
          plan_count?: number | null
        }
        Update: {
          area_type?: string | null
          gush?: number
          name?: string | null
          notes?: string | null
          parcel_count?: number | null
          permit_count?: number | null
          plan_count?: number | null
        }
        Relationships: []
      }
      parcels: {
        Row: {
          centroid_lat: number | null
          centroid_lng: number | null
          county: string | null
          county_code: number | null
          doc_count: number | null
          gush: number
          gush_suffix: string | null
          has_tashrit: number | null
          helka: number
          id: number
          legal_area_sqm: number | null
          locality_code: number | null
          municipality: string | null
          municipality_code: number | null
          notes: string | null
          permit_count: number | null
          plan_count: number | null
          region: string | null
          region_code: number | null
          shape_area_sqm: number | null
          status_code: number | null
          status_text: string | null
          update_date: string | null
        }
        Insert: {
          centroid_lat?: number | null
          centroid_lng?: number | null
          county?: string | null
          county_code?: number | null
          doc_count?: number | null
          gush: number
          gush_suffix?: string | null
          has_tashrit?: number | null
          helka: number
          id?: number
          legal_area_sqm?: number | null
          locality_code?: number | null
          municipality?: string | null
          municipality_code?: number | null
          notes?: string | null
          permit_count?: number | null
          plan_count?: number | null
          region?: string | null
          region_code?: number | null
          shape_area_sqm?: number | null
          status_code?: number | null
          status_text?: string | null
          update_date?: string | null
        }
        Update: {
          centroid_lat?: number | null
          centroid_lng?: number | null
          county?: string | null
          county_code?: number | null
          doc_count?: number | null
          gush?: number
          gush_suffix?: string | null
          has_tashrit?: number | null
          helka?: number
          id?: number
          legal_area_sqm?: number | null
          locality_code?: number | null
          municipality?: string | null
          municipality_code?: number | null
          notes?: string | null
          permit_count?: number | null
          plan_count?: number | null
          region?: string | null
          region_code?: number | null
          shape_area_sqm?: number | null
          status_code?: number | null
          status_text?: string | null
          update_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parcels_gush_fkey"
            columns: ["gush"]
            isOneToOne: false
            referencedRelation: "gushim"
            referencedColumns: ["gush"]
          },
        ]
      }
      permit_documents: {
        Row: {
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: number
          permit_id: number
        }
        Insert: {
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: number
          permit_id: number
        }
        Update: {
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: number
          permit_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "permit_documents_permit_id_fkey"
            columns: ["permit_id"]
            isOneToOne: false
            referencedRelation: "permits"
            referencedColumns: ["id"]
          },
        ]
      }
      permits: {
        Row: {
          file_count: number | null
          gush: number
          helka: number
          id: number
          permit_id: string
        }
        Insert: {
          file_count?: number | null
          gush: number
          helka: number
          id?: number
          permit_id: string
        }
        Update: {
          file_count?: number | null
          gush?: number
          helka?: number
          id?: number
          permit_id?: string
        }
        Relationships: []
      }
      plan_blocks: {
        Row: {
          block_type: string | null
          gush: number
          helka: number | null
          id: number
          is_partial: number | null
          plan_number: string
        }
        Insert: {
          block_type?: string | null
          gush: number
          helka?: number | null
          id?: number
          is_partial?: number | null
          plan_number: string
        }
        Update: {
          block_type?: string | null
          gush?: number
          helka?: number | null
          id?: number
          is_partial?: number | null
          plan_number?: string
        }
        Relationships: []
      }
      plan_georef: {
        Row: {
          bbox_max_x: number | null
          bbox_max_y: number | null
          bbox_min_x: number | null
          bbox_min_y: number | null
          crs: string | null
          document_id: number | null
          id: number
          image_path: string
          method: string | null
          notes: string | null
          origin_x: number | null
          origin_y: number | null
          pixel_size_x: number | null
          pixel_size_y: number | null
        }
        Insert: {
          bbox_max_x?: number | null
          bbox_max_y?: number | null
          bbox_min_x?: number | null
          bbox_min_y?: number | null
          crs?: string | null
          document_id?: number | null
          id?: number
          image_path: string
          method?: string | null
          notes?: string | null
          origin_x?: number | null
          origin_y?: number | null
          pixel_size_x?: number | null
          pixel_size_y?: number | null
        }
        Update: {
          bbox_max_x?: number | null
          bbox_max_y?: number | null
          bbox_min_x?: number | null
          bbox_min_y?: number | null
          crs?: string | null
          document_id?: number | null
          id?: number
          image_path?: string
          method?: string | null
          notes?: string | null
          origin_x?: number | null
          origin_y?: number | null
          pixel_size_x?: number | null
          pixel_size_y?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_georef_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          area_dunam: number | null
          authority: string | null
          city_county: string | null
          data_json_path: string | null
          district: string | null
          doc_count: number | null
          entity_subtype: string | null
          entity_type: string | null
          goals: string | null
          gush_list: string | null
          has_plan_data: number | null
          house_number: string | null
          id: number
          jurisdiction: string | null
          location_desc: string | null
          main_status: string | null
          mp_id: number | null
          notes: string | null
          phase: string | null
          plan_area: string | null
          plan_id: number | null
          plan_name: string | null
          plan_number: string
          plan_type: string | null
          status: string | null
          status_date: string | null
          street: string | null
        }
        Insert: {
          area_dunam?: number | null
          authority?: string | null
          city_county?: string | null
          data_json_path?: string | null
          district?: string | null
          doc_count?: number | null
          entity_subtype?: string | null
          entity_type?: string | null
          goals?: string | null
          gush_list?: string | null
          has_plan_data?: number | null
          house_number?: string | null
          id?: number
          jurisdiction?: string | null
          location_desc?: string | null
          main_status?: string | null
          mp_id?: number | null
          notes?: string | null
          phase?: string | null
          plan_area?: string | null
          plan_id?: number | null
          plan_name?: string | null
          plan_number: string
          plan_type?: string | null
          status?: string | null
          status_date?: string | null
          street?: string | null
        }
        Update: {
          area_dunam?: number | null
          authority?: string | null
          city_county?: string | null
          data_json_path?: string | null
          district?: string | null
          doc_count?: number | null
          entity_subtype?: string | null
          entity_type?: string | null
          goals?: string | null
          gush_list?: string | null
          has_plan_data?: number | null
          house_number?: string | null
          id?: number
          jurisdiction?: string | null
          location_desc?: string | null
          main_status?: string | null
          mp_id?: number | null
          notes?: string | null
          phase?: string | null
          plan_area?: string | null
          plan_id?: number | null
          plan_name?: string | null
          plan_number?: string
          plan_type?: string | null
          status?: string | null
          status_date?: string | null
          street?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      taba_outlines: {
        Row: {
          area_dunam: number | null
          depositing_date: string | null
          district: string | null
          entity_subtype: string | null
          geometry_json: string | null
          id: number
          jurisdiction: string | null
          land_use: string | null
          last_update: string | null
          mp_id: number | null
          objectid: number | null
          pl_name: string | null
          pl_number: string | null
          pl_url: string | null
          plan_county: string | null
          properties_json: string | null
          status: string | null
        }
        Insert: {
          area_dunam?: number | null
          depositing_date?: string | null
          district?: string | null
          entity_subtype?: string | null
          geometry_json?: string | null
          id?: number
          jurisdiction?: string | null
          land_use?: string | null
          last_update?: string | null
          mp_id?: number | null
          objectid?: number | null
          pl_name?: string | null
          pl_number?: string | null
          pl_url?: string | null
          plan_county?: string | null
          properties_json?: string | null
          status?: string | null
        }
        Update: {
          area_dunam?: number | null
          depositing_date?: string | null
          district?: string | null
          entity_subtype?: string | null
          geometry_json?: string | null
          id?: number
          jurisdiction?: string | null
          land_use?: string | null
          last_update?: string | null
          mp_id?: number | null
          objectid?: number | null
          pl_name?: string | null
          pl_number?: string | null
          pl_url?: string | null
          plan_county?: string | null
          properties_json?: string | null
          status?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      watch_parcels: {
        Row: {
          created_at: string
          gush: number
          helka: number
          id: string
          notify_email: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          gush: number
          helka: number
          id?: string
          notify_email?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          gush?: number
          helka?: number
          id?: string
          notify_email?: boolean
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
