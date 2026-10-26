import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { clients, invoices, projects } from "@/db/schema";
import { getAuthenticatedWorkspace } from "@/lib/api-auth";
import { recordActivity } from "@/lib/activity";

const validDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const createInvoiceSchema = z.object({
  invoiceNumber: z.string().trim().max(40).optional().default(""),
  projectName: z.string().trim().max(160).optional().default(""),
  amount: z.number().int().min(1).max(100_000_000),
  dueDate: z.string().refine(validDate, "Выберите корректный срок оплаты."),
  status: z.enum(["draft", "sent", "paid", "overdue"]).optional().default("sent"),
});

const statusLabels = {
  draft: "Черновик",
  sent: "Отправлен",
  paid: "Оплачен",
  overdue: "Просрочен",
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
    const [invoiceRows, projectRows, clientRows] = await Promise.all([
      database.select().from(invoices).where(eq(invoices.workspaceId, workspaceId)).orderBy(asc(invoices.dueDate)),
      database.select({ id: projects.id, name: projects.name, clientId: projects.clientId }).from(projects).where(eq(projects.workspaceId, workspaceId)),
      database.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.workspaceId, workspaceId)),
    ]);
    const projectById = new Map(projectRows.map((project) => [project.id, project]));
    const clientById = new Map(clientRows.map((client) => [client.id, client.name]));

    return Response.json({
      data: invoiceRows.map((invoice) => {
        const project = invoice.projectId ? projectById.get(invoice.projectId) : undefined;
        return {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          projectId: invoice.projectId,
          projectName: project?.name ?? invoice.projectName ?? "",
          clientName: project?.clientId ? clientById.get(project.clientId) ?? invoice.clientName ?? "" : invoice.clientName ?? "",
          amount: invoice.amount,
          dueDate: invoice.dueDate,
          status: invoice.status,
          statusLabel: statusLabels[invoice.status],
        };
      }),
      storage: "database",
    });
  } catch (error) {
    console.error("GET /api/invoices failed", error);
    return Response.json({ error: "database_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "database_not_configured" }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Проверьте данные счёта." }, { status: 400 });
  }

  try {
    const database = getDb();
    const identity = await getAuthenticatedWorkspace(request);
    if (!identity) return Response.json({ error: "unauthorized" }, { status: 401 });
    const workspaceId = identity.workspaceId;
    const projectName = parsed.data.projectName;
    const [project] = projectName
      ? await database.select({ id: projects.id, name: projects.name, clientId: projects.clientId })
          .from(projects)
          .where(and(eq(projects.workspaceId, workspaceId), eq(projects.name, projectName)))
          .limit(1)
      : [];
    const [client] = project?.clientId
      ? await database.select({ name: clients.name }).from(clients).where(and(eq(clients.id, project.clientId), eq(clients.workspaceId, workspaceId))).limit(1)
      : [];
    const invoiceNumber = parsed.data.invoiceNumber || `INV-${parsed.data.dueDate.replaceAll("-", "")}-${randomUUID().slice(0, 6).toUpperCase()}`;
    const [created] = await database.insert(invoices).values({
      workspaceId,
      projectId: project?.id ?? null,
      projectName: (project?.name ?? projectName) || null,
      clientName: client?.name ?? null,
      invoiceNumber,
      amount: parsed.data.amount,
      dueDate: parsed.data.dueDate,
      status: parsed.data.status,
    }).returning();

    if (!created) throw new Error("Invoice insert did not return a row.");
    await recordActivity({ workspaceId, actorName: identity.user.name, action: "created", entityType: "invoice", entityName: created.invoiceNumber });
    return Response.json({
      data: {
        id: created.id,
        invoiceNumber: created.invoiceNumber,
        projectId: created.projectId,
        projectName: created.projectName ?? "",
        clientName: created.clientName ?? "",
        amount: created.amount,
        dueDate: created.dueDate,
        status: created.status,
        statusLabel: statusLabels[created.status],
      },
      storage: "database",
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/invoices failed", error);
    return Response.json({ error: "Не удалось сохранить счёт. Проверьте номер и подключение к базе данных." }, { status: 500 });
  }
}
