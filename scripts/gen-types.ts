/**
 * Generates lib/db/types.ts from the migrations in supabase/migrations/.
 *
 * The spec's dependency table says "generated Supabase types replace an ORM"
 * (§21). The canonical generator is `supabase gen types typescript`, which needs
 * the Supabase CLI and a running database. This script produces the same shape by
 * applying the repo's migrations to an in-process Postgres and reading
 * information_schema, so the types stay generated — and stay in sync — on any
 * machine, with no Docker and no cloud project.
 *
 *   npm run db:types
 *
 * CI runs it and fails if the result differs from what is committed, which is what
 * stops the types drifting from the schema.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestDb } from '../tests/integration/harness';

/** Postgres type -> TypeScript. Only the types this schema actually uses. */
const TYPE_MAP: Record<string, string> = {
  uuid: 'string',
  text: 'string',
  date: 'string',
  timestamptz: 'string',
  timestamp: 'string',
  int2: 'number',
  int4: 'number',
  int8: 'number',
  numeric: 'number',
  float8: 'number',
  bool: 'boolean',
  json: 'Json',
  jsonb: 'Json',
  _text: 'string[]',
  _uuid: 'string[]',
};

type Column = {
  table_name: string;
  column_name: string;
  udt_name: string;
  is_nullable: 'YES' | 'NO';
  has_default: boolean;
  is_identity: 'YES' | 'NO';
};

/** postgrest-js types every table with its foreign keys, so joins can be typed. */
type Relationship = {
  table_name: string;
  foreign_key_name: string;
  columns: string[];
  referenced_relation: string;
  referenced_columns: string[];
  is_one_to_one: boolean;
};

/**
 * The RPCs from §12 and the Phase 3 job lifecycle. Their signatures are small and part of the
 * spec's API contract, so they are declared here rather than introspected —
 * reading composite return types out of pg_proc would be more machinery than the
 * handful of declarations it replaces.
 */
const FUNCTIONS = `    {
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
      queue_event_digests: {
        Args: { p_now?: string };
        Returns: number;
      };
      confirm_prospect_website: {
        Args: { p_session_id: string; p_user_id: string; p_website: string };
        Returns: Database['public']['Tables']['sessions']['Row'];
      };
      void_session: {
        Args: { p_session_id: string; p_user_id: string };
        Returns: Database['public']['Tables']['sessions']['Row'];
      };
      record_prospect_view: {
        Args: { p_session_id: string; p_source?: 'nfc' | 'qr' };
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
        Args: { p_job_id: string; p_worker: string; p_delay_seconds?: number };
        Returns: boolean;
      };
      restart_job: {
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
        Args: {
          p_session_id: string;
          p_research: Json;
          p_pitch: string;
          p_model: string;
          p_revision?: number | null;
          p_prompt?: string | null;
        };
        Returns: string;
      };
      set_rep_pitch: {
        Args: { p_session_id: string; p_user_id: string; p_text: string | null };
        Returns: Database['public']['Tables']['sessions']['Row'];
      };
      rate_pitch: {
        Args: { p_session_id: string; p_user_id: string; p_rating: number; p_reason: string | null };
        Returns: Database['public']['Tables']['pitch_ratings']['Row'];
      };
      claim_chat_response: {
        Args: { p_session_id: string; p_cap?: number };
        Returns: number | null;
      };
      release_chat_response: {
        Args: { p_session_id: string };
        Returns: undefined;
      };
      record_chat_turn: {
        Args: { p_session_id: string; p_question: string; p_answer: string };
        Returns: undefined;
      };
      record_booking: {
        Args: {
          p_uid: string;
          p_status: string;
          p_session_id: string | null;
          p_starts_at: string | null;
          p_email: string | null;
          p_name: string | null;
          p_rescheduled_from: string | null;
        };
        Returns: string;
      };
      reject_enrichment: {
        Args: {
          p_session_id: string;
          p_research: Json;
          p_reason: string;
          p_revision?: number | null;
        };
        Returns: string;
      };
      enrichment_snapshot: {
        Args: { p_session_id: string };
        Returns: Json;
      };
      requeue_enrichment: {
        Args: { p_session_id: string; p_user_id: string };
        Returns: Database['public']['Tables']['sessions']['Row'];
      };
      colour_for_sequence: {
        Args: { p_sequence: number };
        Returns: string;
      };
    }`;

function tsType(column: Column): string {
  const base = TYPE_MAP[column.udt_name];
  if (!base) {
    throw new Error(
      `No TypeScript mapping for Postgres type "${column.udt_name}" ` +
        `(${column.table_name}.${column.column_name}). Add it to TYPE_MAP.`,
    );
  }
  return column.is_nullable === 'YES' ? `${base} | null` : base;
}

/** A column may be omitted on insert when the database can supply a value. */
function optionalOnInsert(column: Column): boolean {
  return column.has_default || column.is_identity === 'YES' || column.is_nullable === 'YES';
}

async function main() {
  const db = await createTestDb();

  const { rows } = await db.query<Column>(`
    select c.table_name,
           c.column_name,
           c.udt_name,
           c.is_nullable,
           (c.column_default is not null) as has_default,
           c.is_identity
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
     order by c.table_name, c.ordinal_position
  `);

  const byTable = new Map<string, Column[]>();
  for (const row of rows) {
    const existing = byTable.get(row.table_name);
    if (existing) existing.push(row);
    else byTable.set(row.table_name, [row]);
  }

  // Foreign keys, so postgrest-js can type an embedded select. isOneToOne is true
  // when the referencing columns are themselves unique — business_profiles.user_id
  // is the case that matters here.
  const relationships = await db.query<Relationship>(`
    with fk as (
      select con.oid,
             con.conname as foreign_key_name,
             src.relname as table_name,
             tgt.relname as referenced_relation,
             con.conrelid,
             con.conkey,
             con.confkey
        from pg_constraint con
        join pg_class src on src.oid = con.conrelid
        join pg_class tgt on tgt.oid = con.confrelid
        join pg_namespace n on n.oid = src.relnamespace
       where con.contype = 'f' and n.nspname = 'public'
    )
    select fk.table_name,
           fk.foreign_key_name,
           fk.referenced_relation,
           (select array_agg(a.attname order by k.ord)
              from unnest(fk.conkey) with ordinality as k(attnum, ord)
              join pg_attribute a on a.attrelid = fk.conrelid and a.attnum = k.attnum)
             as columns,
           (select array_agg(a.attname order by k.ord)
              from unnest(fk.confkey) with ordinality as k(attnum, ord)
              join pg_attribute a on a.attrelid =
                   (select confrelid from pg_constraint where oid = fk.oid)
               and a.attnum = k.attnum)
             as referenced_columns,
           exists (
             select 1 from pg_index i
              where i.indrelid = fk.conrelid
                and i.indisunique
                and i.indkey::int2[] @> fk.conkey
                and fk.conkey @> i.indkey::int2[]
           ) as is_one_to_one
      from fk
     order by fk.table_name, fk.foreign_key_name
  `);

  const relsByTable = new Map<string, Relationship[]>();
  for (const rel of relationships.rows) {
    const existing = relsByTable.get(rel.table_name);
    if (existing) existing.push(rel);
    else relsByTable.set(rel.table_name, [rel]);
  }

  const tables = [...byTable.entries()]
    .map(([table, columns]) => {
      const row = columns.map((c) => `          ${c.column_name}: ${tsType(c)};`).join('\n');
      const insert = columns
        .map((c) => `          ${c.column_name}${optionalOnInsert(c) ? '?' : ''}: ${tsType(c)};`)
        .join('\n');
      const update = columns.map((c) => `          ${c.column_name}?: ${tsType(c)};`).join('\n');

      const rels = relsByTable.get(table) ?? [];
      const relationships =
        rels.length === 0
          ? '        Relationships: [];'
          : [
              '        Relationships: [',
              ...rels.map(
                (r) =>
                  `          {\n` +
                  `            foreignKeyName: '${r.foreign_key_name}';\n` +
                  `            columns: [${r.columns.map((c) => `'${c}'`).join(', ')}];\n` +
                  `            isOneToOne: ${r.is_one_to_one};\n` +
                  `            referencedRelation: '${r.referenced_relation}';\n` +
                  `            referencedColumns: [${r.referenced_columns
                    .map((c) => `'${c}'`)
                    .join(', ')}];\n` +
                  `          },`,
              ),
              '        ];',
            ].join('\n');

      return [
        `      ${table}: {`,
        `        Row: {`,
        row,
        `        };`,
        `        Insert: {`,
        insert,
        `        };`,
        `        Update: {`,
        update,
        `        };`,
        relationships,
        `      };`,
      ].join('\n');
    })
    .join('\n');

  const output = `/**
 * GENERATED FILE — do not edit by hand.
 *
 * Run \`npm run db:types\` after changing anything in supabase/migrations/.
 * CI fails if this file is out of date with the migrations.
 *
 * Generated from ${byTable.size} tables by scripts/gen-types.ts.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type Database = {
  public: {
    Tables: {
${tables}
    };
    Views: Record<never, never>;
    Functions:
${FUNCTIONS};
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

/** Shorthands: \`Row<'sessions'>\` reads better than the full path at call sites. */
export type Tables = Database['public']['Tables'];
export type Row<T extends keyof Tables> = Tables[T]['Row'];
export type Insert<T extends keyof Tables> = Tables[T]['Insert'];
export type Update<T extends keyof Tables> = Tables[T]['Update'];
`;

  const target = join(process.cwd(), 'lib', 'db', 'types.ts');
  writeFileSync(target, output, 'utf8');
  console.log(`Wrote ${target} (${byTable.size} tables).`);
  await db.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
