"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Command,
  CreditCard,
  Download,
  FileText,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";

type Client = {
  id?: string;
  name: string;
  company: string;
  email?: string;
  phone?: string;
  initials: string;
  color: string;
  project: string;
  amount: number;
  status: "В работе" | "Ожидает оплаты" | "Завершён";
};

type Project = {
  id?: string;
  name: string;
  color: string;
  clientName?: string;
  budget?: number;
  status?: string;
};

type Task = {
  id?: string;
  title: string;
  projectId?: string | null;
  projectName: string;
  dueDate: string;
  dueTime: string;
  isCompleted: boolean;
};

type Invoice = {
  id?: string;
  invoiceNumber: string;
  projectId?: string | null;
  projectName: string;
  clientName: string;
  amount: number;
  dueDate: string;
  status: "draft" | "sent" | "paid" | "overdue";
  statusLabel: string;
};

type DocumentItem = {
  id: string;
  name: string;
  clientName: string | null;
  projectName: string | null;
  contentType: string;
  size: number;
  createdAt: string;
};

type ActivityItem = {
  id: string;
  actorName: string;
  action: string;
  entityType: string;
  entityName: string;
  isRead: boolean;
  createdAt: string;
};

type EditorRecord = {
  id?: string;
  name: string;
  company?: string;
  clientName?: string;
  email?: string;
  phone?: string;
  budget?: number;
  dueDate?: string;
  dueTime?: string;
  isCompleted?: boolean;
  invoiceNumber?: string;
  amount?: number;
  status?: string;
};

type StorageMode = "loading" | "database" | "demo";
type ModalState = { kind: "клиента" | "проект" | "задачу" | "счёт"; record?: EditorRecord } | null;

function todayInKyiv() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

const initialDemoDate = "2026-10-25";

function demoTasks(dueDate: string): Task[] {
  return [
    { title: "Отправить макеты Анне", projectName: "Айдентика бренда", dueDate, dueTime: "10:30", isCompleted: true },
    { title: "Позвонить Марку", projectName: "Сайт и магазин", dueDate, dueTime: "13:00", isCompleted: false },
    { title: "Подготовить счёт", projectName: "Упаковка продукта", dueDate, dueTime: "15:30", isCompleted: false },
  ];
}

function demoInvoices(dueDate: string): Invoice[] {
  const pastDate = new Date(`${dueDate}T00:00:00.000Z`);
  pastDate.setUTCDate(pastDate.getUTCDate() - 1);
  const yesterday = pastDate.toISOString().slice(0, 10);
  return [
    { invoiceNumber: "INV-2026-001", projectName: "Сайт и магазин", clientName: "Марк Левин", amount: 126_000, dueDate, status: "sent", statusLabel: "Отправлен" },
    { invoiceNumber: "INV-2026-002", projectName: "Дизайн-система", clientName: "Ирина Бойко", amount: 67_500, dueDate, status: "paid", statusLabel: "Оплачен" },
    { invoiceNumber: "INV-2026-003", projectName: "Упаковка продукта", clientName: "Денис Романюк", amount: 42_000, dueDate: yesterday, status: "overdue", statusLabel: "Просрочен" },
  ];
}

function taskDateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "Europe/Kyiv" })
    .format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function documentDateLabel(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "Europe/Kyiv" }).format(new Date(value));
}

function activityTimeLabel(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv" }).format(new Date(value));
}

function fileSizeLabel(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} МБ`;
}

const initialClients: Client[] = [
  { name: "Анна Коваль", company: "Northstar Studio", initials: "АК", color: "coral", project: "Айдентика бренда", amount: 84000, status: "В работе" },
  { name: "Марк Левин", company: "Mono Coffee", initials: "МЛ", color: "lavender", project: "Сайт и магазин", amount: 126000, status: "Ожидает оплаты" },
  { name: "Ирина Бойко", company: "Forma Architects", initials: "ИБ", color: "sage", project: "Дизайн-система", amount: 67500, status: "В работе" },
  { name: "Денис Романюк", company: "Goodsoil", initials: "ДР", color: "butter", project: "Упаковка продукта", amount: 42000, status: "Завершён" },
];

const initialProjects: Project[] = [
  { id: "demo-project-1", name: "Айдентика бренда", clientName: "Анна Коваль", budget: 84_000, status: "В работе", color: "dot-green" },
  { id: "demo-project-2", name: "Сайт и магазин", clientName: "Марк Левин", budget: 126_000, status: "Ожидает оплаты", color: "dot-violet" },
  { id: "demo-project-3", name: "Дизайн-система", clientName: "Ирина Бойко", budget: 67_500, status: "В работе", color: "dot-orange" },
  { id: "demo-project-4", name: "Упаковка продукта", clientName: "Денис Романюк", budget: 42_000, status: "Завершён", color: "dot-green" },
];

const navItems = [
  { tab: "overview", label: "Обзор", icon: LayoutDashboard },
  { tab: "clients", label: "Клиенты", icon: UsersRound },
  { tab: "projects", label: "Проекты", icon: FolderKanban },
  { tab: "finance", label: "Финансы", icon: WalletCards },
  { tab: "calendar", label: "Календарь", icon: CalendarDays },
  { tab: "documents", label: "Документы", icon: FileText },
  { tab: "activity", label: "Активность", icon: Activity },
];

const chartSets: Record<string, { values: number[]; labels: string[]; total: string; change: string }> = {
  "За месяц": { values: [22, 35, 30, 50, 42, 63, 56, 76, 65, 88, 78, 96], labels: ["1 окт", "5 окт", "9 окт", "13 окт", "17 окт", "21 окт", "25 окт", "29 окт"], total: "₴ 248 500", change: "+12,8%" },
  "За неделю": { values: [30, 42, 38, 60, 53, 72, 90], labels: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"], total: "₴ 64 000", change: "+8,4%" },
  "За квартал": { values: [24, 34, 28, 46, 43, 60, 51, 72, 68, 84, 77, 96], labels: ["1 авг", "10 авг", "20 авг", "1 сен", "10 сен", "20 сен", "1 окт", "25 окт"], total: "₴ 716 300", change: "+18,2%" },
};

function money(value: number) {
  return `₴ ${new Intl.NumberFormat("uk-UA").format(value)}`;
}

function RevenueChart({ values }: { values: number[] }) {
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 720},${175 - value * 1.48}`).join(" ");
  const area = `0,175 ${points} 720,175`;
  return (
    <svg className="revenue-svg" viewBox="0 0 720 190" preserveAspectRatio="none" role="img" aria-label="График дохода за выбранный период">
      <defs>
        <linearGradient id="revenueFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#a8d79b" stopOpacity=".38" /><stop offset="100%" stopColor="#a8d79b" stopOpacity="0" /></linearGradient>
      </defs>
      {[24, 74, 124, 174].map((y) => <line key={y} x1="0" x2="720" y1={y} y2={y} stroke="#eef0eb" strokeDasharray="4 6" />)}
      <polygon points={area} fill="url(#revenueFill)" />
      <polyline points={points} fill="none" stroke="#4e8d52" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="720" cy={175 - values[values.length - 1] * 1.48} r="5" fill="#4e8d52" stroke="white" strokeWidth="3" />
    </svg>
  );
}

function CreateModal({
  kind,
  record,
  projects,
  clients,
  onClose,
  onSave,
  onDelete,
}: {
  kind: "клиента" | "проект" | "задачу" | "счёт";
  record?: EditorRecord;
  projects: Project[];
  clients: Client[];
  onClose: () => void;
  onSave: (values: { name: string; company: string; email: string; phone: string; budget: number; dueDate: string; dueTime: string; status: string }) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [name, setName] = useState(record?.name ?? "");
  const [company, setCompany] = useState(record?.company ?? record?.clientName ?? "");
  const [email, setEmail] = useState(record?.email ?? "");
  const [phone, setPhone] = useState(record?.phone ?? "");
  const [budget, setBudget] = useState(record?.budget ? String(record.budget) : "");
  const [dueDate, setDueDate] = useState(record?.dueDate ?? todayInKyiv());
  const [dueTime, setDueTime] = useState(record?.dueTime ?? "10:30");
  const projectStatus = record?.status === "Ожидает оплаты" ? "awaiting_payment" : record?.status === "Завершён" ? "completed" : "active";
  const [status, setStatus] = useState<string>(kind === "проект" ? projectStatus : (record?.status as Invoice["status"] | undefined) ?? "sent");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const remove = async () => {
    if (!onDelete || !window.confirm(`Удалить ${kind}? Это действие нельзя отменить.`)) return;
    setSaving(true);
    setFormError("");
    try {
      await onDelete();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Не удалось удалить запись.");
    } finally {
      setSaving(false);
    }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() && kind !== "счёт") return;
    setSaving(true);
    setFormError("");
    try {
      await onSave({
        name: name.trim(),
        company: company.trim(),
        email: email.trim(),
        phone: phone.trim(),
        budget: Number(budget) || 0,
        dueDate,
        dueTime,
        status,
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Не удалось сохранить запись.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-heading">
        <div className="modal-top"><span className="modal-icon"><Plus size={18} /></span><button className="icon-button" aria-label="Закрыть" onClick={onClose}><X size={18} /></button></div>
        <p className="eyebrow">{record ? "РЕДАКТИРОВАНИЕ" : "НОВАЯ ЗАПИСЬ"}</p>
        <h2 id="modal-heading">{record ? `Изменить ${kind}` : `Добавить ${kind}`}</h2>
        <p className="modal-description">Заполните основные детали — остальное можно добавить позже.</p>
        <form onSubmit={submit}>
          <label className="form-label" htmlFor="record-name">{kind === "клиента" ? "Имя клиента" : kind === "проект" ? "Название проекта" : kind === "задачу" ? "Название задачи" : "Номер счёта"}</label>
          <input id="record-name" autoFocus required={kind !== "счёт"} value={name} onChange={(event) => setName(event.target.value)} placeholder={kind === "клиента" ? "Например, Анна Коваль" : kind === "проект" ? "Например, Редизайн сайта" : kind === "задачу" ? "Например, Подготовить презентацию" : "Оставьте пустым для автонумерации"} />
          <label className="form-label" htmlFor="record-company">{kind === "клиента" ? "Компания" : kind === "проект" ? "Клиент" : "Проект"}<span>необязательно</span></label>
          {kind === "задачу" || kind === "счёт" ? <select id="record-company" value={company} onChange={(event) => setCompany(event.target.value)}><option value="">Без проекта</option>{projects.map((project) => <option key={project.id ?? project.name} value={project.name}>{project.name}</option>)}</select> : kind === "проект" ? <select id="record-company" value={company} onChange={(event) => setCompany(event.target.value)}><option value="">Без клиента</option>{clients.map((client) => <option key={client.id ?? `${client.name}-${client.company}`} value={client.name}>{client.name}{client.company ? ` · ${client.company}` : ""}</option>)}</select> : <input id="record-company" value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Название компании" />}
          {kind === "клиента" ? <>
            <label className="form-label" htmlFor="record-email">Электронная почта<span>необязательно</span></label>
            <input id="record-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="anna@example.com" />
            <label className="form-label" htmlFor="record-phone">Телефон<span>необязательно</span></label>
            <input id="record-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+380 00 000 00 00" />
          </> : kind === "проект" ? <>
            <label className="form-label" htmlFor="record-budget">Бюджет, ₴<span>необязательно</span></label>
            <input id="record-budget" type="number" min="0" step="1" value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="Например, 45000" />
            <label className="form-label" htmlFor="record-status">Статус проекта</label>
            <select id="record-status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="active">В работе</option><option value="awaiting_payment">Ожидает оплаты</option><option value="completed">Завершён</option></select>
          </> : kind === "задачу" ? <div className="task-date-fields">
            <div><label className="form-label" htmlFor="record-date">Дата</label><input id="record-date" type="date" required value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div>
            <div><label className="form-label" htmlFor="record-time">Время</label><input id="record-time" type="time" required value={dueTime} onChange={(event) => setDueTime(event.target.value)} /></div>
          </div> : <>
            <label className="form-label" htmlFor="record-budget">Сумма, ₴</label>
            <input id="record-budget" type="number" min="1" step="1" required value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="Например, 45000" />
            <div className="task-date-fields">
              <div><label className="form-label" htmlFor="record-date">Срок оплаты</label><input id="record-date" type="date" required value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div>
              <div><label className="form-label" htmlFor="record-status">Статус</label><select id="record-status" value={status} onChange={(event) => setStatus(event.target.value as Invoice["status"])}><option value="draft">Черновик</option><option value="sent">Отправлен</option><option value="paid">Оплачен</option><option value="overdue">Просрочен</option></select></div>
            </div>
          </>}
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <div className="modal-actions">
            {onDelete && <button className="danger-button" type="button" onClick={remove} disabled={saving}><Trash2 size={14} />Удалить</button>}
            <button className="primary-button modal-submit" type="submit" disabled={saving}>{saving ? "Сохраняем…" : record ? "Сохранить изменения" : `Создать ${kind}`}<ArrowRight size={16} /></button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ClientsTable({ clients, onEdit, emptyMessage }: {
  clients: Client[];
  onEdit: (client: Client) => void;
  emptyMessage: string;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead><tr><th>КЛИЕНТ</th><th>АКТИВНЫЙ ПРОЕКТ</th><th>СТОИМОСТЬ</th><th>СТАТУС</th><th aria-label="Действия" /></tr></thead>
        <tbody>
          {clients.length ? clients.map((client) => (
            <tr key={`${client.id ?? client.name}-${client.company}`}>
              <td><div className="client-cell"><span className={`client-avatar ${client.color}`}>{client.initials}</span><span><b>{client.name}</b><small>{client.company}</small>{client.email && <small className="client-email">{client.email}</small>}</span></div></td>
              <td><span className="project-name">{client.project}</span></td>
              <td><span className="project-amount">{client.amount ? money(client.amount) : "—"}</span></td>
              <td><span className={`status-pill ${client.status === "В работе" ? "status-work" : client.status === "Завершён" ? "status-done" : "status-pending"}`}><i />{client.status}</span></td>
              <td><button className="row-more" aria-label={`Редактировать: ${client.name}`} onClick={() => onEdit(client)}><Pencil size={15} /></button></td>
            </tr>
          )) : <tr><td colSpan={5} className="empty-state">{emptyMessage}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function ProjectsTable({ projects, onEdit, emptyMessage }: {
  projects: Project[];
  onEdit: (project: Project) => void;
  emptyMessage: string;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead><tr><th>ПРОЕКТ</th><th>КЛИЕНТ</th><th>БЮДЖЕТ</th><th>СТАТУС</th><th aria-label="Действия" /></tr></thead>
        <tbody>
          {projects.length ? projects.map((project) => (
            <tr key={`${project.id ?? project.name}-${project.clientName ?? ""}`}>
              <td><div className="project-cell"><span className={`project-dot ${project.color}`} /><b>{project.name}</b></div></td>
              <td><span className="project-name">{project.clientName || "Без клиента"}</span></td>
              <td><span className="project-amount">{project.budget ? money(project.budget) : "—"}</span></td>
              <td><span className={`status-pill ${project.status === "Завершён" ? "status-done" : project.status === "Ожидает оплаты" ? "status-pending" : "status-work"}`}><i />{project.status ?? "В работе"}</span></td>
              <td><button className="row-more" aria-label={`Редактировать: ${project.name}`} onClick={() => onEdit(project)}><Pencil size={15} /></button></td>
            </tr>
          )) : <tr><td colSpan={5} className="empty-state">{emptyMessage}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function InvoicesTable({ invoices: rows, onEdit }: { invoices: Invoice[]; onEdit: (invoice: Invoice) => void }) {
  const statusClasses: Record<Invoice["status"], string> = { draft: "status-pending", sent: "status-work", paid: "status-done", overdue: "status-pending" };
  return <div className="table-scroll"><table><thead><tr><th>СЧЁТ</th><th>КЛИЕНТ / ПРОЕКТ</th><th>СУММА</th><th>СРОК ОПЛАТЫ</th><th>СТАТУС</th><th aria-label="Действия" /></tr></thead><tbody>{rows.length ? rows.map((invoice) => <tr key={invoice.id ?? invoice.invoiceNumber}><td><b>{invoice.invoiceNumber}</b></td><td><span className="project-name">{invoice.clientName || "Без клиента"}</span><small className="invoice-project">{invoice.projectName || "Без проекта"}</small></td><td><span className="project-amount">{money(invoice.amount)}</span></td><td>{taskDateLabel(invoice.dueDate)}</td><td><span className={`status-pill ${statusClasses[invoice.status]}`}><i />{invoice.statusLabel}</span></td><td><button className="row-more" aria-label={`Редактировать счёт ${invoice.invoiceNumber}`} onClick={() => onEdit(invoice)}><Pencil size={15} /></button></td></tr>) : <tr><td colSpan={6} className="empty-state">Счетов пока нет. Создайте первый.</td></tr>}</tbody></table></div>;
}

function TaskList({ tasks, onToggle, onEdit, showDate = false, emptyMessage }: {
  tasks: Task[];
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
  showDate?: boolean;
  emptyMessage: string;
}) {
  if (!tasks.length) return <p className="task-empty">{emptyMessage}</p>;

  return (
    <div className="task-list">
      {tasks.map((task) => (
        <div key={task.id ?? `${task.title}-${task.dueDate}-${task.dueTime}`} className={`task-row ${task.isCompleted ? "task-done" : ""}`}>
          <button className="task-check" aria-label={task.isCompleted ? `Отметить незавершённой: ${task.title}` : `Отметить выполненной: ${task.title}`} onClick={() => onToggle(task)}>
            {task.isCompleted && <Check size={12} />}
          </button>
          <span className="task-copy"><b>{task.title}</b><small><span className="task-project-dot" />{task.projectName || "Без проекта"}</small></span>
          {showDate && <span className="task-date-label">{taskDateLabel(task.dueDate)}</span>}
          <span className="task-time">{task.dueTime}</span>
          <button className="row-more task-edit-button" aria-label={`Редактировать задачу: ${task.title}`} onClick={() => onEdit(task)}><Pencil size={14} /></button>
        </div>
      ))}
    </div>
  );
}

export default function Home({ user, workspaceName, initialTab }: { user: { name: string; email: string }; workspaceName: string; initialTab: string }) {
  const router = useRouter();
  const firstName = user.name.trim().split(/\s+/)[0] || user.email.split("@")[0] || "Добрый день";
  const avatar = user.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "F";
  const [activeNav, setActiveNav] = useState(() => navItems.find((item) => item.tab === initialTab)?.label ?? "Обзор");
  const [period, setPeriod] = useState("За месяц");
  const [search, setSearch] = useState("");
  const [projectStatusFilter, setProjectStatusFilter] = useState("all");
  const [projectSort, setProjectSort] = useState("budget-desc");
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [unreadActivityCount, setUnreadActivityCount] = useState(0);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentLink, setDocumentLink] = useState("");
  const [documentError, setDocumentError] = useState("");
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [currentDate, setCurrentDate] = useState(initialDemoDate);
  const [storageMode, setStorageMode] = useState<StorageMode>("loading");
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [topProfileOpen, setTopProfileOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    const loadRecords = async () => {
      const today = todayInKyiv();
      setCurrentDate(today);
      try {
        const [clientsResponse, projectsResponse, tasksResponse, invoicesResponse, documentsResponse, activityResponse] = await Promise.all([
          fetch("/api/clients"),
          fetch("/api/projects"),
          fetch("/api/tasks"),
          fetch("/api/invoices"),
          fetch("/api/documents"),
          fetch("/api/activity"),
        ]);
        if (!clientsResponse.ok || !projectsResponse.ok || !tasksResponse.ok || !invoicesResponse.ok || !documentsResponse.ok || !activityResponse.ok) {
          if (active) {
            setClients(initialClients);
            setProjects(initialProjects);
            setTasks(demoTasks(today));
            setInvoices(demoInvoices(today));
            setStorageMode("demo");
          }
          return;
        }

        const [clientsPayload, projectsPayload, tasksPayload, invoicesPayload, documentsPayload, activityPayload] = await Promise.all([
          clientsResponse.json() as Promise<{ data: Client[] }>,
          projectsResponse.json() as Promise<{ data: Project[] }>,
          tasksResponse.json() as Promise<{ data: Task[] }>,
          invoicesResponse.json() as Promise<{ data: Invoice[] }>,
          documentsResponse.json() as Promise<{ data: DocumentItem[] }>,
          activityResponse.json() as Promise<{ data: ActivityItem[]; unreadCount: number }>,
        ]);
        if (!active) return;
        setClients(clientsPayload.data);
        setProjects(projectsPayload.data);
        setTasks(tasksPayload.data);
        setInvoices(invoicesPayload.data);
        setDocuments(documentsPayload.data);
        setActivityItems(activityPayload.data);
        setUnreadActivityCount(activityPayload.unreadCount);
        setStorageMode("database");
      } catch {
        if (active) {
          setClients(initialClients);
          setProjects(initialProjects);
          setTasks(demoTasks(today));
          setInvoices(demoInvoices(today));
          setStorageMode("demo");
        }
      }
    };
    void loadRecords();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    const refreshActivity = async () => {
      try {
        const response = await fetch("/api/activity");
        if (!response.ok) return;
        const payload = await response.json() as { data: ActivityItem[]; unreadCount: number };
        setActivityItems(payload.data);
        setUnreadActivityCount(payload.unreadCount);
      } catch {
        // Activity can be refreshed the next time the polling interval runs.
      }
    };
    const interval = window.setInterval(() => { void refreshActivity(); }, 15_000);
    return () => window.clearInterval(interval);
  }, []);

  const filteredClients = useMemo(() => clients.filter((client) => `${client.name} ${client.company} ${client.email ?? ""} ${client.phone ?? ""} ${client.project}`.toLowerCase().includes(search.toLowerCase())), [clients, search]);
  const filteredProjects = useMemo(() => projects.filter((project) => `${project.name} ${project.clientName ?? ""}`.toLowerCase().includes(search.toLowerCase())), [projects, search]);
  const visibleProjects = useMemo(() => filteredProjects
    .filter((project) => projectStatusFilter === "all" || project.status === projectStatusFilter)
    .sort((left, right) => projectSort === "budget-asc"
      ? (left.budget ?? 0) - (right.budget ?? 0)
      : projectSort === "name-asc"
        ? left.name.localeCompare(right.name, "ru")
        : (right.budget ?? 0) - (left.budget ?? 0)), [filteredProjects, projectStatusFilter, projectSort]);
  const filteredTasks = useMemo(() => tasks.filter((task) => `${task.title} ${task.projectName}`.toLowerCase().includes(search.toLowerCase())), [tasks, search]);
  const filteredInvoices = useMemo(() => invoices.filter((invoice) => `${invoice.invoiceNumber} ${invoice.clientName} ${invoice.projectName}`.toLowerCase().includes(search.toLowerCase())), [invoices, search]);
  const filteredDocuments = useMemo(() => documents.filter((document) => `${document.name} ${document.clientName ?? ""} ${document.projectName ?? ""}`.toLowerCase().includes(search.toLowerCase())), [documents, search]);
  const todayTasks = tasks.filter((task) => task.dueDate === currentDate);
  const projectBudget = projects.reduce((sum, project) => sum + (project.budget ?? 0), 0);
  const awaitingPayment = projects.filter((project) => project.status === "Ожидает оплаты").reduce((sum, project) => sum + (project.budget ?? 0), 0);
  const invoiceOutstanding = invoices.filter((invoice) => invoice.status === "sent" || invoice.status === "overdue").reduce((sum, invoice) => sum + invoice.amount, 0);
  const invoicePaid = invoices.filter((invoice) => invoice.status === "paid").reduce((sum, invoice) => sum + invoice.amount, 0);
  const activeProjectCount = projects.filter((project) => project.status !== "Завершён").length;
  const chart = chartSets[period];
  const navDescriptions: Record<string, string> = {
    "Обзор": "Вот что происходит в вашей студии сегодня.",
    "Клиенты": "Все отношения с клиентами — в одном месте.",
    "Проекты": "Следите за ходом каждого проекта.",
    "Финансы": "Доходы, счета и платежи вашей студии.",
    "Календарь": "Встречи и сроки на одной странице.",
    "Документы": "Договоры, предложения и файлы проектов — в одном месте.",
    "Активность": "История действий и новые события в рабочем пространстве.",
  };

  const openActivity = async () => {
    selectSection("Активность");
    if (unreadActivityCount > 0) {
      const response = await fetch("/api/activity", { method: "POST" });
      if (!response.ok) return;
    }
    const response = await fetch("/api/activity");
    if (!response.ok) return;
    const payload = await response.json() as { data: ActivityItem[]; unreadCount: number };
    setActivityItems(payload.data);
    setUnreadActivityCount(payload.unreadCount);
  };

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  };

  const selectSection = (label: string) => {
    const selected = navItems.find((item) => item.label === label);
    if (!selected) return;
    setActiveNav(selected.label);
    setMenuOpen(false);
    const url = new URL(window.location.href);
    if (selected.tab === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", selected.tab);
    window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };

  useEffect(() => {
    const syncSectionFromUrl = () => {
      const tab = new URLSearchParams(window.location.search).get("tab") ?? "overview";
      setActiveNav(navItems.find((item) => item.tab === tab)?.label ?? "Обзор");
    };
    window.addEventListener("popstate", syncSectionFromUrl);
    return () => window.removeEventListener("popstate", syncSectionFromUrl);
  }, []);

  const saveRecord = async ({ name, company, email, phone, budget, dueDate, dueTime, status }: { name: string; company: string; email: string; phone: string; budget: number; dueDate: string; dueTime: string; status: string }) => {
    const currentModal = modal;
    if (!currentModal) return;
    const { kind, record } = currentModal;
    const method = record ? "PATCH" : "POST";
    const resource = kind === "клиента" ? "clients" : kind === "проект" ? "projects" : kind === "задачу" ? "tasks" : "invoices";
    const response = record && !record.id
      ? null
      : await fetch(record?.id ? `/api/${resource}/${record.id}` : `/api/${resource}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "клиента"
          ? { name, company, email, phone }
          : kind === "проект"
            ? { name, clientName: company, budget, status }
            : kind === "задачу" ? { title: name, projectName: company, dueDate, dueTime }
              : { invoiceNumber: name, projectName: company, amount: budget, dueDate, status }),
      });
    const result = response
      ? await response.json().catch(() => ({})) as {
      data?: Client | Project | Task | Invoice;
      error?: string;
      }
      : {};

    if (response && !response.ok && result.error !== "database_not_configured") {
      throw new Error(result.error ?? "Не удалось сохранить запись.");
    }
    const savedToDatabase = response?.ok ?? false;

    if (kind === "клиента") {
      const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
      const client = savedToDatabase && result.data && "initials" in result.data
        ? result.data
        : { id: record?.id, name, company: company || "Новая компания", email, phone, initials, color: "sage", project: "Нет активного проекта", amount: 0, status: "В работе" as const };
      if (record) {
        setClients((current) => current.map((item) => {
          if (!(item.id === record.id || (!record.id && item.name === record.name))) return item;
          return savedToDatabase ? client : { ...item, name, company, email, phone, initials, color: "sage" };
        }));
      } else {
        setClients((current) => [client, ...current]);
      }
      showToast(savedToDatabase ? `${name} сохранён` : `${name} сохранён только в демо-сессии`);
    } else if (kind === "проект") {
      const color = ["dot-green", "dot-violet", "dot-orange"][projects.length % 3];
      const project = savedToDatabase && result.data && "name" in result.data && "color" in result.data
        ? result.data
        : { id: record?.id, name, color, clientName: company, budget, status: status === "completed" ? "Завершён" : status === "awaiting_payment" ? "Ожидает оплаты" : "В работе" };
      if (record) {
        setProjects((current) => current.map((item) => {
          if (!(item.id === record.id || (!record.id && item.name === record.name))) return item;
          return savedToDatabase ? project : { ...item, name, clientName: company, budget, status: status === "completed" ? "Завершён" : status === "awaiting_payment" ? "Ожидает оплаты" : "В работе" };
        }));
      } else {
        setProjects((current) => [project, ...current]);
      }
      if (savedToDatabase) {
        const clientsResponse = await fetch("/api/clients");
        if (clientsResponse.ok) {
          const clientsPayload = await clientsResponse.json() as { data: Client[] };
          setClients(clientsPayload.data);
        }
      }
      showToast(savedToDatabase ? `Проект «${name}» сохранён` : `Проект «${name}» сохранён только в демо-сессии`);
    } else if (kind === "задачу") {
      const task: Task = savedToDatabase && result.data && "title" in result.data
        ? result.data
        : {
          id: record?.id,
          title: name,
          projectName: company,
          dueDate,
          dueTime,
          isCompleted: record?.isCompleted ?? false,
        };
      if (record) {
        setTasks((current) => current.map((item) => item.id === record.id || (!record.id && item.title === record.name)
          ? savedToDatabase ? task : { ...item, title: name, projectName: company, dueDate, dueTime }
          : item));
      } else {
        setTasks((current) => [...current, task].sort((left, right) => left.dueDate.localeCompare(right.dueDate) || left.dueTime.localeCompare(right.dueTime)));
      }
      showToast(savedToDatabase ? `Задача «${name}» сохранена` : `Задача «${name}» сохранена только в демо-сессии`);
    } else {
      const invoiceStatus = status as Invoice["status"];
      const fallback: Invoice = { id: record?.id, invoiceNumber: name || `INV-${Date.now().toString().slice(-6)}`, projectName: company, clientName: projects.find((project) => project.name === company)?.clientName ?? "", amount: budget, dueDate, status: invoiceStatus, statusLabel: ({ draft: "Черновик", sent: "Отправлен", paid: "Оплачен", overdue: "Просрочен" })[invoiceStatus] };
      const invoice = savedToDatabase && result.data && "invoiceNumber" in result.data ? result.data : fallback;
      if (record) setInvoices((current) => current.map((item) => item.id === record.id || (!record.id && item.invoiceNumber === record.name) ? invoice : item));
      else setInvoices((current) => [invoice, ...current]);
      showToast(savedToDatabase ? `Счёт ${invoice.invoiceNumber} сохранён` : `Счёт ${invoice.invoiceNumber} сохранён только в демо-сессии`);
    }
    setStorageMode(savedToDatabase ? "database" : "demo");
    setModal(null);
  };

  const deleteRecord = async () => {
    const currentModal = modal;
    if (!currentModal?.record) return;
    const { kind, record } = currentModal;
    const resource = kind === "клиента" ? "clients" : kind === "проект" ? "projects" : kind === "задачу" ? "tasks" : "invoices";
    const response = record.id
      ? await fetch(`/api/${resource}/${record.id}`, { method: "DELETE" })
      : null;
    const result = response
      ? await response.json().catch(() => ({})) as { error?: string }
      : {};

    if (response && !response.ok && result.error !== "database_not_configured") {
      throw new Error(result.error ?? "Не удалось удалить запись.");
    }

    if (kind === "клиента") {
      setClients((current) => current.filter((client) => record.id ? client.id !== record.id : client.name !== record.name));
    } else if (kind === "проект") {
      setProjects((current) => current.filter((project) => record.id ? project.id !== record.id : project.name !== record.name));
      if (response?.ok) {
        const clientsResponse = await fetch("/api/clients");
        if (clientsResponse.ok) {
          const clientsPayload = await clientsResponse.json() as { data: Client[] };
          setClients(clientsPayload.data);
        }
      }
    } else if (kind === "задачу") {
      setTasks((current) => current.filter((task) => record.id ? task.id !== record.id : task.title !== record.name));
    } else {
      setInvoices((current) => current.filter((invoice) => record.id ? invoice.id !== record.id : invoice.invoiceNumber !== record.name));
    }

    setStorageMode(response?.ok ? "database" : "demo");
    setModal(null);
    showToast(response?.ok ? kind === "клиента" ? "Клиент удалён" : kind === "проект" ? "Проект удалён" : kind === "задачу" ? "Задача удалена" : "Счёт удалён" : "Запись удалена только из демо-сессии");
  };

  const toggleTask = async (task: Task) => {
    const nextValue = !task.isCompleted;
    const response = task.id
      ? await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isCompleted: nextValue }),
      })
      : null;
    const result = response
      ? await response.json().catch(() => ({})) as { data?: Task; error?: string }
      : {};
    if (response && !response.ok && result.error !== "database_not_configured") {
      showToast(result.error ?? "Не удалось обновить задачу.");
      return;
    }
    setTasks((current) => current.map((item) => item.id === task.id || (!task.id && item.title === task.title && item.dueTime === task.dueTime)
      ? { ...item, isCompleted: nextValue }
      : item));
    setStorageMode(response?.ok ? "database" : "demo");
  };

  const uploadDocument = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!documentFile) {
      setDocumentError("Сначала выберите файл.");
      return;
    }

    setUploadingDocument(true);
    setDocumentError("");
    const body = new FormData();
    body.append("file", documentFile);
    if (documentLink.startsWith("project:")) body.append("projectId", documentLink.slice("project:".length));
    if (documentLink.startsWith("client:")) body.append("clientId", documentLink.slice("client:".length));

    try {
      const response = await fetch("/api/documents", { method: "POST", body });
      const result = await response.json().catch(() => ({})) as { data?: DocumentItem; error?: string };
      if (!response.ok || !result.data) throw new Error(result.error ?? "Не удалось загрузить документ.");
      setDocuments((current) => [result.data!, ...current]);
      setDocumentFile(null);
      setDocumentLink("");
      if (documentInputRef.current) documentInputRef.current.value = "";
      showToast("Документ загружен");
    } catch (error) {
      setDocumentError(error instanceof Error ? error.message : "Не удалось загрузить документ.");
    } finally {
      setUploadingDocument(false);
    }
  };

  const deleteDocument = async (document: DocumentItem) => {
    if (!window.confirm(`Удалить файл «${document.name}»? Это действие нельзя отменить.`)) return;
    try {
      const response = await fetch(`/api/documents/${document.id}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Не удалось удалить документ.");
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      showToast("Документ удалён");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Не удалось удалить документ.");
    }
  };

  return (
    <main className="app-shell">
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="brand-row"><div className="brand-mark"><span /><span /><span /></div><span className="brand-name">forma<span>.</span></span><button className="mobile-close icon-button" onClick={() => setMenuOpen(false)} aria-label="Закрыть меню"><X size={18} /></button></div>
        <div className="workspace-menu-wrap">
          <button type="button" className="workspace-switch" aria-haspopup="menu" aria-expanded={workspaceMenuOpen} onClick={() => setWorkspaceMenuOpen((open) => !open)}><span className="workspace-avatar">{workspaceName[0]?.toUpperCase() ?? "F"}</span><span className="workspace-copy"><b>{workspaceName}</b><small>Рабочее пространство</small></span><ChevronDown size={15} /></button>
          {workspaceMenuOpen && <div className="workspace-menu" role="menu" aria-label="Рабочие пространства"><p className="workspace-menu-heading">РАБОЧЕЕ ПРОСТРАНСТВО</p><div className="workspace-menu-current" role="menuitemradio" aria-checked="true"><span className="workspace-menu-avatar">{workspaceName[0]?.toUpperCase() ?? "F"}</span><span className="workspace-menu-copy"><b>{workspaceName}</b><small>Текущее пространство</small></span><Check className="workspace-menu-check" size={16} /></div><p className="workspace-menu-note">У аккаунта пока одно рабочее пространство.</p></div>}
        </div>

        <div className="nav-caption">РАБОЧЕЕ</div>
        <nav className="main-nav" aria-label="Основная навигация">
          {navItems.map(({ label, icon: Icon }) => {
            const count = storageMode === "loading" ? null : label === "Клиенты" ? clients.length : label === "Проекты" ? projects.length : label === "Активность" ? unreadActivityCount : null;
            return (
              <button key={label} className={`nav-item ${activeNav === label ? "active" : ""}`} onClick={() => { if (label === "Активность") void openActivity(); else selectSection(label); }}>
                <Icon size={17} strokeWidth={1.8} /><span>{label}</span>{count !== null && (label !== "Активность" || count > 0) && <span className="nav-count">{count}</span>}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-projects-heading"><span className="nav-caption">ВАШИ ПРОЕКТЫ</span><button className="tiny-icon" aria-label="Добавить проект" onClick={() => setModal({ kind: "проект" })}><Plus size={15} /></button></div>
        <div className="project-links">{projects.slice(0, 5).map((project) => <button key={project.name} onClick={() => selectSection("Проекты")}><span className={`project-dot ${project.color}`} />{project.name}</button>)}</div>

        <div className="sidebar-bottom">
          <div className="upgrade-card"><div className="upgrade-spark"><Sparkles size={16} /></div><strong>Работайте в своём ритме</strong><p>Соберите все проекты и финансы в одном месте.</p><button onClick={() => showToast(`Вы уже используете ${workspaceName}`)}>Посмотреть тарифы<ArrowRight size={14} /></button></div>
          <button className="nav-item utility-item" onClick={() => showToast("Центр помощи скоро появится")}><CircleHelp size={17} /><span>Помощь и поддержка</span></button>
          <div className="profile-menu-wrap">
            {profileMenuOpen && <div className="profile-menu" role="menu"><button type="button" role="menuitem" onClick={() => { setProfileMenuOpen(false); void authClient.signOut().then(() => { router.replace("/login"); router.refresh(); }).catch(() => showToast("Не удалось выйти из аккаунта.")); }}><LogOut size={15} />Выйти из аккаунта</button></div>}
            <div className="profile-row"><span className="profile-avatar">{avatar}</span><span className="workspace-copy"><b>{user.name}</b><small>Рабочий профиль</small></span><button type="button" className="profile-menu-trigger" aria-label="Меню аккаунта" aria-haspopup="menu" aria-expanded={profileMenuOpen} onClick={() => setProfileMenuOpen((open) => !open)}><MoreHorizontal size={19} /></button></div>
          </div>
        </div>
      </aside>

      {menuOpen && <button className="sidebar-scrim" onClick={() => setMenuOpen(false)} aria-label="Закрыть меню" />}
      <section className="main-area">
        <header className="topbar">
          <button className="mobile-menu icon-button" aria-label="Открыть меню" onClick={() => setMenuOpen(true)}><Menu size={20} /></button>
          <div className="breadcrumbs"><span>{workspaceName}</span><ChevronRight size={14} /><b>{activeNav}</b></div>
          <div className="topbar-actions"><label className="global-search"><Search size={16} /><input ref={searchInputRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск по студии..." /><kbd><Command size={11} /> K</kbd></label><button className="icon-button notification-button" aria-label={`Уведомления${unreadActivityCount ? `, непрочитанных: ${unreadActivityCount}` : ""}`} onClick={() => { void openActivity(); }}><Bell size={18} />{unreadActivityCount > 0 && <i />}</button><div className="top-profile-wrap"><button type="button" className="top-avatar" aria-label={`Открыть меню профиля ${user.name}`} aria-haspopup="menu" aria-expanded={topProfileOpen} onClick={() => setTopProfileOpen((open) => !open)}>{avatar}</button>{topProfileOpen && <div className="top-profile-menu" role="menu"><div className="top-profile-summary"><b>{user.name}</b><small>{user.email}</small></div><button type="button" role="menuitem" onClick={() => { setTopProfileOpen(false); void authClient.signOut().then(() => { router.replace("/login"); router.refresh(); }).catch(() => showToast("Не удалось выйти из аккаунта.")); }}><LogOut size={15} />Выйти из аккаунта</button></div>}</div></div>
        </header>

        <div className="content-wrap">
          <section className="page-heading"><div><div className="date-kicker"><span className="live-dot" />РАБОЧЕЕ ПРОСТРАНСТВО</div><h1>{activeNav === "Обзор" ? `Добрый день, ${firstName}` : activeNav}</h1><p>{navDescriptions[activeNav]}</p></div><div className="heading-actions">{(activeNav === "Обзор" || activeNav === "Клиенты") && <button className="secondary-button" onClick={() => setModal({ kind: "клиента" })}><UsersRound size={16} />Добавить клиента</button>}{(activeNav === "Обзор" || activeNav === "Проекты") && <button className="primary-button" onClick={() => setModal({ kind: "проект" })}><Plus size={17} />Новый проект</button>}{activeNav === "Календарь" && <button className="primary-button" onClick={() => setModal({ kind: "задачу" })}><Plus size={17} />Новая задача</button>}{activeNav === "Финансы" && <button className="primary-button" onClick={() => setModal({ kind: "счёт" })}><Plus size={17} />Новый счёт</button>}</div></section>

          {activeNav === "Обзор" && <>
          <section className="stats-grid" aria-label="Ключевые показатели">
            <article className="stat-card"><div className="stat-top"><span>Бюджет проектов</span><span className="stat-icon sage-icon"><WalletCards size={17} /></span></div><div className="stat-value">{storageMode === "loading" ? "—" : money(projectBudget)}</div><div className="stat-foot"><span>{storageMode === "loading" ? "Загружаем данные…" : `${projects.length} проектов`}</span>{storageMode !== "loading" && <><span>в рабочем пространстве</span><span className="mini-sparkline spark-one"><i /><i /><i /><i /><i /><i /><i /></span></>}</div></article>
            <article className="stat-card"><div className="stat-top"><span>Активные проекты</span><span className="stat-icon lilac-icon"><BriefcaseBusiness size={17} /></span></div><div className="stat-value">{storageMode === "loading" ? "—" : <>{String(activeProjectCount).padStart(2, "0")}<span className="stat-unit"> / {String(projects.length).padStart(2, "0")}</span></>}</div><div className="stat-foot">{storageMode === "loading" ? "Загружаем данные…" : <><span className="stat-neutral">{projects.length - activeProjectCount} завершено</span><span>из всех проектов</span><span className="mini-sparkline spark-two"><i /><i /><i /><i /><i /><i /><i /></span></>}</div></article>
            <article className="stat-card"><div className="stat-top"><span>Ожидают оплаты</span><span className="stat-icon apricot-icon"><CreditCard size={17} /></span></div><div className="stat-value">{storageMode === "loading" ? "—" : money(awaitingPayment)}</div><div className="stat-foot">{storageMode === "loading" ? "Загружаем данные…" : <><span className="trend-warn"><Clock3 size={13} />{projects.filter((project) => project.status === "Ожидает оплаты").length} проекта</span><span>по бюджетам проектов</span><span className="mini-sparkline spark-three"><i /><i /><i /><i /><i /><i /><i /></span></>}</div></article>
            <article className="stat-card"><div className="stat-top"><span>Клиенты</span><span className="stat-icon blue-icon"><UsersRound size={17} /></span></div><div className="stat-value">{storageMode === "loading" ? "—" : String(clients.length).padStart(2, "0")}</div><div className="stat-foot">{storageMode === "loading" ? "Загружаем данные…" : <><span>{clients.length ? "Ведутся в Forma" : "Добавьте первого клиента"}</span><span className="mini-sparkline spark-four"><i /><i /><i /><i /><i /><i /><i /></span></>}</div></article>
          </section>

          <section className="middle-grid">
            <article className="panel revenue-panel"><div className="panel-heading"><div><div className="panel-title-row"><h2>{storageMode === "loading" ? "Загрузка данных" : storageMode === "database" ? "Бюджет проектов" : "Демо-график доходов"}</h2><span className="info-hint"><button type="button" className="info-dot" aria-label="Пояснение к бюджету проектов" aria-describedby="project-budget-tooltip">i</button><span className="info-tooltip" id="project-budget-tooltip" role="tooltip">{storageMode === "database" ? "Сумма бюджетов всех проектов. Фактические оплаты учитываются в разделе «Финансы»." : "Демонстрационные значения для примера. Они не являются реальными доходами."}</span></span></div><div className="revenue-total">{storageMode === "loading" ? "—" : storageMode === "database" ? money(projectBudget) : chart.total}{storageMode === "loading" ? null : storageMode === "database" ? <span className="stat-neutral">по проектам</span> : <span className="trend-positive"><ArrowUpRight size={14} />{chart.change}</span>}</div></div>{storageMode === "demo" && <div className="period-switch" role="group" aria-label="Период дохода">{Object.keys(chartSets).map((item) => <button key={item} onClick={() => setPeriod(item)} className={period === item ? "selected" : ""}>{item.replace("За ", "")}</button>)}</div>}</div>{storageMode === "loading" ? <div className="chart-empty"><b>Загружаем данные из базы…</b></div> : storageMode === "database" ? <div className="chart-empty"><span className="stat-icon sage-icon"><FileText size={17} /></span><b>История платежей появится вместе со счетами</b><p>Пока здесь показана сумма бюджетов всех проектов.</p></div> : <div className="chart-area"><div className="chart-y-labels"><span>100к</span><span>75к</span><span>50к</span><span>25к</span></div><RevenueChart values={chart.values} /><div className="chart-x-labels">{chart.labels.map((label) => <span key={label}>{label}</span>)}</div></div>}</article>

            <article className="panel tasks-panel"><div className="panel-heading task-heading"><div><h2>На сегодня</h2><p>{todayTasks.length} задач, {todayTasks.filter((task) => task.isCompleted).length} выполнено</p></div><button className="tiny-icon" aria-label="Показать все задачи" onClick={() => selectSection("Календарь")}><ArrowRight size={16} /></button></div><TaskList tasks={todayTasks.slice(0, 4)} onToggle={(task) => { void toggleTask(task); }} onEdit={(task) => setModal({ kind: "задачу", record: { id: task.id, name: task.title, company: task.projectName, dueDate: task.dueDate, dueTime: task.dueTime, isCompleted: task.isCompleted } })} emptyMessage="На сегодня задач нет. Добавьте первую." /><button className="all-tasks-button" onClick={() => selectSection("Календарь")}>Все задачи дня<ArrowRight size={14} /></button></article>
          </section>

          <section className="panel clients-panel"><div className="panel-heading clients-heading"><div><div className="panel-title-row"><h2>Последние клиенты</h2><span className="client-total">{storageMode === "loading" ? "—" : clients.length}</span></div><p>Следите за активностью и оплатами</p></div><div className="client-actions"><button className="table-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти клиента" /></button><button className="text-button" onClick={() => selectSection("Клиенты")}>Все клиенты<ArrowRight size={14} /></button></div></div>
            <ClientsTable clients={filteredClients.slice(0, 5)} onEdit={(client) => setModal({ kind: "клиента", record: client })} emptyMessage={storageMode === "loading" ? "Загружаем клиентов…" : "Клиентов пока нет. Добавьте первого клиента."} />
            <div className="table-footer"><span>{storageMode === "loading" ? "Загружаем список клиентов…" : `Показано ${Math.min(filteredClients.length, 5)} из ${clients.length} клиентов`}</span><button className="text-button" onClick={() => selectSection("Клиенты")}>Открыть список<ArrowRight size={14} /></button></div>
          </section>
          </>}

          {activeNav === "Клиенты" && <section className="panel clients-panel"><div className="panel-heading clients-heading"><div><div className="panel-title-row"><h2>Все клиенты</h2><span className="client-total">{storageMode === "loading" ? "—" : clients.length}</span></div><p>Карточки клиентов вашего рабочего пространства</p></div><div className="client-actions"><label className="table-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти клиента" /></label></div></div><ClientsTable clients={filteredClients} onEdit={(client) => setModal({ kind: "клиента", record: client })} emptyMessage={storageMode === "loading" ? "Загружаем клиентов…" : "Клиентов пока нет. Добавьте первого клиента."} /><div className="table-footer"><span>{storageMode === "loading" ? "Загружаем список клиентов…" : `Показано ${filteredClients.length} из ${clients.length} клиентов`}</span></div></section>}

          {activeNav === "Проекты" && <section className="panel clients-panel"><div className="panel-heading clients-heading"><div><div className="panel-title-row"><h2>Все проекты</h2><span className="client-total">{storageMode === "loading" ? "—" : projects.length}</span></div><p>Название, клиент, бюджет и текущий статус</p></div><div className="project-controls"><label className="table-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти проект" /></label><select className="project-filter" aria-label="Фильтр проектов по статусу" value={projectStatusFilter} onChange={(event) => setProjectStatusFilter(event.target.value)}><option value="all">Все статусы</option><option value="В работе">В работе</option><option value="Ожидает оплаты">Ожидает оплаты</option><option value="Завершён">Завершён</option></select><select className="project-filter" aria-label="Сортировка проектов" value={projectSort} onChange={(event) => setProjectSort(event.target.value)}><option value="budget-desc">Сначала больший бюджет</option><option value="budget-asc">Сначала меньший бюджет</option><option value="name-asc">По названию</option></select></div></div><ProjectsTable projects={visibleProjects} onEdit={(project) => setModal({ kind: "проект", record: project })} emptyMessage={storageMode === "loading" ? "Загружаем проекты…" : projects.length === 0 ? "Проектов пока нет. Создайте первый проект." : "По выбранным условиям проекты не найдены."} /><div className="table-footer"><span>{storageMode === "loading" ? "Загружаем список проектов…" : `Показано ${visibleProjects.length} из ${projects.length} проектов`}</span></div></section>}

          {activeNav === "Финансы" && <section className="finance-view"><div className="stats-grid"><article className="stat-card"><div className="stat-top"><span>Ожидают оплаты</span><span className="stat-icon apricot-icon"><CreditCard size={17} /></span></div><div className="stat-value">{money(invoiceOutstanding)}</div><div className="stat-foot">{invoices.filter((invoice) => invoice.status === "sent" || invoice.status === "overdue").length} счетов отправлено или просрочено</div></article><article className="stat-card"><div className="stat-top"><span>Получено</span><span className="stat-icon sage-icon"><WalletCards size={17} /></span></div><div className="stat-value">{money(invoicePaid)}</div><div className="stat-foot">{invoices.filter((invoice) => invoice.status === "paid").length} оплаченных счетов</div></article><article className="stat-card"><div className="stat-top"><span>Все счета</span><span className="stat-icon lilac-icon"><FileText size={17} /></span></div><div className="stat-value">{invoices.length}</div><div className="stat-foot">В этом рабочем пространстве</div></article></div><section className="panel clients-panel"><div className="panel-heading clients-heading"><div><h2>Счета</h2><p>Сроки оплаты и финансовый статус по проектам</p></div><label className="table-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти счёт" /></label></div><InvoicesTable invoices={filteredInvoices} onEdit={(invoice) => setModal({ kind: "счёт", record: { id: invoice.id, name: invoice.invoiceNumber, company: invoice.projectName, budget: invoice.amount, dueDate: invoice.dueDate, status: invoice.status } })} /></section></section>}

          {activeNav === "Календарь" && <section className="panel tasks-panel calendar-view"><div className="panel-heading task-heading"><div><h2>Все задачи</h2><p>Задачи привязаны к проектам и сохраняют статус выполнения</p></div><label className="table-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти задачу" /></label></div><TaskList tasks={filteredTasks} showDate onToggle={(task) => { void toggleTask(task); }} onEdit={(task) => setModal({ kind: "задачу", record: { id: task.id, name: task.title, company: task.projectName, dueDate: task.dueDate, dueTime: task.dueTime, isCompleted: task.isCompleted } })} emptyMessage="Задач пока нет. Создайте первую задачу." /></section>}

          {activeNav === "Документы" && <section className="documents-view">
            <form className="panel document-upload-panel" onSubmit={uploadDocument}>
              <div className="document-upload-intro"><span className="document-upload-icon"><UploadCloud size={19} /></span><span><b>Добавить документ</b><small>PDF, DOCX, XLSX, PNG, JPG или WEBP · до 4 МБ</small></span></div>
              <div className="document-upload-controls">
                <input ref={documentInputRef} className="document-file-input" id="document-file" type="file" accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.webp" onChange={(event) => { setDocumentFile(event.target.files?.[0] ?? null); setDocumentError(""); }} />
                <label className="secondary-button document-file-label" htmlFor="document-file"><FileText size={15} /><span>{documentFile?.name ?? "Выбрать файл"}</span></label>
                <select className="document-link-select" value={documentLink} onChange={(event) => setDocumentLink(event.target.value)} aria-label="Привязать документ">
                  <option value="">Без привязки</option>
                  <optgroup label="Проекты">{projects.filter((project) => project.id).map((project) => <option key={project.id} value={`project:${project.id}`}>{project.name}</option>)}</optgroup>
                  <optgroup label="Клиенты">{clients.filter((client) => client.id).map((client) => <option key={client.id} value={`client:${client.id}`}>{client.name}</option>)}</optgroup>
                </select>
                <button className="primary-button document-upload-button" type="submit" disabled={uploadingDocument || !documentFile}><UploadCloud size={15} />{uploadingDocument ? "Загружаем…" : "Загрузить"}</button>
              </div>
              {documentError && <p className="form-error document-error" role="alert">{documentError}</p>}
            </form>

            <section className="panel document-list-panel">
              <div className="panel-heading clients-heading"><div><div className="panel-title-row"><h2>Документы</h2><span className="client-total">{documents.length}</span></div><p>Файлы доступны только участникам вашего рабочего пространства</p></div><label className="table-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти документ" /></label></div>
              {filteredDocuments.length ? <div className="document-list" role="list">{filteredDocuments.map((document) => <article className="document-row" role="listitem" key={document.id}>
                <span className="document-type-icon"><FileText size={17} /></span>
                <span className="document-main"><b title={document.name}>{document.name}</b><small>{fileSizeLabel(document.size)} <i /> {documentDateLabel(document.createdAt)}</small></span>
                <span className="document-relationship"><b>{document.projectName || document.clientName || "Без привязки"}</b>{document.projectName && document.clientName && <small>{document.clientName}</small>}</span>
                <span className="document-row-actions"><a className="row-more" href={`/api/documents/${document.id}/file`} download aria-label={`Скачать ${document.name}`} title="Скачать"><Download size={15} /></a><button className="row-more" type="button" onClick={() => { void deleteDocument(document); }} aria-label={`Удалить ${document.name}`} title="Удалить"><Trash2 size={15} /></button></span>
              </article>)}</div> : <div className="document-empty"><span className="placeholder-icon"><FileText size={19} /></span><b>{documents.length ? "Ничего не найдено" : "Здесь пока нет документов"}</b><p>{documents.length ? "Попробуйте изменить запрос." : "Загрузите договор, смету или другой файл и при желании привяжите его к проекту или клиенту."}</p></div>}
              {documents.length > 0 && <div className="table-footer"><span>Показано {filteredDocuments.length} из {documents.length} документов</span></div>}
            </section>
          </section>}

          {activeNav === "Активность" && <section className="panel activity-panel">
            <div className="panel-heading clients-heading"><div><div className="panel-title-row"><h2>История активности</h2><span className="client-total">{activityItems.length}</span></div><p>Действия участников вашего рабочего пространства</p></div><button className="secondary-button activity-read-button" disabled={unreadActivityCount === 0} onClick={() => void openActivity()}><Check size={15} />Всё прочитано</button></div>
            {activityItems.length ? <div className="activity-list">{activityItems.map((item) => <article className={`activity-row ${item.isRead ? "" : "activity-unread"}`} key={item.id}><span className="activity-icon"><Activity size={16} /></span><span className="activity-copy"><b>{item.actorName} {item.action} {item.entityType} <strong>{item.entityName}</strong></b><small>{activityTimeLabel(item.createdAt)}</small></span>{!item.isRead && <i className="activity-unread-dot" aria-label="Новое событие" />}</article>)}</div> : <div className="document-empty"><span className="placeholder-icon"><Activity size={19} /></span><b>Пока событий нет</b><p>Здесь появятся записи о клиентах, проектах, задачах, счетах и документах.</p></div>}
          </section>}

          <footer className="page-footer"><span>© 2026 Forma Studio</span><span><button onClick={() => showToast(storageMode === "database" ? "PostgreSQL подключён" : "Добавьте DATABASE_URL и выполните миграции")}><i className="live-dot" />{storageMode === "database" ? "PostgreSQL подключён" : storageMode === "demo" ? "Демо-режим · без сохранения" : "Подключаемся к хранилищу…"}</button><span className="footer-separator">·</span>Сделано для спокойной работы</span></footer>
        </div>
      </section>

      {modal && <CreateModal key={`${modal.kind}-${modal.record?.id ?? modal.record?.name ?? "new"}`} kind={modal.kind} record={modal.record} projects={projects} clients={clients} onClose={() => setModal(null)} onSave={saveRecord} onDelete={modal.record ? deleteRecord : undefined} />}
      {toast && <div className="toast-message" role="status"><span><Check size={14} /></span>{toast}</div>}
    </main>
  );
}
