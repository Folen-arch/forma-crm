import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { clients, projects } from "@/db/schema";
import { getAuthenticatedWorkspace } from "@/lib/api-auth";
import { recordActivity } from "@/lib/activity";

const createClientSchema = z.object({
  name: z.string().trim().min(2, "Введите имя клиента.").max(120),
  company: z.string().trim().max(160).optional().default(""),
  email: z.string().trim().email("Проверьте адрес электронной почты.").optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional(),
});

const statusLabels = {
  active: "В работе",
  awaiting_payment: "Ожидает оплаты",
  completed: "Завершён",
} as const;

function toClientDto(client: typeof clients.$inferSelect, project?: typeof projects.$inferSelect) {
  const initials = client.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();

  return {
    id: client.id,
    name: client.name,
    company: client.company,
    initials,
    color: client.color,
    project: project?.name ?? "Нет активного проекта",
    amount: project?.budget ?? 0,
    status: project ? statusLabels[project.status] : statusLabels.active,
  };
}

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "database_not_configured" }, { status: 503 });
  }

  try {
    const database = getDb();
    const identity = await getAuthenticatedWorkspace(request);
    if (!identity) return Response.json({ error: "unauthorized" }, { status: 401 });
    const workspaceId = identity.workspaceId;
    const [clientRows, projectRows] = await Promise.all([
      database.select().from(clients).where(eq(clients.workspaceId, workspaceId)).orderBy(desc(clients.createdAt)),
      database.select().from(projects).where(eq(projects.workspaceId, workspaceId)).orderBy(desc(projects.createdAt)),
    ]);

    const latestProjectByClient = new Map<string, typeof projects.$inferSelect>();
    for (const project of projectRows) {
      if (project.clientId && !latestProjectByClient.has(project.clientId)) {
        latestProjectByClient.set(project.clientId, project);
      }
    }

    return Response.json({
      data: clientRows.map((client) => toClientDto(client, latestProjectByClient.get(client.id))),
      storage: "database",
    });
  } catch (error) {
    console.error("GET /api/clients failed", error);
    return Response.json({ error: "database_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "database_not_configured" }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createClientSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Проверьте данные клиента." }, { status: 400 });
  }

  try {
    const database = getDb();
    const identity = await getAuthenticatedWorkspace(request);
    if (!identity) return Response.json({ error: "unauthorized" }, { status: 401 });
    const workspaceId = identity.workspaceId;
    const [created] = await database.insert(clients).values({
      workspaceId,
      name: parsed.data.name,
      company: parsed.data.company,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
    }).returning();

    if (!created) throw new Error("Client insert did not return a row.");
    await recordActivity({ workspaceId, actorName: identity.user.name, action: "created", entityType: "client", entityName: created.name });
    return Response.json({ data: toClientDto(created), storage: "database" }, { status: 201 });
  } catch (error) {
    console.error("POST /api/clients failed", error);
    return Response.json({ error: "Не удалось сохранить клиента. Проверьте подключение к базе данных." }, { status: 500 });
  }
}
