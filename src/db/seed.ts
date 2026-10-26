import { count, eq } from "drizzle-orm";
import { config } from "dotenv";
import { closeDb, getDb } from "@/db";
import { clients, invoices, projects, tasks } from "@/db/schema";
import { getDefaultWorkspaceId } from "@/db/workspace";

config({ path: ".env.local" });
config();

const demoClients = [
  { name: "Анна Коваль", company: "Northstar Studio", color: "coral" },
  { name: "Марк Левин", company: "Mono Coffee", color: "lavender" },
  { name: "Ирина Бойко", company: "Forma Architects", color: "sage" },
  { name: "Денис Романюк", company: "Goodsoil", color: "butter" },
];

async function seed() {
  const database = getDb();
  const workspaceId = await getDefaultWorkspaceId(database);
  const [{ value: clientCount }] = await database
    .select({ value: count() })
    .from(clients)
    .where(eq(clients.workspaceId, workspaceId));

  if (clientCount > 0) {
    console.log("The Forma Studio workspace already has clients; seed data was not added.");
    return;
  }

  const insertedClients = await database.insert(clients).values(demoClients.map((client) => ({
    ...client,
    workspaceId,
  }))).returning();

  const insertedProjects = await database.insert(projects).values([
    { workspaceId, clientId: insertedClients[0].id, name: "Айдентика бренда", budget: 84_000, status: "active" },
    { workspaceId, clientId: insertedClients[1].id, name: "Сайт и магазин", budget: 126_000, status: "awaiting_payment" },
    { workspaceId, clientId: insertedClients[2].id, name: "Дизайн-система", budget: 67_500, status: "active" },
    { workspaceId, clientId: insertedClients[3].id, name: "Упаковка продукта", budget: 42_000, status: "completed" },
  ]).returning();

  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const datePart = (type: Intl.DateTimeFormatPartTypes) => dateParts.find((part) => part.type === type)?.value ?? "00";
  const dueDate = `${datePart("year")}-${datePart("month")}-${datePart("day")}`;
  await database.insert(tasks).values([
    { workspaceId, projectId: insertedProjects[0].id, projectName: insertedProjects[0].name, title: "Отправить макеты Анне", dueDate, dueTime: "10:30", isCompleted: true },
    { workspaceId, projectId: insertedProjects[1].id, projectName: insertedProjects[1].name, title: "Позвонить Марку", dueDate, dueTime: "13:00" },
    { workspaceId, projectId: insertedProjects[3].id, projectName: insertedProjects[3].name, title: "Подготовить счёт", dueDate, dueTime: "15:30" },
  ]);

  const previousDate = new Date(`${dueDate}T00:00:00.000Z`);
  previousDate.setUTCDate(previousDate.getUTCDate() - 1);
  const overdueDate = previousDate.toISOString().slice(0, 10);
  await database.insert(invoices).values([
    { workspaceId, projectId: insertedProjects[1].id, projectName: insertedProjects[1].name, clientName: insertedClients[1].name, invoiceNumber: "INV-2026-001", amount: 126_000, dueDate, status: "sent" },
    { workspaceId, projectId: insertedProjects[2].id, projectName: insertedProjects[2].name, clientName: insertedClients[2].name, invoiceNumber: "INV-2026-002", amount: 67_500, dueDate, status: "paid" },
    { workspaceId, projectId: insertedProjects[3].id, projectName: insertedProjects[3].name, clientName: insertedClients[3].name, invoiceNumber: "INV-2026-003", amount: 42_000, dueDate: overdueDate, status: "overdue" },
  ]);

  console.log(`Added ${insertedClients.length} demo clients, ${insertedProjects.length} projects, 3 tasks, and 3 invoices.`);
}

seed()
  .catch((error: unknown) => {
    console.error("Could not seed Forma Studio:", error);
    process.exitCode = 1;
  })
  .finally(closeDb);
