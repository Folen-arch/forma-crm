import { Buffer } from "node:buffer";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { clients, documents, projects } from "@/db/schema";
import { getAuthenticatedWorkspace } from "@/lib/api-auth";
import { recordActivity } from "@/lib/activity";

const maxFileSize = 4 * 1024 * 1024;
const fileKinds = {
  pdf: { contentType: "application/pdf", matches: (data: Buffer) => data.subarray(0, 5).toString("ascii") === "%PDF-" },
  png: { contentType: "image/png", matches: (data: Buffer) => data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  jpg: { contentType: "image/jpeg", matches: (data: Buffer) => data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff },
  jpeg: { contentType: "image/jpeg", matches: (data: Buffer) => data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff },
  webp: { contentType: "image/webp", matches: (data: Buffer) => data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP" },
  docx: { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", matches: (data: Buffer) => data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04 },
  xlsx: { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", matches: (data: Buffer) => data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04 },
} as const;

const associationId = z.string().uuid();

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "database_not_configured" }, { status: 503 });
  }

  try {
    const identity = await getAuthenticatedWorkspace(request);
    if (!identity) return Response.json({ error: "unauthorized" }, { status: 401 });
    const rows = await getDb().select({
      id: documents.id,
      name: documents.name,
      clientName: documents.clientName,
      projectName: documents.projectName,
      contentType: documents.contentType,
      size: documents.size,
      createdAt: documents.createdAt,
    }).from(documents)
      .where(eq(documents.workspaceId, identity.workspaceId))
      .orderBy(desc(documents.createdAt));

    return Response.json({
      data: rows.map((document) => ({ ...document, createdAt: document.createdAt.toISOString() })),
      storage: "database",
    });
  } catch (error) {
    console.error("GET /api/documents failed", error);
    return Response.json({ error: "database_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "database_not_configured" }, { status: 503 });
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (contentLength && contentLength > maxFileSize + 64 * 1024) {
    return Response.json({ error: "Файл слишком большой. Максимум — 4 МБ." }, { status: 413 });
  }

  try {
    const identity = await getAuthenticatedWorkspace(request);
    if (!identity) return Response.json({ error: "unauthorized" }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return Response.json({ error: "Выберите файл для загрузки." }, { status: 400 });
    }
    if (file.size > maxFileSize) {
      return Response.json({ error: "Файл слишком большой. Максимум — 4 МБ." }, { status: 413 });
    }

    const safeName = file.name.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "_").trim().slice(0, 180);
    const extension = safeName.split(".").pop()?.toLowerCase() as keyof typeof fileKinds | undefined;
    const kind = extension ? fileKinds[extension] : undefined;
    if (!kind) {
      return Response.json({ error: "Поддерживаются PDF, DOCX, XLSX, PNG, JPG и WEBP." }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    if (!kind.matches(bytes)) {
      return Response.json({ error: "Содержимое файла не соответствует его расширению." }, { status: 400 });
    }

    const rawProjectId = formData.get("projectId");
    const rawClientId = formData.get("clientId");
    const projectId = rawProjectId ? associationId.safeParse(rawProjectId) : null;
    const clientId = rawClientId ? associationId.safeParse(rawClientId) : null;
    if (projectId && !projectId.success || clientId && !clientId.success) {
      return Response.json({ error: "Выбранная привязка некорректна." }, { status: 400 });
    }

    const database = getDb();
    let linkedClientId: string | null = clientId?.success ? clientId.data : null;
    let clientName: string | null = null;
    let linkedProjectId: string | null = null;
    let projectName: string | null = null;

    if (clientId?.success) {
      const [client] = await database.select({ id: clients.id, name: clients.name })
        .from(clients)
        .where(and(eq(clients.id, clientId.data), eq(clients.workspaceId, identity.workspaceId)))
        .limit(1);
      if (!client) return Response.json({ error: "Клиент не найден в вашем рабочем пространстве." }, { status: 400 });
      clientName = client.name;
    }

    if (projectId?.success) {
      const [project] = await database.select({ id: projects.id, name: projects.name, clientId: projects.clientId })
        .from(projects)
        .where(and(eq(projects.id, projectId.data), eq(projects.workspaceId, identity.workspaceId)))
        .limit(1);
      if (!project) return Response.json({ error: "Проект не найден в вашем рабочем пространстве." }, { status: 400 });
      if (clientId?.success && project.clientId !== clientId.data) {
        return Response.json({ error: "Клиент не связан с выбранным проектом." }, { status: 400 });
      }
      linkedProjectId = project.id;
      projectName = project.name;
      linkedClientId = project.clientId;
      if (project.clientId) {
        const [client] = await database.select({ name: clients.name }).from(clients)
          .where(and(eq(clients.id, project.clientId), eq(clients.workspaceId, identity.workspaceId)))
          .limit(1);
        clientName = client?.name ?? clientName;
      } else {
        clientName = null;
      }
    }

    const [created] = await database.insert(documents).values({
      workspaceId: identity.workspaceId,
      clientId: linkedClientId,
      projectId: linkedProjectId,
      clientName,
      projectName,
      name: safeName || "Документ",
      contentType: kind.contentType,
      size: bytes.byteLength,
      data: bytes,
    }).returning({
      id: documents.id,
      name: documents.name,
      clientName: documents.clientName,
      projectName: documents.projectName,
      contentType: documents.contentType,
      size: documents.size,
      createdAt: documents.createdAt,
    });

    if (!created) throw new Error("Document insert did not return a row.");
    await recordActivity({ workspaceId: identity.workspaceId, actorName: identity.user.name, action: "uploaded", entityType: "document", entityName: created.name });
    return Response.json({ data: { ...created, createdAt: created.createdAt.toISOString() }, storage: "database" }, { status: 201 });
  } catch (error) {
    console.error("POST /api/documents failed", error);
    return Response.json({ error: "Не удалось загрузить документ." }, { status: 500 });
  }
}
