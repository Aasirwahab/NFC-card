/**
 * GENERATED FILE — do not edit by hand.
 *
 * Run `npm run db:types` after changing anything in supabase/migrations/.
 * CI fails if this file is out of date with the migrations.
 *
 * Generated from 12 tables by scripts/gen-types.ts.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type Database = {
  public: {
    Tables: {
      bookings: {
        Row: {
          id: string;
          session_id: string | null;
          provider: string;
          provider_event_id: string;
          prospect_email: string | null;
          prospect_name: string | null;
          starts_at: string | null;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id?: string | null;
          provider?: string;
          provider_event_id: string;
          prospect_email?: string | null;
          prospect_name?: string | null;
          starts_at?: string | null;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string | null;
          provider?: string;
          provider_event_id?: string;
          prospect_email?: string | null;
          prospect_name?: string | null;
          starts_at?: string | null;
          status?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bookings_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      business_profiles: {
        Row: {
          id: string;
          user_id: string;
          company_name: string;
          tagline: string | null;
          logo_url: string | null;
          website: string | null;
          services: string[];
          pricing: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          company_name: string;
          tagline?: string | null;
          logo_url?: string | null;
          website?: string | null;
          services?: string[];
          pricing?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          company_name?: string;
          tagline?: string | null;
          logo_url?: string | null;
          website?: string | null;
          services?: string[];
          pricing?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'business_profiles_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      card_batches: {
        Row: {
          id: string;
          user_id: string;
          label: string | null;
          size: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          label?: string | null;
          size: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          label?: string | null;
          size?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'card_batches_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      cards: {
        Row: {
          id: string;
          user_id: string;
          batch_id: string | null;
          code: string;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          batch_id?: string | null;
          code: string;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          batch_id?: string | null;
          code?: string;
          status?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'cards_batch_id_fkey';
            columns: ['batch_id'];
            isOneToOne: false;
            referencedRelation: 'card_batches';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cards_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      chat_messages: {
        Row: {
          id: number;
          session_id: string;
          role: string;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          session_id: string;
          role: string;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: number;
          session_id?: string;
          role?: string;
          content?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'chat_messages_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      events: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          event_date: string | null;
          location: string | null;
          niches: Json;
          next_card_sequence: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          event_date?: string | null;
          location?: string | null;
          niches?: Json;
          next_card_sequence?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          event_date?: string | null;
          location?: string | null;
          niches?: Json;
          next_card_sequence?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'events_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      followup_drafts: {
        Row: {
          id: string;
          session_id: string;
          channel: string;
          draft_text: string;
          sent_at: string | null;
          generated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          channel: string;
          draft_text: string;
          sent_at?: string | null;
          generated_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          channel?: string;
          draft_text?: string;
          sent_at?: string | null;
          generated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'followup_drafts_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: true;
            referencedRelation: 'sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      jobs: {
        Row: {
          id: string;
          type: string;
          session_id: string | null;
          user_id: string;
          payload: Json;
          steps: Json;
          status: string;
          attempts: number;
          max_attempts: number;
          run_after: string;
          locked_at: string | null;
          locked_by: string | null;
          last_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          type: string;
          session_id?: string | null;
          user_id: string;
          payload?: Json;
          steps?: Json;
          status?: string;
          attempts?: number;
          max_attempts?: number;
          run_after?: string;
          locked_at?: string | null;
          locked_by?: string | null;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          type?: string;
          session_id?: string | null;
          user_id?: string;
          payload?: Json;
          steps?: Json;
          status?: string;
          attempts?: number;
          max_attempts?: number;
          run_after?: string;
          locked_at?: string | null;
          locked_by?: string | null;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'jobs_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'jobs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      knowledge_base: {
        Row: {
          id: string;
          user_id: string;
          topic: string;
          content: string;
          source: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          topic: string;
          content: string;
          source?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          topic?: string;
          content?: string;
          source?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'knowledge_base_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string;
          title: string | null;
          bio: string | null;
          photo_url: string | null;
          linkedin_url: string | null;
          phone: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          title?: string | null;
          bio?: string | null;
          photo_url?: string | null;
          linkedin_url?: string | null;
          phone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          title?: string | null;
          bio?: string | null;
          photo_url?: string | null;
          linkedin_url?: string | null;
          phone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_id_fkey';
            columns: ['id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      session_events: {
        Row: {
          id: number;
          session_id: string;
          type: string;
          occurred_at: string;
          meta: Json | null;
        };
        Insert: {
          id?: number;
          session_id: string;
          type: string;
          occurred_at?: string;
          meta?: Json | null;
        };
        Update: {
          id?: number;
          session_id?: string;
          type?: string;
          occurred_at?: string;
          meta?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: 'session_events_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      sessions: {
        Row: {
          id: string;
          user_id: string;
          card_id: string;
          event_id: string;
          event_sequence_number: number;
          colour_tag: string;
          prospect_name: string | null;
          prospect_company: string | null;
          prospect_email: string | null;
          prospect_phone: string | null;
          linkedin_url: string | null;
          niche: string | null;
          problems: string[];
          custom_problems: string | null;
          memorable_info: string | null;
          registered_at: string;
          registered_by: string;
          details_completed_at: string | null;
          enrichment_status: string;
          enrichment_attempts: number;
          enrichment_started_at: string | null;
          enrichment_completed_at: string | null;
          enrichment_last_error: string | null;
          research: Json | null;
          generated_pitch: string | null;
          generated_pitch_model: string | null;
          first_viewed_at: string | null;
          view_count: number;
          chat_response_count: number;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          user_id: string;
          card_id: string;
          event_id: string;
          event_sequence_number: number;
          colour_tag: string;
          prospect_name?: string | null;
          prospect_company?: string | null;
          prospect_email?: string | null;
          prospect_phone?: string | null;
          linkedin_url?: string | null;
          niche?: string | null;
          problems?: string[];
          custom_problems?: string | null;
          memorable_info?: string | null;
          registered_at?: string;
          registered_by: string;
          details_completed_at?: string | null;
          enrichment_status?: string;
          enrichment_attempts?: number;
          enrichment_started_at?: string | null;
          enrichment_completed_at?: string | null;
          enrichment_last_error?: string | null;
          research?: Json | null;
          generated_pitch?: string | null;
          generated_pitch_model?: string | null;
          first_viewed_at?: string | null;
          view_count?: number;
          chat_response_count?: number;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          card_id?: string;
          event_id?: string;
          event_sequence_number?: number;
          colour_tag?: string;
          prospect_name?: string | null;
          prospect_company?: string | null;
          prospect_email?: string | null;
          prospect_phone?: string | null;
          linkedin_url?: string | null;
          niche?: string | null;
          problems?: string[];
          custom_problems?: string | null;
          memorable_info?: string | null;
          registered_at?: string;
          registered_by?: string;
          details_completed_at?: string | null;
          enrichment_status?: string;
          enrichment_attempts?: number;
          enrichment_started_at?: string | null;
          enrichment_completed_at?: string | null;
          enrichment_last_error?: string | null;
          research?: Json | null;
          generated_pitch?: string | null;
          generated_pitch_model?: string | null;
          first_viewed_at?: string | null;
          view_count?: number;
          chat_response_count?: number;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sessions_card_id_fkey';
            columns: ['card_id'];
            isOneToOne: true;
            referencedRelation: 'cards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sessions_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<never, never>;
    Functions: {
      register_card: {
        Args: {
          p_session_id: string;
          p_code: string;
          p_event_id: string;
          p_user_id: string;
          p_registered_by: string;
          p_first_name?: string | null;
        };
        Returns: Database['public']['Tables']['sessions']['Row'];
      };
      save_session_details: {
        Args: { p_session_id: string; p_user_id: string; p_details: Json };
        Returns: Database['public']['Tables']['sessions']['Row'];
      };
      void_session: {
        Args: { p_session_id: string; p_user_id: string };
        Returns: Database['public']['Tables']['sessions']['Row'];
      };
      record_prospect_view: {
        Args: { p_session_id: string };
        Returns: boolean;
      };
      claim_jobs: {
        Args: { p_worker: string; p_limit: number; p_types?: string[] | null };
        Returns: Database['public']['Tables']['jobs']['Row'][];
      };
      save_job_step: {
        Args: { p_job_id: string; p_worker: string; p_step: string; p_output: Json };
        Returns: boolean;
      };
      complete_job: {
        Args: { p_job_id: string; p_worker: string };
        Returns: boolean;
      };
      yield_job: {
        Args: { p_job_id: string; p_worker: string };
        Returns: boolean;
      };
      fail_job: {
        Args: {
          p_job_id: string;
          p_worker: string;
          p_error: string;
          p_retry_in_seconds: number | null;
        };
        Returns: string | null;
      };
      reap_jobs: {
        Args: { p_stale_after_seconds: number };
        Returns: { job_id: string; job_type: string; outcome: string }[];
      };
      queue_stats: {
        Args: { p_types?: string[] | null };
        Returns: { claimable: number; running: number; stale_queued: number; unhandled: number }[];
      };
      complete_enrichment: {
        Args: { p_session_id: string; p_research: Json; p_pitch: string; p_model: string };
        Returns: boolean;
      };
      colour_for_sequence: {
        Args: { p_sequence: number };
        Returns: string;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

/** Shorthands: `Row<'sessions'>` reads better than the full path at call sites. */
export type Tables = Database['public']['Tables'];
export type Row<T extends keyof Tables> = Tables[T]['Row'];
export type Insert<T extends keyof Tables> = Tables[T]['Insert'];
export type Update<T extends keyof Tables> = Tables[T]['Update'];
