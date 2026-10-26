import { and, count, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { activityEvents } from "@/db/schema";
import { getAuthenticatedWorkspace } from "@/lib/api-auth";

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return Response.json({ error: "database_not_configured" }, { status: 503 });

  try {
    const identity = await getAuthenticatedWorkspace(request);
    if (!identity) return Response.json({ error: "unauthorized" }, { status: 401 });
    const database = getDb();
    const [events, [unread]] = await Promise.all([
      database.select({
        id: activityEvents.id,
        actorName: activityEvents.actorName,
        action: activityEvents.action,
        entityType: activityEvents.entityType,
        entityName: activityEvents.entityName,
        isRead: activityEvents.isRead,
        createdAt: activityEvents.createdAt,
      }).from(activityEvents)
        .where(eq(activityEvents.workspaceId, identity.workspaceId))
        .orderBy(desc(activityEvents.createdAt))
        .limit(100),
      database.select({ value: count() }).from(activityEvents)
        .where(and(eq(activityEvents.workspaceId, identity.workspaceId), eq(activityEvents.isRead, false))),
    ]);

    return Response.json({
      data: events.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
      unreadCount: unread?.value ?? 0,
      storage: "database",
    });
  } catch (error) {
    console.error("GET /api/activity failed", error);
    return Response.json({ error: "Не удалось загрузить историю активности." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return Response.json({ error: "database_not_configured" }, { status: 503 });

  try {
    const identity = await getAuthenticatedWorkspace(request);
    if (!identity) return Response.json({ error: "unauthorized" }, { status: 401 });
    await getDb().update(activityEvents)
      .set({ isRead: true })
      .where(and(eq(activityEvents.workspaceId, identity.workspaceId), eq(activityEvents.isRead, false)));
    return Response.json({ storage: "database" });
  } catch (error) {
    console.error("POST /api/activity failed", error);
    return Response.json({ error: "Не удалось обновить уведомления." }, { status: 500 });
  }
}
