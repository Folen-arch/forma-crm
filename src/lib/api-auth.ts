import { auth } from "@/lib/auth";
import { getDb } from "@/db";
import { getWorkspaceIdForUser } from "@/db/workspace";

export async function getAuthenticatedWorkspace(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;

  const workspaceId = await getWorkspaceIdForUser(getDb(), session.user.id, session.user.name);
  return { workspaceId, user: session.user };
}
