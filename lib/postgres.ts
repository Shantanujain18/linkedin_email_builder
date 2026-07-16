import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/schema";

const globalForDb = globalThis as unknown as { pgSql?: ReturnType<typeof postgres>; drizzleDb?: ReturnType<typeof drizzle> };

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Use the Supabase Postgres connection string.");
  if (!globalForDb.pgSql) {
    globalForDb.pgSql = postgres(url, { prepare: false, max: 10 });
  }
  return globalForDb.pgSql;
}

export function getDb() {
  if (!globalForDb.drizzleDb) {
    globalForDb.drizzleDb = drizzle(getSql(), { schema });
  }
  return globalForDb.drizzleDb;
}
