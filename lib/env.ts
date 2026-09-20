import 'server-only';
import { formatEnvIssues, serverEnvSchema, type ServerEnv } from './env.schema';

const parsed = serverEnvSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `Invalid server environment:\n${formatEnvIssues(parsed.error)}\n\nSee .env.example.`,
  );
}

export const env: ServerEnv = parsed.data;
export type { ServerEnv };
