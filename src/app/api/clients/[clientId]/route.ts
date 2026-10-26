import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { clients, projects } from "@/db/schema";
import { getAuthenticatedWorkspace } from "@/lib/api-auth";
import { recordActivity } from "@/lib/activity";

const updateClientSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  company: z.string().trim().max(160).optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional(),
}).refine((value) => Object.keys(value).length > 0, "Передайте хотя бы одно поле для обновления.");

const statusLabels = {
  active: "В работе",
  awaiting_payment: "Ожидает оплаты",
  completed: "Завершён",
} as const;

type RouteContext = { params: Promise<{ clientId: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "database_not_configured" }, { status: 503 });
  }

  const { clientId } = await params;
  if (!z.string().uuid().safeParse(clientId).success) {
    return Response.json({ error: "Некорректный идентификатор клиента." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateClientSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Проверьте данные клиента." }, { status: 400 });
  }

  try {
    const database = getDb();
    const identity = await getAuthenticatedWorkspace(request);
    if (!identity) return Response.json({ error: "unauthorized" }, { status: 401 });
    const workspaceId = identity.workspaceId;
    const [updated] = await database.update(clients)
      .set({
        ...parsed.data,
        email: parsed.data.email === undefined ? undefined : parsed.data.email || null,
      })
      .where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)))
      .returning();

    if (!updated) return Response.json({ error: "Клиент не найден." }, { status: 404 });
    await recordActivity({ workspaceId, actorName: identity.user.name, action: "updated", entityType: "client", entityName: updated.name });

    const [latestProject] = await database.select().from(projects)
      .where(and(eq(projects.clientId, clientId), eq(projects.workspaceId, workspaceId)))
      .orderBy(desc(projects.createdAt))
      .limit(1);
    const initials = updated.name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();

    return Response.json({
      data: {
        id: updated.id,
        name: updated.name,
        company: updated.company,
        email: updated.email,
        phone: updated.phone,
        initials,
        color: updated.color,
        project: latestProject?.name ?? "Нет активного проекта",
        amount: latestProject?.budget ?? 0,
        status: latestProject ? statusLabels[latestProject.status] : statusLabels.active,
      },
      storage: "database",
    });
  } catch (error) {
    console.error("PATCH /api/clients/[clientId] failed", error);
    return Response.json({ error: "Не удалось обновить клиента." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "database_not_configured" }, { status: 503 });
  }

  const { clientId } = await params;
  if (!z.string().uuid().safeParse(clientId).success) {
    return Response.json({ error: "Некорректный идентификатор клиента." }, { status: 400 });
  }

  try {
    const database = getDb();
    const identity = await getAuthenticatedWorkspace(request);
    if (!identity) return Response.json({ error: "unauthorized" }, { status: 401 });
    const workspaceId = identity.workspaceId;
    const [deleted] = await database.delete(clients)
      .where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)))
      .returning({ id: clients.id, name: clients.name });

    if (!deleted) return Response.json({ error: "Клиент не найден." }, { status: 404 });
    await recordActivity({ workspaceId, actorName: identity.user.name, action: "deleted", entityType: "client", entityName: deleted.name });
    return Response.json({ data: deleted, storage: "database" });
  } catch (error) {
    console.error("DELETE /api/clients/[clientId] failed", error);
    return Response.json({ error: "Не удалось удалить клиента." }, { status: 500 });
  }
}
