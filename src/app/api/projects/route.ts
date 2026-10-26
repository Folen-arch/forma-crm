import { and, desc, eq, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { clients, projects } from "@/db/schema";
import { getAuthenticatedWorkspace } from "@/lib/api-auth";
import { recordActivity } from "@/lib/activity";

const createProjectSchema = z.object({
  name: z.string().trim().min(2, "Введите название проекта.").max(160),
  clientName: z.string().trim().max(160).optional().default(""),
  budget: z.number().int().min(0).max(100_000_000).optional().default(0),
  status: z.enum(["active", "awaiting_payment", "completed"]).optional().default("active"),
});

const statusLabels = {
  active: "В работе",
  awaiting_payment: "Ожидает оплаты",
  completed: "Завершён",
} as const;

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "database_not_configured" }, { status: 503 });
  }

  try {
    const database = getDb();
    const identity = await getAuthenticatedWorkspace(request);
    if (!identity) return Response.json({ error: "unauthorized" }, { status: 401 });
    const workspaceId = identity.workspaceId;
    const [projectRows, clientRows] = await Promise.all([
      database.select().from(projects).where(eq(projects.workspaceId, workspaceId)).orderBy(desc(projects.createdAt)),
      database.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.workspaceId, workspaceId)),
    ]);
    const clientById = new Map(clientRows.map((client) => [client.id, client.name]));

    return Response.json({
      data: projectRows.map((project, index) => ({
        id: project.id,
        name: project.name,
        clientName: project.clientId ? clientById.get(project.clientId) ?? project.clientName ?? "" : project.clientName ?? "",
        budget: project.budget,
        status: statusLabels[project.status],
        color: ["dot-green", "dot-violet", "dot-orange"][index % 3],
      })),
      storage: "database",
    });
  } catch (error) {
    console.error("GET /api/projects failed", error);
    return Response.json({ error: "database_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "database_not_configured" }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Проверьте данные проекта." }, { status: 400 });
  }

  try {
    const database = getDb();
    const identity = await getAuthenticatedWorkspace(request);
    if (!identity) return Response.json({ error: "unauthorized" }, { status: 401 });
    const workspaceId = identity.workspaceId;
    const clientName = parsed.data.clientName;
    const matchedClients = clientName
      ? await database.select({ id: clients.id, name: clients.name })
          .from(clients)
          .where(and(
            eq(clients.workspaceId, workspaceId),
            or(eq(clients.name, clientName), eq(clients.company, clientName)),
          ))
          .limit(1)
      : [];
    const [created] = await database.insert(projects).values({
      workspaceId,
      clientId: matchedClients[0]?.id ?? null,
      clientName: clientName || null,
      name: parsed.data.name,
      budget: parsed.data.budget,
      status: parsed.data.status,
    }).returning();

    if (!created) throw new Error("Project insert did not return a row.");
    await recordActivity({ workspaceId, actorName: identity.user.name, action: "created", entityType: "project", entityName: created.name });
    return Response.json({
      data: {
        id: created.id,
        name: created.name,
        clientName: created.clientName ?? "",
        budget: created.budget,
        status: statusLabels[created.status],
        color: "dot-green",
      },
      storage: "database",
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/projects failed", error);
    return Response.json({ error: "Не удалось сохранить проект. Проверьте подключение к базе данных." }, { status: 500 });
  }
}
