import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { workspaces } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getWorkspaceIdForUser } from "@/db/workspace";
import Dashboard from "./dashboard";

export const instant = false;

export default async function HomePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const database = getDb();
  const workspaceId = await getWorkspaceIdForUser(database, session.user.id, session.user.name);
  const [workspace] = await database.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);

  return <Dashboard user={{ name: session.user.name, email: session.user.email }} workspaceName={workspace?.name ?? "Forma Studio"} />;
}
