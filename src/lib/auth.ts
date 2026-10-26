import { config } from "dotenv";
import { and, eq, isNull } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb } from "@/db";
import { workspaces } from "@/db/schema";
import { getWorkspaceIdForUser } from "@/db/workspace";

config({ path: ".env.local" });
config();

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) throw new Error("BETTER_AUTH_SECRET is missing. Add it to .env.local.");

export const auth = betterAuth({
  appName: "Forma Studio",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret,
  database: drizzleAdapter(getDb(), { provider: "pg" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          const database = getDb();
          await database.update(workspaces)
            .set({ ownerUserId: user.id })
            .where(and(eq(workspaces.slug, "forma-studio"), isNull(workspaces.ownerUserId)));
          await getWorkspaceIdForUser(database, user.id, user.name);
        },
      },
    },
  },
});
