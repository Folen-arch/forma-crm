import { activityEvents } from "@/db/schema";
import { getDb } from "@/db";

type ActivityAction = "created" | "updated" | "deleted" | "completed" | "reopened" | "uploaded";
type ActivityEntity = "client" | "project" | "task" | "invoice" | "document";

const actions: Record<ActivityAction, string> = {
  created: "создал(а)",
  updated: "обновил(а)",
  deleted: "удалил(а)",
  completed: "завершил(а)",
  reopened: "вернул(а) в работу",
  uploaded: "загрузил(а)",
};

const entities: Record<ActivityEntity, string> = {
  client: "клиента",
  project: "проект",
  task: "задачу",
  invoice: "счёт",
  document: "документ",
};

export async function recordActivity(
  event: {
    workspaceId: string;
    actorName: string;
    action: ActivityAction;
    entityType: ActivityEntity;
    entityName: string;
  },
) {
  try {
    await getDb().insert(activityEvents).values({
      workspaceId: event.workspaceId,
      actorName: event.actorName.slice(0, 120),
      action: actions[event.action],
      entityType: entities[event.entityType],
      entityName: event.entityName.slice(0, 180),
    });
  } catch (error) {
    console.error("Could not record workspace activity", error);
  }
}
