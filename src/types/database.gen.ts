export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      clothing_items: {
        Row: {
          created_at: string;
          group_id: string;
          id: string;
          retention_deadline: string;
          storage_path: string;
          title: string;
          uploader_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          group_id: string;
          id?: string;
          retention_deadline?: string;
          storage_path: string;
          title?: string;
          uploader_id: string;
        };
        Update: {
          created_at?: string;
          group_id?: string;
          id?: string;
          retention_deadline?: string;
          storage_path?: string;
          title?: string;
          uploader_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clothing_items_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "clothing_items_uploader_id_fkey";
            columns: ["uploader_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      group_feed_state: {
        Row: {
          group_id: string;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          group_id: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          group_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "group_feed_state_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: true;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
        ];
      };
      group_members: {
        Row: {
          group_id: string;
          joined_at: string;
          muted: boolean;
          role: Database["public"]["Enums"]["membership_role"];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          group_id: string;
          joined_at?: string;
          muted?: boolean;
          role?: Database["public"]["Enums"]["membership_role"];
          user_id: string;
        };
        Update: {
          group_id?: string;
          joined_at?: string;
          muted?: boolean;
          role?: Database["public"]["Enums"]["membership_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "group_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      groups: {
        Row: {
          created_at: string;
          id: string;
          members_can_upload: boolean;
          name: string;
          owner_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          members_can_upload?: boolean;
          name: string;
          owner_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          members_can_upload?: boolean;
          name?: string;
          owner_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "groups_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      invitations: {
        Row: {
          created_at: string;
          created_by: string;
          expires_at: string;
          group_id: string;
          id: string;
          redeemed_at: string | null;
          redeemed_by: string | null;
          revoked_at: string | null;
          token_hash: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by: string;
          expires_at: string;
          group_id: string;
          id?: string;
          redeemed_at?: string | null;
          redeemed_by?: string | null;
          revoked_at?: string | null;
          token_hash: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          expires_at?: string;
          group_id?: string;
          id?: string;
          redeemed_at?: string | null;
          redeemed_by?: string | null;
          revoked_at?: string | null;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invitations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_redeemed_by_fkey";
            columns: ["redeemed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      membership_requests: {
        Row: {
          created_at: string;
          group_id: string;
          id: string;
          invitation_id: string | null;
          message: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: Database["public"]["Enums"]["request_status"];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          group_id: string;
          id?: string;
          invitation_id?: string | null;
          message?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["request_status"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          group_id?: string;
          id?: string;
          invitation_id?: string | null;
          message?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["request_status"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "membership_requests_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "membership_requests_invitation_id_fkey";
            columns: ["invitation_id"];
            isOneToOne: false;
            referencedRelation: "invitations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "membership_requests_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "membership_requests_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          actor_id: string | null;
          created_at: string;
          group_id: string | null;
          id: string;
          item_id: string | null;
          kind: Database["public"]["Enums"]["notification_kind"];
          read_at: string | null;
          request_id: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          actor_id?: string | null;
          created_at?: string;
          group_id?: string | null;
          id?: string;
          item_id?: string | null;
          kind: Database["public"]["Enums"]["notification_kind"];
          read_at?: string | null;
          request_id?: string | null;
          user_id: string;
        };
        Update: {
          actor_id?: string | null;
          created_at?: string;
          group_id?: string | null;
          id?: string;
          item_id?: string | null;
          kind?: Database["public"]["Enums"]["notification_kind"];
          read_at?: string | null;
          request_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "clothing_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "membership_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string;
          id: string;
          muted_kinds: Database["public"]["Enums"]["notification_kind"][];
          tier: Database["public"]["Enums"]["account_tier"];
          tier_granted_at: string | null;
          tier_note: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          display_name: string;
          id: string;
          muted_kinds?: Database["public"]["Enums"]["notification_kind"][];
          tier?: Database["public"]["Enums"]["account_tier"];
          tier_granted_at?: string | null;
          tier_note?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          id?: string;
          muted_kinds?: Database["public"]["Enums"]["notification_kind"][];
          tier?: Database["public"]["Enums"]["account_tier"];
          tier_granted_at?: string | null;
          tier_note?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      votes: {
        Row: {
          created_at: string;
          item_id: string;
          updated_at: string;
          vote: Database["public"]["Enums"]["vote_type"];
          voter_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          item_id: string;
          updated_at?: string;
          vote: Database["public"]["Enums"]["vote_type"];
          voter_id: string;
        };
        Update: {
          created_at?: string;
          item_id?: string;
          updated_at?: string;
          vote?: Database["public"]["Enums"]["vote_type"];
          voter_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "votes_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "clothing_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "votes_voter_id_fkey";
            columns: ["voter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      account_tier_of: {
        Args: { p_user_id: string };
        Returns: Database["public"]["Enums"]["account_tier"];
      };
      can_upload_to_group: {
        Args: { p_group_id: string };
        Returns: boolean;
      };
      cast_vote: {
        Args: { p_item_id: string; p_vote: Database["public"]["Enums"]["vote_type"] };
        Returns: {
          created_at: string;
          item_id: string;
          updated_at: string;
          vote: Database["public"]["Enums"]["vote_type"];
          voter_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "votes";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_group: {
        Args: { p_members_can_upload?: boolean; p_name: string };
        Returns: {
          created_at: string;
          id: string;
          members_can_upload: boolean;
          name: string;
          owner_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "groups";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_invitation: {
        Args: { p_group_id: string };
        Returns: {
          expires_at: string;
          id: string;
          token: string;
        }[];
      };
      group_member_limit: { Args: { p_group_id: string }; Returns: number };
      group_vote_counts: {
        Args: { p_group_id: string };
        Returns: {
          item_id: string;
          keep_count: number;
          let_go_count: number;
          want_count: number;
        }[];
      };
      invitation_preview: {
        Args: { p_token: string };
        Returns: {
          group_name: string;
          valid: boolean;
        }[];
      };
      is_group_member: { Args: { p_group_id: string }; Returns: boolean };
      is_group_owner: { Args: { p_group_id: string }; Returns: boolean };
      item_group_id: { Args: { p_item_id: string }; Returns: string };
      item_uploader_id: { Args: { p_item_id: string }; Returns: string };
      mark_notifications_read: { Args: { p_ids?: string[] }; Returns: number };
      my_entitlements: {
        Args: Record<PropertyKey, never>;
        Returns: {
          active_invitations_limit: number;
          group_members_limit: number;
          owned_groups: number;
          owned_groups_limit: number;
          photos: number;
          photos_limit: number;
          tier: Database["public"]["Enums"]["account_tier"];
        }[];
      };
      my_membership_requests: {
        Args: Record<PropertyKey, never>;
        Returns: {
          created_at: string;
          group_id: string;
          group_name: string;
          id: string;
          message: string;
          reviewed_at: string;
          status: Database["public"]["Enums"]["request_status"];
        }[];
      };
      my_notifications: {
        Args: { p_limit?: number };
        Returns: {
          actor_name: string;
          created_at: string;
          group_id: string;
          group_name: string;
          id: string;
          item_id: string;
          item_title: string;
          kind: Database["public"]["Enums"]["notification_kind"];
          read_at: string;
          request_id: string;
        }[];
      };
      my_retention_notices: {
        Args: Record<PropertyKey, never>;
        Returns: {
          created_at: string;
          group_id: string;
          id: string;
          retention_deadline: string;
          storage_path: string;
          title: string;
          uploader_id: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "clothing_items";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      photo_path_group: { Args: { p_name: string }; Returns: string };
      photo_path_uploader: { Args: { p_name: string }; Returns: string };
      redeem_invitation: {
        Args: { p_message?: string; p_token: string };
        Returns: {
          created_at: string;
          group_id: string;
          id: string;
          invitation_id: string | null;
          message: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: Database["public"]["Enums"]["request_status"];
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "membership_requests";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      review_membership_request: {
        Args: { p_approve: boolean; p_request_id: string };
        Returns: {
          created_at: string;
          group_id: string;
          id: string;
          invitation_id: string | null;
          message: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: Database["public"]["Enums"]["request_status"];
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "membership_requests";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      revoke_invitation: { Args: { p_invitation_id: string }; Returns: undefined };
      run_retention_cleanup: { Args: Record<PropertyKey, never>; Returns: undefined };
      set_account_tier: {
        Args: {
          p_email: string;
          p_note?: string;
          p_tier: Database["public"]["Enums"]["account_tier"];
        };
        Returns: {
          created_at: string;
          display_name: string;
          id: string;
          tier: Database["public"]["Enums"]["account_tier"];
          tier_granted_at: string | null;
          tier_note: string | null;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "profiles";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      shares_group_with: { Args: { p_user_id: string }; Returns: boolean };
      tier_limit: {
        Args: { p_name: string; p_tier: Database["public"]["Enums"]["account_tier"] };
        Returns: number;
      };
      wants_notification: {
        Args: { p_group: string; p_kind: Database["public"]["Enums"]["notification_kind"]; p_user: string };
        Returns: boolean;
      };
      transfer_group_ownership: {
        Args: { p_group_id: string; p_new_owner: string };
        Returns: undefined;
      };
    };
    Enums: {
      account_tier: "free" | "premium";
      membership_role: "owner" | "member";
      notification_kind:
        | "membership_requested"
        | "request_approved"
        | "request_rejected"
        | "member_joined"
        | "item_added"
        | "item_wanted";
      request_status: "pending" | "approved" | "rejected";
      vote_type: "keep" | "let_go" | "want";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      account_tier: ["free", "premium"],
      membership_role: ["owner", "member"],
      notification_kind: [
        "membership_requested",
        "request_approved",
        "request_rejected",
        "member_joined",
        "item_added",
        "item_wanted",
      ],
      request_status: ["pending", "approved", "rejected"],
      vote_type: ["keep", "let_go", "want"],
    },
  },
} as const;
