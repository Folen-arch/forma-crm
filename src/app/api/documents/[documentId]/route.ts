import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { documents } from "@/db/schema";
import { getAuthenticatedWorkspace } from "@/lib/api-auth";
import { recordActivity } from "@/lib/activity";

type RouteContext = { params: Promise<{ documentId: string }> };

export async function DELETE(request: Request, { params }: RouteContext) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "database_not_configured" }, { status: 503 });
  }

  const { documentId } = await params;
  if (!z.string().uuid().safeParse(documentId).success) {
    return Response.json({ error: "Некорректный идентификатор документа." }, { status: 400 });
  }

  try {
    const identity = await getAuthenticatedWorkspace(request);
    if (!identity) return Response.json({ error: "unauthorized" }, { status: 401 });
    const [deleted] = await getDb().delete(documents)
      .where(and(eq(documents.id, documentId), eq(documents.workspaceId, identity.workspaceId)))
      .returning({ id: documents.id, name: documents.name });
    if (!deleted) return Response.json({ error: "Документ не найден." }, { status: 404 });
    await recordActivity({ workspaceId: identity.workspaceId, actorName: identity.user.name, action: "deleted", entityType: "document", entityName: deleted.name });
    return Response.json({ data: deleted, storage: "database" });
  } catch (error) {
    console.error("DELETE /api/documents/[documentId] failed", error);
    return Response.json({ error: "Не удалось удалить документ." }, { status: 500 });
  }
}
