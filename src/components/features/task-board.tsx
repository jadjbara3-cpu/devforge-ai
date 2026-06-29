"use client";

import * as React from "react";
import { io, type Socket } from "socket.io-client";
import { motion, AnimatePresence } from "framer-motion";
import {
  KanbanSquare,
  Plus,
  Trash2,
  GripVertical,
  Users,
  Radio,
  Wifi,
  WifiOff,
  Hand,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface BoardTask {
  id: string;
  title: string;
  description?: string;
  status: "todo" | "in-progress" | "done";
  priority: "low" | "medium" | "high";
  assignee?: string;
  color: string;
  createdAt: number;
  updatedAt: number;
}

interface SessionUser {
  id: string;
  name: string;
  color: string;
  cursor?: { column: string; taskId?: string };
}

const COLUMNS: { key: BoardTask["status"]; label: string; accent: string }[] = [
  { key: "todo", label: "To Do", accent: "border-t-slate-400" },
  { key: "in-progress", label: "In Progress", accent: "border-t-amber-400" },
  { key: "done", label: "Done", accent: "border-t-emerald-400" },
];

const COLOR_MAP: Record<string, string> = {
  emerald: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  sky: "bg-sky-500/15 text-sky-500 border-sky-500/30",
  amber: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  fuchsia: "bg-fuchsia-500/15 text-fuchsia-500 border-fuchsia-500/30",
  violet: "bg-violet-500/15 text-violet-500 border-violet-500/30",
  rose: "bg-rose-500/15 text-rose-500 border-rose-500/30",
  teal: "bg-teal-500/15 text-teal-500 border-teal-500/30",
  cyan: "bg-cyan-500/15 text-cyan-500 border-cyan-500/30",
};

const PRIORITY_LABEL: Record<BoardTask["priority"], string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const PRIORITY_STYLE: Record<BoardTask["priority"], string> = {
  low: "bg-slate-500/10 text-slate-400",
  medium: "bg-amber-500/10 text-amber-500",
  high: "bg-rose-500/10 text-rose-500",
};

export function TaskBoard() {
  const [socket, setSocket] = React.useState<Socket | null>(null);
  const [connected, setConnected] = React.useState(false);
  const [me, setMe] = React.useState<SessionUser | null>(null);
  const [users, setUsers] = React.useState<SessionUser[]>([]);
  const [tasks, setTasks] = React.useState<BoardTask[]>([]);
  const [presenceFlash, setPresenceFlash] = React.useState<string | null>(null);
  const [cursors, setCursors] = React.useState<
    Record<string, { column: string; user: SessionUser }>
  >({});

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [draftStatus, setDraftStatus] = React.useState<BoardTask["status"]>("todo");
  const [draft, setDraft] = React.useState({
    title: "",
    description: "",
    priority: "medium" as BoardTask["priority"],
  });
  const [draggedTaskId, setDraggedTaskId] = React.useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = React.useState<BoardTask["status"] | null>(null);
  const { toast } = useToast();

  React.useEffect(() => {
    const s = io("/?XTransformPort=3003", {
      transports: ["websocket", "polling"],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 1200,
    });
    setSocket(s);

    s.on("connect", () => setConnected(true));
    s.on("disconnect", () => setConnected(false));

    s.on("hello", (data: { user: SessionUser }) => setMe(data.user));
    s.on("tasks:update", (data: BoardTask[]) => setTasks(data));
    s.on("users:update", (data: SessionUser[]) => setUsers(data));
    s.on("presence", ({ user, action }: { user: SessionUser; action: string }) => {
      setPresenceFlash(`${user.name} ${action === "join" ? "joined" : "left"}`);
      setTimeout(() => setPresenceFlash(null), 2500);
    });
    s.on("cursor:update", ({
      user,
      column,
    }: {
      user: SessionUser;
      column: string;
    }) => {
      setCursors((prev) => ({ ...prev, [user.id]: { column, user } }));
    });
    s.on("task:moved", ({ by }: { by: SessionUser }) => {
      toast({
        title: "Task moved",
        description: `${by.name} updated a task.`,
      });
    });

    return () => {
      s.disconnect();
    };
  }, [toast]);

  const sendCursor = React.useCallback(
    (column: string) => {
      socket?.emit("cursor", { column });
    },
    [socket]
  );

  const createTask = () => {
    if (!draft.title.trim()) return;
    socket?.emit("task:create", {
      title: draft.title,
      description: draft.description,
      priority: draft.priority,
      status: draftStatus,
      assignee: me?.name,
      color: me?.color,
    });
    setDraft({ title: "", description: "", priority: "medium" });
    setDialogOpen(false);
  };

  const moveTask = (id: string, status: BoardTask["status"]) => {
    socket?.emit("task:move", { id, status });
  };

  const deleteTask = (id: string) => {
    socket?.emit("task:delete", { id });
  };

  const claimTask = (id: string) => {
    socket?.emit("task:claim", { id });
  };

  const tasksByStatus = (status: BoardTask["status"]) =>
    tasks.filter((t) => t.status === status);

  // --- Drag and drop handlers ---
  const onDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", taskId);
  };

  const onDragEnd = () => {
    setDraggedTaskId(null);
    setDragOverColumn(null);
  };

  const onColumnDragOver = (e: React.DragEvent, col: BoardTask["status"]) => {
    if (!draggedTaskId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverColumn !== col) setDragOverColumn(col);
  };

  const onColumnDragLeave = (e: React.DragEvent, col: BoardTask["status"]) => {
    // Only clear if leaving the column entirely (not entering a child)
    const related = e.relatedTarget as Node | null;
    const currentTarget = e.currentTarget as Node;
    if (related && currentTarget.contains(related)) return;
    if (dragOverColumn === col) setDragOverColumn(null);
  };

  const onColumnDrop = (e: React.DragEvent, col: BoardTask["status"]) => {
    e.preventDefault();
    const id = draggedTaskId || e.dataTransfer.getData("text/plain");
    if (id) {
      const task = tasks.find((t) => t.id === id);
      if (task && task.status !== col) {
        moveTask(id, col);
      }
    }
    setDraggedTaskId(null);
    setDragOverColumn(null);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <Card className="overflow-hidden">
        <div className="relative flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-primary/15 via-primary/5 to-transparent" />
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <KanbanSquare className="h-5 w-5" />
            </div>
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                Task Board
                {connected ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
                    <Wifi className="h-3 w-3" /> Live
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium text-rose-500">
                    <WifiOff className="h-3 w-3" /> Reconnecting
                  </span>
                )}
              </h2>
              <p className="text-xs text-muted-foreground">
                Real-time collaborative Kanban · synced via Socket.io
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Presence avatars */}
            <div className="hidden items-center gap-2 md:flex">
              <Users className="h-4 w-4 text-muted-foreground" />
              <div className="flex -space-x-2">
                {users.slice(0, 5).map((u) => (
                  <div
                    key={u.id}
                    title={u.name}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full border-2 border-background text-[10px] font-bold",
                      COLOR_MAP[u.color] || "bg-muted text-muted-foreground"
                    )}
                  >
                    {u.name.slice(0, 2).toUpperCase()}
                  </div>
                ))}
                {users.length > 5 && (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-bold">
                    +{users.length - 5}
                  </div>
                )}
              </div>
              {me && (
                <span className="text-xs text-muted-foreground">
                  You are <span className="font-semibold text-foreground">{me.name}</span>
                </span>
              )}
            </div>
            <Button onClick={() => setDialogOpen(true)} size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> New task
            </Button>
          </div>
        </div>

        {/* Presence flash */}
        <AnimatePresence>
          {presenceFlash && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex items-center gap-2 border-t bg-primary/5 px-5 py-2 text-xs text-primary"
            >
              <Radio className="h-3.5 w-3.5 animate-pulse" />
              {presenceFlash}
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* Board */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const colTasks = tasksByStatus(col.key);
          const activeCursors = Object.values(cursors).filter(
            (c) => c.column === col.key
          );
          return (
            <div
              key={col.key}
              onMouseEnter={() => sendCursor(col.key)}
              onDragOver={(e) => onColumnDragOver(e, col.key)}
              onDragLeave={(e) => onColumnDragLeave(e, col.key)}
              onDrop={(e) => onColumnDrop(e, col.key)}
              className={cn(
                "flex flex-col rounded-xl border border-t-4 bg-card/40 p-3 transition-colors",
                dragOverColumn === col.key
                  ? "border-primary/60 bg-primary/5 ring-2 ring-primary/20"
                  : ""
              )}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">{col.label}</h3>
                  <Badge variant="secondary" className="text-[10px]">
                    {colTasks.length}
                  </Badge>
                </div>
                <div className="flex items-center gap-1">
                  {activeCursors.map((c) => (
                    <span
                      key={c.user.id}
                      title={`${c.user.name} viewing`}
                      className={cn(
                        "h-2 w-2 rounded-full animate-pulse",
                        COLOR_MAP[c.user.color]?.split(" ")[0] || "bg-muted"
                      )}
                    />
                  ))}
                </div>
              </div>

              <div className="flex min-h-[200px] flex-1 flex-col gap-2">
                <AnimatePresence initial={false}>
                  {colTasks.map((task) => (
                    <motion.div
                      key={task.id}
                      layout
                      draggable
                      onDragStart={(e) => onDragStart(e as unknown as React.DragEvent, task.id)}
                      onDragEnd={onDragEnd}
                      initial={{ opacity: 0, scale: 0.95, y: 8 }}
                      animate={{
                        opacity: draggedTaskId === task.id ? 0.4 : 1,
                        scale: 1,
                        y: 0,
                      }}
                      exit={{ opacity: 0, scale: 0.9, y: -8 }}
                      transition={{ type: "spring", stiffness: 350, damping: 28 }}
                      className={cn(
                        "cursor-grab active:cursor-grabbing",
                        draggedTaskId === task.id && "ring-2 ring-primary/40 rounded-xl"
                      )}
                    >
                      <Card className="group relative p-3 transition-shadow hover:shadow-md">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-sm font-medium leading-tight">
                            {task.title}
                          </h4>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                className="opacity-0 transition-opacity group-hover:opacity-100"
                                aria-label="Move task"
                              >
                                <GripVertical className="h-4 w-4 text-muted-foreground" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {COLUMNS.filter((c) => c.key !== task.status).map(
                                (c) => (
                                  <DropdownMenuItem
                                    key={c.key}
                                    onClick={() => moveTask(task.id, c.key)}
                                  >
                                    Move to {c.label}
                                  </DropdownMenuItem>
                                )
                              )}
                              <DropdownMenuItem onClick={() => claimTask(task.id)}>
                                <Hand className="mr-2 h-3.5 w-3.5" /> Claim this task
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-rose-500"
                                onClick={() => deleteTask(task.id)}
                              >
                                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        {task.description && (
                          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                            {task.description}
                          </p>
                        )}

                        <div className="mt-3 flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                                PRIORITY_STYLE[task.priority]
                              )}
                            >
                              {PRIORITY_LABEL[task.priority]}
                            </span>
                            {task.assignee && (
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-medium",
                                  COLOR_MAP[task.color] ||
                                    "border-border text-muted-foreground"
                                )}
                              >
                                {task.assignee}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(task.updatedAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {colTasks.length === 0 && (
                  <div
                    className={cn(
                      "flex flex-1 items-center justify-center rounded-lg border border-dashed text-xs transition-colors",
                      dragOverColumn === col.key
                        ? "border-primary/60 bg-primary/5 text-primary"
                        : "text-muted-foreground"
                    )}
                  >
                    {dragOverColumn === col.key
                      ? "Drop to move here"
                      : "Drop tasks here"}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Title</label>
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="e.g. Polish onboarding flow"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Description</label>
              <Textarea
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
                placeholder="Optional details…"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Priority</label>
                <Select
                  value={draft.priority}
                  onValueChange={(v) =>
                    setDraft({ ...draft, priority: v as BoardTask["priority"] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Column</label>
                <Select
                  value={draftStatus}
                  onValueChange={(v) =>
                    setDraftStatus(v as BoardTask["status"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COLUMNS.map((c) => (
                      <SelectItem key={c.key} value={c.key}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              <X className="mr-1 h-4 w-4" /> Cancel
            </Button>
            <Button onClick={createTask} disabled={!draft.title.trim()}>
              <Plus className="mr-1 h-4 w-4" /> Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
