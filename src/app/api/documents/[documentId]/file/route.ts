import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { documents } from "@/db/schema";
import { getAuthenticatedWorkspace } from "@/lib/api-auth";

type RouteContext = { params: Promise<{ documentId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
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
    const [document] = await getDb().select({
      name: documents.name,
      contentType: documents.contentType,
      data: documents.data,
    }).from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.workspaceId, identity.workspaceId)))
      .limit(1);

    if (!document) return Response.json({ error: "Документ не найден." }, { status: 404 });

    const body = new ArrayBuffer(document.data.byteLength);
    new Uint8Array(body).set(document.data);
    const fallbackName = document.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
    const encodedName = encodeURIComponent(document.name).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
    return new Response(body, {
      headers: {
        "Content-Type": document.contentType,
        "Content-Length": String(document.data.byteLength),
        "Content-Disposition": `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/documents/[documentId]/file failed", error);
    return Response.json({ error: "Не удалось скачать документ." }, { status: 500 });
  }
}
