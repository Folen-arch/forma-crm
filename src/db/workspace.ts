import { eq } from "drizzle-orm";
import type { getDb } from "./index";
import { workspaces } from "./schema";

export async function getDefaultWorkspaceId(database: ReturnType<typeof getDb>) {
  const slug = "forma-studio";
  const [workspace] = await database
    .insert(workspaces)
    .values({ name: "Forma Studio", slug })
    .onConflictDoNothing({ target: workspaces.slug })
    .returning({ id: workspaces.id });

  if (workspace) return workspace.id;

  const [existing] = await database
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.slug, slug))
    .limit(1);

  if (!existing) throw new Error("Could not load the Forma Studio workspace.");
  return existing.id;
}

export async function getWorkspaceIdForUser(
  database: ReturnType<typeof getDb>,
  userId: string,
  userName: string,
) {
  const [existing] = await database
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.ownerUserId, userId))
    .limit(1);

  if (existing) return existing.id;

  const ownerKey = userId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(-24);
  const slug = `forma-${ownerKey || "studio"}`;
  const displayName = userName.trim() || "Forma";
  const [created] = await database
    .insert(workspaces)
    .values({ ownerUserId: userId, name: `${displayName} Studio`, slug })
    .onConflictDoNothing({ target: workspaces.ownerUserId })
    .returning({ id: workspaces.id });

  if (created) return created.id;

  const [concurrent] = await database
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.ownerUserId, userId))
    .limit(1);

  if (!concurrent) throw new Error("Could not create a workspace for the signed-in user.");
  return concurrent.id;
}
