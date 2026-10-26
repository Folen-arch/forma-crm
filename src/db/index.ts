import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema";

type Database = ReturnType<typeof drizzle<typeof schema>>;

const globalForDatabase = globalThis as typeof globalThis & {
  formaSql?: Sql;
  formaDb?: Database;
};

export function getDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is missing. Add it to .env.local to enable PostgreSQL storage.");
  }

  if (!globalForDatabase.formaSql) {
    globalForDatabase.formaSql = postgres(connectionString, {
      max: 10,
      prepare: false,
    });
  }

  if (!globalForDatabase.formaDb) {
    globalForDatabase.formaDb = drizzle(globalForDatabase.formaSql, { schema });
  }

  return globalForDatabase.formaDb;
}

export async function closeDb() {
  await globalForDatabase.formaSql?.end({ timeout: 5 });
  globalForDatabase.formaSql = undefined;
  globalForDatabase.formaDb = undefined;
}
