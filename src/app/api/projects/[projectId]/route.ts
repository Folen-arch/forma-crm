import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { clients, projects } from "@/db/schema";
import { getAuthenticatedWorkspace } from "@/lib/api-auth";
import { recordActivity } from "@/lib/activity";

const updateProjectSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  clientName: z.string().trim().max(160).optional(),
  budget: z.number().int().min(0).max(100_000_000).optional(),
  status: z.enum(["active", "awaiting_payment", "completed"]).optional(),
}).refine((value) => Object.keys(value).length > 0, "Передайте хотя бы одно поле для обновления.");

const statusLabels = {
  active: "В работе",
  awaiting_payment: "Ожидает оплаты",
  completed: "Завершён",
} as const;

type RouteContext = { params: Promise<{ projectId: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "database_not_configured" }, { status: 503 });
  }

  const { projectId } = await params;
  if (!z.string().uuid().safeParse(projectId).success) {
    return Response.json({ error: "Некорректный идентификатор проекта." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Проверьте данные проекта." }, { status: 400 });
  }

  try {
    const database = getDb();
    const identity = await getAuthenticatedWorkspace(request);
    if (!identity) return Response.json({ error: "unauthorized" }, { status: 401 });
    const workspaceId = identity.workspaceId;
    const values: Partial<typeof projects.$inferInsert> = {
      name: parsed.data.name,
      budget: parsed.data.budget,
      status: parsed.data.status,
    };

    if (parsed.data.clientName !== undefined) {
      const clientName = parsed.data.clientName;
      if (!clientName) {
        values.clientId = null;
        values.clientName = null;
      } else {
        const [matchedClient] = await database.select({ id: clients.id, name: clients.name })
          .from(clients)
          .where(and(
            eq(clients.workspaceId, workspaceId),
            or(eq(clients.name, clientName), eq(clients.company, clientName)),
          ))
          .limit(1);
        values.clientId = matchedClient?.id ?? null;
        values.clientName = matchedClient?.name ?? clientName;
      }
    }

    const [updated] = await database.update(projects)
      .set(values)
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)))
      .returning();

    if (!updated) return Response.json({ error: "Проект не найден." }, { status: 404 });
    await recordActivity({ workspaceId, actorName: identity.user.name, action: "updated", entityType: "project", entityName: updated.name });
    return Response.json({
      data: {
        id: updated.id,
        name: updated.name,
        clientName: updated.clientName ?? "",
        budget: updated.budget,
        status: statusLabels[updated.status],
        color: "dot-green",
      },
      storage: "database",
    });
  } catch (error) {
    console.error("PATCH /api/projects/[projectId] failed", error);
    return Response.json({ error: "Не удалось обновить проект." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "database_not_configured" }, { status: 503 });
  }

  const { projectId } = await params;
  if (!z.string().uuid().safeParse(projectId).success) {
    return Response.json({ error: "Некорректный идентификатор проекта." }, { status: 400 });
  }

  try {
    const database = getDb();
    const identity = await getAuthenticatedWorkspace(request);
    if (!identity) return Response.json({ error: "unauthorized" }, { status: 401 });
    const workspaceId = identity.workspaceId;
    const [deleted] = await database.delete(projects)
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)))
      .returning({ id: projects.id, name: projects.name });

    if (!deleted) return Response.json({ error: "Проект не найден." }, { status: 404 });
    await recordActivity({ workspaceId, actorName: identity.user.name, action: "deleted", entityType: "project", entityName: deleted.name });
    return Response.json({ data: deleted, storage: "database" });
  } catch (error) {
    console.error("DELETE /api/projects/[projectId] failed", error);
    return Response.json({ error: "Не удалось удалить проект." }, { status: 500 });
  }
}
