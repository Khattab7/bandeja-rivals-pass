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
      app_settings: {
        Row: {
          key: string;
          value: unknown;
          description: string | null;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          key: string;
          value: unknown;
          description?: string | null;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          key?: string;
          value?: unknown;
          description?: string | null;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      player_profiles: {
        Row: {
          id: string;
          user_id: string;
          member_id: string | null;
          first_name: string | null;
          last_name: string | null;
          display_name: string | null;
          username: string | null;
          public_player_id: string | null;
          avatar_url: string | null;
          phone: string | null;
          email: string | null;
          country: string | null;
          city: string | null;
          primary_area: string | null;
          home_venue_id: string | null;
          gender: 'male' | 'female' | 'prefer_not_to_say' | null;
          date_of_birth: string | null;
          dominant_hand: 'right' | 'left' | 'ambidextrous' | null;
          preferred_side: 'right' | 'left' | 'no_preference' | null;
          years_playing_padel: number | null;
          weekly_match_frequency: string | null;
          match_intensity_preference: string | null;
          match_type_preference: 'friendly' | 'rated' | 'both' | null;
          current_rating: number;
          starting_rating: number;
          starting_rating_source: 'default_500' | 'rating_guess' | 'admin_override';
          rating_confidence: 'low' | 'medium' | 'high';
          leaderboard_city: string | null;
          leaderboard_area: string | null;
          profile_completion_percent: number;
          onboarding_completed: boolean;
          match_ready: boolean;
          is_discoverable: boolean;
          match_history_privacy: 'public' | 'followers_only' | 'private';
          followers_private: boolean;
          is_suspended: boolean;
          is_banned: boolean;
          suspension_reason: string | null;
          banned_reason: string | null;
          no_show_count: number;
          dispute_count: number;
          reports_received_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          member_id?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          display_name?: string | null;
          username?: string | null;
          public_player_id?: string | null;
          avatar_url?: string | null;
          phone?: string | null;
          email?: string | null;
          country?: string | null;
          city?: string | null;
          primary_area?: string | null;
          home_venue_id?: string | null;
          gender?: 'male' | 'female' | 'prefer_not_to_say' | null;
          date_of_birth?: string | null;
          dominant_hand?: 'right' | 'left' | 'ambidextrous' | null;
          preferred_side?: 'right' | 'left' | 'no_preference' | null;
          years_playing_padel?: number | null;
          weekly_match_frequency?: string | null;
          match_intensity_preference?: string | null;
          match_type_preference?: 'friendly' | 'rated' | 'both' | null;
          current_rating?: number;
          starting_rating?: number;
          starting_rating_source?: 'default_500' | 'rating_guess' | 'admin_override';
          rating_confidence?: 'low' | 'medium' | 'high';
          leaderboard_city?: string | null;
          leaderboard_area?: string | null;
          profile_completion_percent?: number;
          onboarding_completed?: boolean;
          match_ready?: boolean;
          is_discoverable?: boolean;
          match_history_privacy?: 'public' | 'followers_only' | 'private';
          followers_private?: boolean;
          is_suspended?: boolean;
          is_banned?: boolean;
          suspension_reason?: string | null;
          banned_reason?: string | null;
          no_show_count?: number;
          dispute_count?: number;
          reports_received_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['player_profiles']['Insert']>;
        Relationships: [];
      };
      player_onboarding_answers: {
        Row: {
          id: string;
          player_id: string;
          answers: Record<string, unknown>;
          locked: boolean;
          locked_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          player_id: string;
          answers?: Record<string, unknown>;
          locked?: boolean;
          locked_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['player_onboarding_answers']['Insert']>;
        Relationships: [];
      };
      player_preferred_areas: {
        Row: {
          id: string;
          player_id: string;
          city: string;
          area: string;
          priority: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          player_id: string;
          city: string;
          area: string;
          priority?: number;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['player_preferred_areas']['Insert']>;
        Relationships: [];
      };
      player_availability: {
        Row: {
          id: string;
          player_id: string;
          day_of_week: number;
          time_slot: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          player_id: string;
          day_of_week: number;
          time_slot: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['player_availability']['Insert']>;
        Relationships: [];
      };
      player_stats: {
        Row: {
          id: string;
          player_id: string;
          matches_played: number;
          rated_matches_played: number;
          friendly_matches_played: number;
          wins: number;
          losses: number;
          highest_rating_ever: number | null;
          lowest_rating_ever: number | null;
          current_winning_streak: number;
          best_winning_streak: number;
          current_beat_expected_streak: number;
          best_beat_expected_streak: number;
          times_beat_expected: number;
          upset_wins: number;
          bars_active_balance: number;
          bars_locked_pending: number;
          bars_total_earned: number;
          bars_lifetime_earned: number;
          score_confirmation_reliability: number | null;
          no_show_count: number;
          most_common_partner_id: string | null;
          most_active_city: string | null;
          most_active_area: string | null;
          cached_recent_form: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          player_id: string;
          matches_played?: number;
          rated_matches_played?: number;
          friendly_matches_played?: number;
          wins?: number;
          losses?: number;
          highest_rating_ever?: number | null;
          lowest_rating_ever?: number | null;
          current_winning_streak?: number;
          best_winning_streak?: number;
          current_beat_expected_streak?: number;
          best_beat_expected_streak?: number;
          times_beat_expected?: number;
          upset_wins?: number;
          bars_active_balance?: number;
          bars_locked_pending?: number;
          bars_total_earned?: number;
          bars_lifetime_earned?: number;
          score_confirmation_reliability?: number | null;
          no_show_count?: number;
          most_common_partner_id?: string | null;
          most_active_city?: string | null;
          most_active_area?: string | null;
          cached_recent_form?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['player_stats']['Insert']>;
        Relationships: [];
      };
      rating_events: {
        Row: {
          id: string;
          player_id: string;
          match_id: string | null;
          event_type: 'match_result' | 'admin_correction' | 'admin_reversal' | 'global_adjustment' | 'starting_rating';
          rating_before: number;
          rating_change: number;
          rating_after: number;
          reason: string | null;
          algorithm_version: string | null;
          visible_to_player: boolean;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          player_id: string;
          match_id?: string | null;
          event_type: 'match_result' | 'admin_correction' | 'admin_reversal' | 'global_adjustment' | 'starting_rating';
          rating_before: number;
          rating_change: number;
          rating_after: number;
          reason?: string | null;
          algorithm_version?: string | null;
          visible_to_player?: boolean;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['rating_events']['Insert']>;
        Relationships: [];
      };
      player_follows: {
        Row: {
          id: string;
          follower_id: string;
          followed_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          follower_id: string;
          followed_id: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['player_follows']['Insert']>;
        Relationships: [];
      };
      player_blocks: {
        Row: {
          id: string;
          blocker_id: string;
          blocked_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          blocker_id: string;
          blocked_id: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['player_blocks']['Insert']>;
        Relationships: [];
      };
      user_reports: {
        Row: {
          id: string;
          reporter_id: string;
          reported_id: string;
          reason: 'fake_score' | 'toxic_behavior' | 'no_show' | 'wrong_identity' | 'harassment' | 'spam' | 'payment_booking_issue' | 'other';
          details: string | null;
          status: 'pending' | 'under_review' | 'resolved' | 'dismissed';
          admin_notes: string | null;
          resolved_by: string | null;
          resolved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          reporter_id: string;
          reported_id: string;
          reason: 'fake_score' | 'toxic_behavior' | 'no_show' | 'wrong_identity' | 'harassment' | 'spam' | 'payment_booking_issue' | 'other';
          details?: string | null;
          status?: 'pending' | 'under_review' | 'resolved' | 'dismissed';
          admin_notes?: string | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['user_reports']['Insert']>;
        Relationships: [];
      };
      // ── Module 03: Teams ──────────────────────────────────────
      teams: {
        Row: {
          id: string;
          public_team_id: string | null;
          handle: string | null;
          name: string | null;
          auto_name: string | null;
          avatar_url: string | null;
          bio: string | null;
          captain_player_id: string | null;
          team_type: 'permanent';
          status: 'active' | 'incomplete' | 'pending_partner_acceptance' | 'suspended' | 'archived' | 'deleted';
          pair_key: string | null;
          home_city: string | null;
          home_area: string | null;
          home_venue_id: string | null;
          is_discoverable: boolean;
          is_featured: boolean;
          challenge_rating_range: number;
          match_history_privacy: 'public' | 'team_only';
          cached_current_team_rating: number | null;
          suspended_at: string | null;
          suspended_reason: string | null;
          archived_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          public_team_id?: string | null;
          handle?: string | null;
          name?: string | null;
          auto_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          captain_player_id?: string | null;
          team_type?: 'permanent';
          status?: 'active' | 'incomplete' | 'pending_partner_acceptance' | 'suspended' | 'archived' | 'deleted';
          pair_key?: string | null;
          home_city?: string | null;
          home_area?: string | null;
          home_venue_id?: string | null;
          is_discoverable?: boolean;
          is_featured?: boolean;
          challenge_rating_range?: number;
          match_history_privacy?: 'public' | 'team_only';
          cached_current_team_rating?: number | null;
          suspended_at?: string | null;
          suspended_reason?: string | null;
          archived_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['teams']['Insert']>;
        Relationships: [];
      };
      team_members: {
        Row: {
          id: string;
          team_id: string;
          player_id: string;
          role: 'captain' | 'member';
          joined_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          player_id: string;
          role?: 'captain' | 'member';
          joined_at?: string;
        };
        Update: Partial<Database['public']['Tables']['team_members']['Insert']>;
        Relationships: [];
      };
      team_invitations: {
        Row: {
          id: string;
          team_id: string;
          inviter_player_id: string;
          invitee_player_id: string | null;
          invitee_email: string | null;
          invitee_phone: string | null;
          status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired';
          message: string | null;
          responded_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          inviter_player_id: string;
          invitee_player_id?: string | null;
          invitee_email?: string | null;
          invitee_phone?: string | null;
          status?: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired';
          message?: string | null;
          responded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['team_invitations']['Insert']>;
        Relationships: [];
      };
      team_challenges: {
        Row: {
          id: string;
          challenging_team_id: string;
          challenged_team_id: string;
          sender_player_id: string;
          match_type: 'friendly' | 'rivals_rated';
          proposed_datetime: string | null;
          city: string | null;
          area: string | null;
          venue_id: string | null;
          message: string | null;
          status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired' | 'countered' | 'match_created';
          match_id: string | null;
          expires_at: string | null;
          responded_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          challenging_team_id: string;
          challenged_team_id: string;
          sender_player_id: string;
          match_type: 'friendly' | 'rivals_rated';
          proposed_datetime?: string | null;
          city?: string | null;
          area?: string | null;
          venue_id?: string | null;
          message?: string | null;
          status?: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired' | 'countered' | 'match_created';
          match_id?: string | null;
          expires_at?: string | null;
          responded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['team_challenges']['Insert']>;
        Relationships: [];
      };
      team_challenge_counteroffers: {
        Row: {
          id: string;
          challenge_id: string;
          offered_by_team_id: string;
          offered_by_player_id: string;
          proposed_datetime: string | null;
          area: string | null;
          venue_id: string | null;
          message: string | null;
          status: 'pending' | 'accepted' | 'rejected' | 'superseded';
          created_at: string;
        };
        Insert: {
          id?: string;
          challenge_id: string;
          offered_by_team_id: string;
          offered_by_player_id: string;
          proposed_datetime?: string | null;
          area?: string | null;
          venue_id?: string | null;
          message?: string | null;
          status?: 'pending' | 'accepted' | 'rejected' | 'superseded';
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['team_challenge_counteroffers']['Insert']>;
        Relationships: [];
      };
      open_matches: {
        Row: {
          id: string;
          public_open_id: string | null;
          team_id: string;
          created_by_player_id: string;
          match_type: 'friendly' | 'rivals_rated';
          city: string;
          area: string | null;
          venue_id: string | null;
          proposed_datetime: string;
          rating_min: number | null;
          rating_max: number | null;
          gender_preference: 'male' | 'female' | 'mixed' | 'any' | null;
          message: string | null;
          status: 'open' | 'filled' | 'cancelled' | 'expired';
          match_id: string | null;
          accepted_team_id: string | null;
          expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          public_open_id?: string | null;
          team_id: string;
          created_by_player_id: string;
          match_type: 'friendly' | 'rivals_rated';
          city: string;
          area?: string | null;
          venue_id?: string | null;
          proposed_datetime: string;
          rating_min?: number | null;
          rating_max?: number | null;
          gender_preference?: 'male' | 'female' | 'mixed' | 'any' | null;
          message?: string | null;
          status?: 'open' | 'filled' | 'cancelled' | 'expired';
          match_id?: string | null;
          accepted_team_id?: string | null;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['open_matches']['Insert']>;
        Relationships: [];
      };
      open_match_applications: {
        Row: {
          id: string;
          open_match_id: string;
          applying_team_id: string;
          applied_by_player_id: string;
          message: string | null;
          status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'auto_rejected';
          responded_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          open_match_id: string;
          applying_team_id: string;
          applied_by_player_id: string;
          message?: string | null;
          status?: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'auto_rejected';
          responded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['open_match_applications']['Insert']>;
        Relationships: [];
      };
      team_stats: {
        Row: {
          id: string;
          team_id: string;
          matches_played: number;
          rated_matches: number;
          friendly_matches: number;
          wins: number;
          losses: number;
          current_win_streak: number;
          best_win_streak: number;
          current_beat_expected_streak: number;
          best_beat_expected_streak: number;
          times_beat_expected: number;
          upset_wins: number;
          biggest_upset_match_id: string | null;
          most_played_city: string | null;
          most_played_area: string | null;
          most_played_venue_id: string | null;
          bars_earned_as_team: number;
          cached_win_rate: number | null;
          cached_recent_form: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          matches_played?: number;
          rated_matches?: number;
          friendly_matches?: number;
          wins?: number;
          losses?: number;
          current_win_streak?: number;
          best_win_streak?: number;
          current_beat_expected_streak?: number;
          best_beat_expected_streak?: number;
          times_beat_expected?: number;
          upset_wins?: number;
          biggest_upset_match_id?: string | null;
          most_played_city?: string | null;
          most_played_area?: string | null;
          most_played_venue_id?: string | null;
          bars_earned_as_team?: number;
          cached_win_rate?: number | null;
          cached_recent_form?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['team_stats']['Insert']>;
        Relationships: [];
      };
      team_badges: {
        Row: { id: string; team_id: string; badge_key: string; earned_at: string; metadata: Record<string, unknown> | null; };
        Insert: { id?: string; team_id: string; badge_key: string; earned_at?: string; metadata?: Record<string, unknown> | null; };
        Update: Partial<Database['public']['Tables']['team_badges']['Insert']>;
        Relationships: [];
      };
      team_reports: {
        Row: {
          id: string; reported_team_id: string; reporting_player_id: string;
          reason: string; details: string | null;
          status: 'pending' | 'reviewed' | 'dismissed' | 'actioned';
          admin_notes: string | null; reviewed_by: string | null; reviewed_at: string | null; created_at: string;
        };
        Insert: {
          id?: string; reported_team_id: string; reporting_player_id: string;
          reason: string; details?: string | null;
          status?: 'pending' | 'reviewed' | 'dismissed' | 'actioned';
          admin_notes?: string | null; reviewed_by?: string | null; reviewed_at?: string | null; created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['team_reports']['Insert']>;
        Relationships: [];
      };
      team_blocks: {
        Row: { id: string; blocker_team_id: string; blocked_team_id: string; created_at: string; };
        Insert: { id?: string; blocker_team_id: string; blocked_team_id: string; created_at?: string; };
        Update: Partial<Database['public']['Tables']['team_blocks']['Insert']>;
        Relationships: [];
      };
      team_rating_snapshots: {
        Row: {
          id: string; match_id: string; team_id: string;
          player1_id: string; player2_id: string;
          team_rating_before: number; team_rating_after: number;
          player1_rating_before: number; player1_rating_after: number;
          player2_rating_before: number; player2_rating_after: number;
          created_at: string;
        };
        Insert: {
          id?: string; match_id: string; team_id: string;
          player1_id: string; player2_id: string;
          team_rating_before: number; team_rating_after: number;
          player1_rating_before: number; player1_rating_after: number;
          player2_rating_before: number; player2_rating_after: number;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['team_rating_snapshots']['Insert']>;
        Relationships: [];
      };
      // ── Module 04: Discovery ──────────────────────────────────
      team_discovery_preferences: {
        Row: {
          id: string; team_id: string; is_discoverable: boolean; open_to_challenges: boolean;
          challenge_rating_min: number | null; challenge_rating_max: number | null;
          preferred_city: string | null; preferred_areas: string[] | null;
          gender_preference: 'male' | 'female' | 'mixed' | 'any' | null;
          allow_unknown_challenges: boolean; updated_at: string;
        };
        Insert: {
          id?: string; team_id: string; is_discoverable?: boolean; open_to_challenges?: boolean;
          challenge_rating_min?: number | null; challenge_rating_max?: number | null;
          preferred_city?: string | null; preferred_areas?: string[] | null;
          gender_preference?: 'male' | 'female' | 'mixed' | 'any' | null;
          allow_unknown_challenges?: boolean; updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['team_discovery_preferences']['Insert']>;
        Relationships: [];
      };
      discovery_hides: {
        Row: { id: string; actor_team_id: string; target_team_id: string; created_at: string; };
        Insert: { id?: string; actor_team_id: string; target_team_id: string; created_at?: string; };
        Update: Partial<Database['public']['Tables']['discovery_hides']['Insert']>;
        Relationships: [];
      };
      saved_discovery_items: {
        Row: { id: string; actor_team_id: string; item_type: 'team' | 'open_match'; item_id: string; saved_by_player_id: string; created_at: string; };
        Insert: { id?: string; actor_team_id: string; item_type: 'team' | 'open_match'; item_id: string; saved_by_player_id: string; created_at?: string; };
        Update: Partial<Database['public']['Tables']['saved_discovery_items']['Insert']>;
        Relationships: [];
      };
      // ── Module 05: Matches ────────────────────────────────────
      matches: {
        Row: {
          id: string;
          match_type: 'friendly' | 'rivals_rated';
          status: 'scheduled' | 'scheduled_tbd' | 'cancelled' | 'score_submitted' | 'awaiting_confirmation' | 'alternative_score_submitted' | 'confirmed' | 'auto_approved' | 'disputed' | 'admin_resolved' | 'processed' | 'voided';
          source_type: 'team_challenge' | 'open_match' | 'admin';
          source_id: string | null;
          team_a_id: string;
          team_b_id: string;
          city: string | null;
          area: string | null;
          venue_id: string | null;
          scheduled_date: string | null;
          scheduled_time: string | null;
          rating_snapshot_json: Record<string, unknown> | null;
          first_score_submitted_at: string | null;
          score_submission_window_expires_at: string | null;
          processed_at: string | null;
          voided_at: string | null;
          voided_by: string | null;
          void_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          cancel_reason: string | null;
          admin_resolved_by: string | null;
          admin_resolved_at: string | null;
          admin_notes: string | null;
          is_hidden_from_feed: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          match_type: 'friendly' | 'rivals_rated';
          status?: 'scheduled' | 'scheduled_tbd' | 'cancelled' | 'score_submitted' | 'awaiting_confirmation' | 'alternative_score_submitted' | 'confirmed' | 'auto_approved' | 'disputed' | 'admin_resolved' | 'processed' | 'voided';
          source_type: 'team_challenge' | 'open_match' | 'admin';
          source_id?: string | null;
          team_a_id: string;
          team_b_id: string;
          city?: string | null;
          area?: string | null;
          venue_id?: string | null;
          scheduled_date?: string | null;
          scheduled_time?: string | null;
          rating_snapshot_json?: Record<string, unknown> | null;
          first_score_submitted_at?: string | null;
          score_submission_window_expires_at?: string | null;
          processed_at?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
          void_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          cancel_reason?: string | null;
          admin_resolved_by?: string | null;
          admin_resolved_at?: string | null;
          admin_notes?: string | null;
          is_hidden_from_feed?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['matches']['Insert']>;
        Relationships: [];
      };
      match_players: {
        Row: {
          id: string; match_id: string; team_id: string; player_id: string;
          side: 'A' | 'B'; slot: 'player_1' | 'player_2';
          player_rating_at_match_creation: number;
          player_rating_at_score_submission: number | null;
        };
        Insert: {
          id?: string; match_id: string; team_id: string; player_id: string;
          side: 'A' | 'B'; slot: 'player_1' | 'player_2';
          player_rating_at_match_creation: number;
          player_rating_at_score_submission?: number | null;
        };
        Update: Partial<Database['public']['Tables']['match_players']['Insert']>;
        Relationships: [];
      };
      match_score_submissions: {
        Row: {
          id: string; match_id: string; submitted_by_player_id: string; submitted_by_team_id: string;
          submission_type: 'original' | 'alternative' | 'admin_corrected';
          score_format: 'one_set' | 'best_of_3';
          equivalent_actual_score_scenario_index: number | null;
          equivalent_actual_score_label: string | null;
          winning_side: 'A' | 'B' | null;
          status: 'pending' | 'confirmed' | 'rejected' | 'withdrawn' | 'superseded';
          dispute_text: string | null;
          confirmed_by_player_id: string | null; confirmed_at: string | null;
          rejected_by_player_id: string | null; rejected_at: string | null;
          created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; match_id: string; submitted_by_player_id: string; submitted_by_team_id: string;
          submission_type: 'original' | 'alternative' | 'admin_corrected';
          score_format: 'one_set' | 'best_of_3';
          equivalent_actual_score_scenario_index?: number | null;
          equivalent_actual_score_label?: string | null;
          winning_side?: 'A' | 'B' | null;
          status?: 'pending' | 'confirmed' | 'rejected' | 'withdrawn' | 'superseded';
          dispute_text?: string | null;
          confirmed_by_player_id?: string | null; confirmed_at?: string | null;
          rejected_by_player_id?: string | null; rejected_at?: string | null;
          created_at?: string; updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['match_score_submissions']['Insert']>;
        Relationships: [];
      };
      match_score_sets: {
        Row: {
          id: string; score_submission_id: string; set_number: number;
          winning_side: 'A' | 'B'; winner_games: number; loser_games: number;
          scenario_index: number | null; score_label: string | null;
        };
        Insert: {
          id?: string; score_submission_id: string; set_number: number;
          winning_side: 'A' | 'B'; winner_games: number; loser_games: number;
          scenario_index?: number | null; score_label?: string | null;
        };
        Update: Partial<Database['public']['Tables']['match_score_sets']['Insert']>;
        Relationships: [];
      };
      bars_ledger: {
        Row: {
          id: string;
          player_id: string;
          match_id: string | null;
          amount: number;
          status: 'active' | 'locked' | 'expired' | 'reversed' | 'redeemed';
          source_type: 'match_reward' | 'admin_adjustment' | 'admin_reversal' | 'unlock_locked_bars' | 'redemption';
          source_id: string | null;
          was_paid_at_submission: boolean;
          locked_reason: string | null;
          expires_at: string | null;
          unlocked_at: string | null;
          reversed_at: string | null;
          redeemed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          player_id: string;
          match_id?: string | null;
          amount: number;
          status?: 'active' | 'locked' | 'expired' | 'reversed' | 'redeemed';
          source_type: 'match_reward' | 'admin_adjustment' | 'admin_reversal' | 'unlock_locked_bars' | 'redemption';
          source_id?: string | null;
          was_paid_at_submission?: boolean;
          locked_reason?: string | null;
          expires_at?: string | null;
          unlocked_at?: string | null;
          reversed_at?: string | null;
          redeemed_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['bars_ledger']['Insert']>;
        Relationships: [];
      };
      match_processing_summaries: {
        Row: {
          id: string;
          match_id: string;
          team_a_rating_snapshot: number;
          team_b_rating_snapshot: number;
          steps: number;
          favored_side: 'A' | 'B' | 'balanced' | null;
          expected_scenario_index: number | null;
          expected_label: string | null;
          actual_scenario_index: number;
          actual_label: string;
          team_a_rating_change: number;
          team_b_rating_change: number;
          player_changes: Record<string, { before: number; change: number; after: number }>;
          bars_json: Record<string, { amount: number; status: string }> | null;
          streaks_json: Record<string, { win_streak_before: number; win_streak_after: number; beat_expected_streak_before: number; beat_expected_streak_after: number }> | null;
          explanation_short: string | null;
          explanation_detailed: string | null;
          processed_at: string;
        };
        Insert: {
          id?: string;
          match_id: string;
          team_a_rating_snapshot: number;
          team_b_rating_snapshot: number;
          steps: number;
          favored_side?: 'A' | 'B' | 'balanced' | null;
          expected_scenario_index?: number | null;
          expected_label?: string | null;
          actual_scenario_index: number;
          actual_label: string;
          team_a_rating_change: number;
          team_b_rating_change: number;
          player_changes: Record<string, { before: number; change: number; after: number }>;
          bars_json?: Record<string, { amount: number; status: string }> | null;
          streaks_json?: Record<string, unknown> | null;
          explanation_short?: string | null;
          explanation_detailed?: string | null;
          processed_at?: string;
        };
        Update: Partial<Database['public']['Tables']['match_processing_summaries']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      ensure_player_profile: {
        Args: { p_user_id: string };
        Returns: string;
      };
      recalculate_player_stats: {
        Args: { p_player_id: string };
        Returns: void;
      };
      recalculate_team_rating: {
        Args: { p_team_id: string };
        Returns: number;
      };
      is_team_member: {
        Args: { p_team_id: string };
        Returns: boolean;
      };
      my_player_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      get_member_for_validation: {
        Args: { member_uuid: string };
        Returns: {
          name: string;
          member_id: string;
          is_active: boolean;
          valid_until: string;
          avatar_url: string | null;
        }[];
      };
    };
    Enums: Record<string, never>;
  };
};

// ── Convenience type aliases ──────────────────────────────────
export type Member = Database['public']['Tables']['members']['Row'];
export type AppSetting = Database['public']['Tables']['app_settings']['Row'];
export type PlayerProfile = Database['public']['Tables']['player_profiles']['Row'];
export type PlayerStats = Database['public']['Tables']['player_stats']['Row'];
export type PlayerOnboardingAnswers = Database['public']['Tables']['player_onboarding_answers']['Row'];
export type RatingEvent = Database['public']['Tables']['rating_events']['Row'];

export type ApprovedPhone = {
  id: string;
  phone: string;
  name: string | null;
  created_at: string;
};

// ── App Settings helpers ──────────────────────────────────────
export type AppSettingKey =
  // Rating
  | 'DEFAULT_STARTING_RATING'
  | 'MIN_STARTING_RATING'
  | 'MAX_STARTING_RATING'
  | 'RATING_ALGORITHM_VERSION'
  | 'BANDEJA_BATTLE_BARS_REWARD'
  | 'LOW_RATING_ALERT_THRESHOLD'
  // Bars
  | 'PENDING_BARS_VALIDITY_PERIOD_DAYS'
  // Onboarding
  | 'FOUNDING_RIVAL_BADGE_LIMIT'
  // Teams
  | 'MAX_ACTIVE_TEAMS_FREE'
  | 'MAX_ACTIVE_TEAMS_PAID'
  | 'TEAM_CHALLENGE_ACCEPTANCE_PERMISSION'
  | 'DEFAULT_CHALLENGE_RATING_RANGE'
  | 'TEAM_CHALLENGE_EXPIRATION_HOURS'
  | 'OPEN_MATCH_EXPIRATION_HOURS'
  | 'DAILY_PARTNER_INVITES_FREE'
  | 'DAILY_PARTNER_INVITES_PAID'
  | 'DAILY_TEAM_CHALLENGES_FREE'
  | 'DAILY_TEAM_CHALLENGES_PAID'
  | 'DAILY_OPEN_MATCH_APPS_FREE'
  | 'DAILY_OPEN_MATCH_APPS_PAID'
  | 'DAILY_RIVALS_BATTLE_INVITES_FREE'
  | 'DAILY_RIVALS_BATTLE_INVITES_PAID'
  | 'ANTI_SPAM_INVITE_COUNT'
  | 'ANTI_SPAM_INVITE_WINDOW_DAYS'
  | 'TEAM_DISCOVERABILITY_DEFAULT'
  // Matchmaking
  | 'BALANCED_MATCH_RATING_WINDOW'
  | 'PAID_RIVAL_DISCOVERY_BOOST_WEIGHT'
  | 'AI_MATCH_EXPLANATION_AVAILABILITY'
  // Match Lifecycle
  | 'SCORE_CONFIRMATION_REMINDER_DELAY_HOURS'
  | 'SCORE_AUTO_APPROVAL_DELAY_HOURS'
  | 'SCORE_SUBMISSION_WINDOW_HOURS'
  | 'LATE_SCORE_SUBMISSION_BEHAVIOR'
  | 'FRIENDLY_MATCH_SOCIAL_FEED_POSTING'
  | 'MATCH_DETAIL_CHANGE_APPROVAL_REQUIRED'
  | 'ALLOW_BEST_OF_3_RATED_MATCHES'
  | 'ALLOW_ONE_SET_RATED_MATCHES'
  | 'NO_SHOW_AFFECTS_DISCOVERY_RANKING'
  | 'NO_SHOW_AFFECTS_RELIABILITY_SCORE'
  // Leaderboards
  | 'MINIMUM_RATED_MATCHES_PLAYER_LEADERBOARD'
  | 'MINIMUM_RATED_MATCHES_TEAM_LEADERBOARD'
  | 'ACTIVE_LEADERBOARD_INACTIVITY_DAYS'
  | 'ALL_TIME_LEADERBOARDS_ENABLED'
  | 'MINIMUM_RANKED_PLAYERS_AREA_LEADERBOARD'
  | 'RATED_MATCH_ACTIVITY_WEIGHT'
  | 'FRIENDLY_MATCH_ACTIVITY_WEIGHT'
  | 'NO_SHOW_ACTIVITY_PENALTY'
  | 'CANCELLATION_ACTIVITY_PENALTY'
  | 'LEADERBOARD_REFRESH_FREQUENCY'
  | 'MANUAL_LEADERBOARD_REFRESH_ENABLED'
  | 'SEASON_LEADERBOARDS_ENABLED'
  | 'CUSTOM_LEADERBOARDS_ENABLED'
  // Quests
  | 'QUEST_SAME_OPPONENT_WEEKLY_COUNT_LIMIT'
  | 'QUEST_SAME_OPPONENT_LIMIT_WINDOW_DAYS'
  | 'QUEST_DEFAULT_TIMEZONE'
  | 'QUEST_AUTO_REPEAT_ENABLED'
  | 'QUEST_SOCIAL_FEED_POSTING_ENABLED'
  | 'QUEST_FOLLOWER_NOTIFICATIONS_ENABLED'
  | 'QUEST_EXTERNAL_SHARING_ENABLED'
  | 'QUEST_REWARD_BUDGET_ENFORCEMENT_ENABLED'
  | 'QUEST_REQUIRES_APPROVAL_BEFORE_GO_LIVE'
  | 'QUEST_LINKED_LEADERBOARD_CREATION_ENABLED'
  | 'QUEST_AI_DRAFT_GENERATION_ENABLED'
  | 'QUEST_AI_RECOMMENDATIONS_ENABLED'
  // Notifications
  | 'NOTIFICATION_RETENTION_DAYS'
  | 'DIGEST_ENABLED'
  | 'DIGEST_FREQUENCY'
  | 'DIGEST_SEND_TIME'
  | 'DIGEST_TIMEZONE'
  | 'CRITICAL_NOTIFICATION_MAX_RETRIES'
  | 'CRITICAL_NOTIFICATION_RETRY_DELAY_MINUTES'
  | 'EMAIL_NOTIFICATIONS_ENABLED'
  | 'WHATSAPP_NOTIFICATIONS_ENABLED'
  | 'BROWSER_PUSH_ENABLED'
  | 'MOBILE_PUSH_ENABLED'
  | 'AI_PROACTIVE_NOTIFICATIONS_ENABLED'
  | 'AI_PROACTIVE_NOTIFICATIONS_AVAILABILITY'
  | 'ADMIN_ANNOUNCEMENTS_ENABLED'
  | 'MANDATORY_NOTIFICATION_OVERRIDE_ENABLED';
