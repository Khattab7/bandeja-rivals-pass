export type Database = {
  public: {
    Tables: {
      approved_phones: {
        Row: {
          id: string;
          phone: string;
          name: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          phone: string;
          name?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          phone?: string;
          name?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      members: {
        Row: {
          id: string;
          user_id: string | null;
          name: string;
          email: string;
          phone: string | null;
          member_id: string;
          avatar_url: string | null;
          is_active: boolean;
          valid_until: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          name: string;
          email: string;
          phone?: string | null;
          member_id?: string;
          avatar_url?: string | null;
          is_active?: boolean;
          valid_until?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          name?: string;
          email?: string;
          phone?: string | null;
          member_id?: string;
          avatar_url?: string | null;
          is_active?: boolean;
          valid_until?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};

export type Member = Database["public"]["Tables"]["members"]["Row"];

export type ApprovedPhone = {
  id: string;
  phone: string;
  name: string | null;
  created_at: string;
};
