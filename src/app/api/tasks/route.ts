import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { projects, tasks } from "@/db/schema";
import { getAuthenticatedWorkspace } from "@/lib/api-auth";
import { recordActivity } from "@/lib/activity";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const validDate = (value: string) => {
  if (!datePattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const createTaskSchema = z.object({
  title: z.string().trim().min(2, "Введите название задачи.").max(180),
  projectName: z.string().trim().max(160).optional().default(""),
  dueDate: z.string().refine(validDate, "Выберите корректную дату задачи."),
  dueTime: z.string().regex(timePattern, "Укажите время в формате ЧЧ:ММ."),
});

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "database_not_configured" }, { status: 503 });
  }

  try {
    const database = getDb();
    const identity = await getAuthenticatedWorkspace(request);
    if (!identity) return Response.json({ error: "unauthorized" }, { status: 401 });
    const workspaceId = identity.workspaceId;
    const [taskRows, projectRows] = await Promise.all([
      database.select().from(tasks)
        .where(eq(tasks.workspaceId, workspaceId))
        .orderBy(asc(tasks.dueDate), asc(tasks.dueTime)),
      database.select({ id: projects.id, name: projects.name }).from(projects)
        .where(eq(projects.workspaceId, workspaceId)),
    ]);
    const projectById = new Map(projectRows.map((project) => [project.id, project.name]));

    return Response.json({
      data: taskRows.map((task) => ({
        id: task.id,
        title: task.title,
        projectId: task.projectId,
        projectName: task.projectId ? projectById.get(task.projectId) ?? task.projectName ?? "" : task.projectName ?? "",
        dueDate: task.dueDate,
        dueTime: task.dueTime,
        isCompleted: task.isCompleted,
      })),
      storage: "database",
    });
  } catch (error) {
    console.error("GET /api/tasks failed", error);
    return Response.json({ error: "database_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "database_not_configured" }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Проверьте данные задачи." }, { status: 400 });
  }

  try {
    const database = getDb();
    const identity = await getAuthenticatedWorkspace(request);
    if (!identity) return Response.json({ error: "unauthorized" }, { status: 401 });
    const workspaceId = identity.workspaceId;
    const projectName = parsed.data.projectName;
    const matchedProjects = projectName
      ? await database.select({ id: projects.id, name: projects.name })
          .from(projects)
          .where(and(eq(projects.workspaceId, workspaceId), eq(projects.name, projectName)))
          .limit(1)
      : [];
    const [created] = await database.insert(tasks).values({
      workspaceId,
      projectId: matchedProjects[0]?.id ?? null,
      projectName: projectName || null,
      title: parsed.data.title,
      dueDate: parsed.data.dueDate,
      dueTime: parsed.data.dueTime,
    }).returning();

    if (!created) throw new Error("Task insert did not return a row.");
    await recordActivity({ workspaceId, actorName: identity.user.name, action: "created", entityType: "task", entityName: created.title });
    return Response.json({
      data: {
        id: created.id,
        title: created.title,
        projectId: created.projectId,
        projectName: created.projectName ?? "",
        dueDate: created.dueDate,
        dueTime: created.dueTime,
        isCompleted: created.isCompleted,
      },
      storage: "database",
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/tasks failed", error);
    return Response.json({ error: "Не удалось сохранить задачу." }, { status: 500 });
  }
}
