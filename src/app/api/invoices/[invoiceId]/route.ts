import { and, eq } from "drizzle-orm";
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

const updateInvoiceSchema = z.object({
  invoiceNumber: z.string().trim().min(1).max(40).optional(),
  projectName: z.string().trim().max(160).optional(),
  amount: z.number().int().min(1).max(100_000_000).optional(),
  dueDate: z.string().refine(validDate, "Выберите корректный срок оплаты.").optional(),
  status: z.enum(["draft", "sent", "paid", "overdue"]).optional(),
}).refine((value) => Object.keys(value).length > 0, "Передайте хотя бы одно поле для обновления.");

const statusLabels = {
  draft: "Черновик",
  sent: "Отправлен",
  paid: "Оплачен",
  overdue: "Просрочен",
} as const;

type RouteContext = { params: Promise<{ invoiceId: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "database_not_configured" }, { status: 503 });
  }

  const { invoiceId } = await params;
  if (!z.string().uuid().safeParse(invoiceId).success) {
    return Response.json({ error: "Некорректный идентификатор счёта." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Проверьте данные счёта." }, { status: 400 });
  }

  try {
    const database = getDb();
    const identity = await getAuthenticatedWorkspace(request);
    if (!identity) return Response.json({ error: "unauthorized" }, { status: 401 });
    const workspaceId = identity.workspaceId;
    const values: Partial<typeof invoices.$inferInsert> = {
      invoiceNumber: parsed.data.invoiceNumber,
      amount: parsed.data.amount,
      dueDate: parsed.data.dueDate,
      status: parsed.data.status,
    };

    if (parsed.data.projectName !== undefined) {
      const projectName = parsed.data.projectName;
      if (!projectName) {
        values.projectId = null;
        values.projectName = null;
        values.clientName = null;
      } else {
        const [project] = await database.select({ id: projects.id, name: projects.name, clientId: projects.clientId })
          .from(projects)
          .where(and(eq(projects.workspaceId, workspaceId), eq(projects.name, projectName)))
          .limit(1);
        const [client] = project?.clientId
          ? await database.select({ name: clients.name }).from(clients).where(and(eq(clients.id, project.clientId), eq(clients.workspaceId, workspaceId))).limit(1)
          : [];
        values.projectId = project?.id ?? null;
        values.projectName = project?.name ?? projectName;
        values.clientName = client?.name ?? null;
      }
    }

    const [updated] = await database.update(invoices)
      .set(values)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, workspaceId)))
      .returning();
    if (!updated) return Response.json({ error: "Счёт не найден." }, { status: 404 });
    await recordActivity({ workspaceId, actorName: identity.user.name, action: "updated", entityType: "invoice", entityName: updated.invoiceNumber });

    return Response.json({
      data: {
        id: updated.id,
        invoiceNumber: updated.invoiceNumber,
        projectId: updated.projectId,
        projectName: updated.projectName ?? "",
        clientName: updated.clientName ?? "",
        amount: updated.amount,
        dueDate: updated.dueDate,
        status: updated.status,
        statusLabel: statusLabels[updated.status],
      },
      storage: "database",
    });
  } catch (error) {
    console.error("PATCH /api/invoices/[invoiceId] failed", error);
    return Response.json({ error: "Не удалось обновить счёт." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "database_not_configured" }, { status: 503 });
  }

  const { invoiceId } = await params;
  if (!z.string().uuid().safeParse(invoiceId).success) {
    return Response.json({ error: "Некорректный идентификатор счёта." }, { status: 400 });
  }

  try {
    const database = getDb();
    const identity = await getAuthenticatedWorkspace(request);
    if (!identity) return Response.json({ error: "unauthorized" }, { status: 401 });
    const workspaceId = identity.workspaceId;
    const [deleted] = await database.delete(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, workspaceId)))
      .returning({ id: invoices.id, invoiceNumber: invoices.invoiceNumber });
    if (!deleted) return Response.json({ error: "Счёт не найден." }, { status: 404 });
    await recordActivity({ workspaceId, actorName: identity.user.name, action: "deleted", entityType: "invoice", entityName: deleted.invoiceNumber });
    return Response.json({ data: deleted, storage: "database" });
  } catch (error) {
    console.error("DELETE /api/invoices/[invoiceId] failed", error);
    return Response.json({ error: "Не удалось удалить счёт." }, { status: 500 });
  }
}
