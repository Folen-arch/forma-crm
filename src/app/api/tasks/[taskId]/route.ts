import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { projects, tasks } from "@/db/schema";
import { getAuthenticatedWorkspace } from "@/lib/api-auth";
import { recordActivity } from "@/lib/activity";

const validDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const updateTaskSchema = z.object({
  title: z.string().trim().min(2).max(180).optional(),
  projectName: z.string().trim().max(160).optional(),
  dueDate: z.string().refine(validDate, "Выберите корректную дату задачи.").optional(),
  dueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  isCompleted: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, "Передайте хотя бы одно поле для обновления.");

type RouteContext = { params: Promise<{ taskId: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "database_not_configured" }, { status: 503 });
  }

  const { taskId } = await params;
  if (!z.string().uuid().safeParse(taskId).success) {
    return Response.json({ error: "Некорректный идентификатор задачи." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateTaskSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Проверьте данные задачи." }, { status: 400 });
  }

  try {
    const database = getDb();
    const identity = await getAuthenticatedWorkspace(request);
    if (!identity) return Response.json({ error: "unauthorized" }, { status: 401 });
    const workspaceId = identity.workspaceId;
    const values: Partial<typeof tasks.$inferInsert> = {
      title: parsed.data.title,
      dueDate: parsed.data.dueDate,
      dueTime: parsed.data.dueTime,
      isCompleted: parsed.data.isCompleted,
    };

    if (parsed.data.projectName !== undefined) {
      const projectName = parsed.data.projectName;
      if (!projectName) {
        values.projectId = null;
        values.projectName = null;
      } else {
        const [matchedProject] = await database.select({ id: projects.id, name: projects.name })
          .from(projects)
          .where(and(eq(projects.workspaceId, workspaceId), eq(projects.name, projectName)))
          .limit(1);
        values.projectId = matchedProject?.id ?? null;
        values.projectName = matchedProject?.name ?? projectName;
      }
    }

    const [updated] = await database.update(tasks)
      .set(values)
      .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspaceId)))
      .returning();
    if (!updated) return Response.json({ error: "Задача не найдена." }, { status: 404 });
    if (parsed.data.isCompleted !== undefined) {
      await recordActivity({ workspaceId, actorName: identity.user.name, action: parsed.data.isCompleted ? "completed" : "reopened", entityType: "task", entityName: updated.title });
    } else {
      await recordActivity({ workspaceId, actorName: identity.user.name, action: "updated", entityType: "task", entityName: updated.title });
    }

    return Response.json({
      data: {
        id: updated.id,
        title: updated.title,
        projectId: updated.projectId,
        projectName: updated.projectName ?? "",
        dueDate: updated.dueDate,
        dueTime: updated.dueTime,
        isCompleted: updated.isCompleted,
      },
      storage: "database",
    });
  } catch (error) {
    console.error("PATCH /api/tasks/[taskId] failed", error);
    return Response.json({ error: "Не удалось обновить задачу." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "database_not_configured" }, { status: 503 });
  }

  const { taskId } = await params;
  if (!z.string().uuid().safeParse(taskId).success) {
    return Response.json({ error: "Некорректный идентификатор задачи." }, { status: 400 });
  }

  try {
    const database = getDb();
    const identity = await getAuthenticatedWorkspace(request);
    if (!identity) return Response.json({ error: "unauthorized" }, { status: 401 });
    const workspaceId = identity.workspaceId;
    const [deleted] = await database.delete(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspaceId)))
      .returning({ id: tasks.id, title: tasks.title });
    if (!deleted) return Response.json({ error: "Задача не найдена." }, { status: 404 });
    await recordActivity({ workspaceId, actorName: identity.user.name, action: "deleted", entityType: "task", entityName: deleted.title });
    return Response.json({ data: deleted, storage: "database" });
  } catch (error) {
    console.error("DELETE /api/tasks/[taskId] failed", error);
    return Response.json({ error: "Не удалось удалить задачу." }, { status: 500 });
  }
}
