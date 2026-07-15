import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import { jailPath, JailViolationError } from "@/lib/computer-use/security";
import type {
  FileActionType,
  FileEntry,
  FilesRequest,
  FilesResponse,
} from "@/lib/computer-use/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const VALID_ACTIONS = new Set<FileActionType>([
  "list", "read", "write", "mkdir", "delete", "stat", "search",
]);

/**
 * GET /api/computer/files?action=list&path=C:/Users/jad/Documents
 *      /api/computer/files?action=read&path=...
 *      /api/computer/files?action=stat&path=...
 *      /api/computer/files?action=search&path=...&pattern=*.txt
 *
 * POST /api/computer/files
 *   { action: "write"|"mkdir"|"delete", path, content?, recursive? }
 *
 * Security: all paths MUST resolve inside the user's home directory. Paths
 * outside the jail are refused with 403. Set `unsafe:true` in the body to
 * bypass (only the agent loop in DANGER MODE does this — never exposed via UI).
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const action = (sp.get("action") ?? "list") as FileActionType;
  if (!VALID_ACTIONS.has(action)) {
    return NextResponse.json({ error: `Invalid action: ${action}` }, { status: 400 });
  }
  const rawPath = sp.get("path") || "";
  if (!rawPath) {
    return NextResponse.json({ error: "path is required." }, { status: 400 });
  }
  const allowUnsafe = sp.get("unsafe") === "1";

  try {
    const resolved = jailPath(rawPath, { allowUnsafe });
    switch (action) {
      case "list": {
        const entries = await listDir(resolved, sp.get("includeHidden") === "1");
        return NextResponse.json({ action, path: resolved, entries, ok: true } satisfies FilesResponse);
      }
      case "read": {
        const content = await fs.readFile(resolved, "utf8");
        return NextResponse.json({ action, path: resolved, content, ok: true } satisfies FilesResponse);
      }
      case "stat": {
        const stat = await safeStat(resolved);
        return NextResponse.json({ action, path: resolved, stat, ok: true } satisfies FilesResponse);
      }
      case "search": {
        const pattern = sp.get("pattern") || "*";
        const limit = sp.has("limit") ? parseInt(sp.get("limit")!, 10) : 100;
        const matches = await searchFiles(resolved, pattern, Math.max(1, Math.min(500, limit)));
        return NextResponse.json({ action, path: resolved, matches, ok: true } satisfies FilesResponse);
      }
      default:
        return NextResponse.json({ error: `GET does not support action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  let body: FilesRequest;
  try {
    body = (await req.json()) as FilesRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body || typeof body.action !== "string" || !VALID_ACTIONS.has(body.action)) {
    return NextResponse.json(
      { error: `action must be one of: ${[...VALID_ACTIONS].join(", ")}` },
      { status: 400 },
    );
  }
  if (!body.path || typeof body.path !== "string") {
    return NextResponse.json({ error: "path is required." }, { status: 400 });
  }

  try {
    const resolved = jailPath(body.path, { allowUnsafe: false });
    switch (body.action) {
      case "write": {
        if (typeof body.content !== "string") {
          return NextResponse.json({ error: "write requires string content." }, { status: 400 });
        }
        if (body.recursive) {
          await fs.mkdir(path.dirname(resolved), { recursive: true });
        }
        await fs.writeFile(resolved, body.content, "utf8");
        return NextResponse.json({ action: "write", path: resolved, ok: true } satisfies FilesResponse);
      }
      case "mkdir": {
        await fs.mkdir(resolved, { recursive: Boolean(body.recursive) });
        return NextResponse.json({ action: "mkdir", path: resolved, ok: true } satisfies FilesResponse);
      }
      case "delete": {
        // Backup before delete (rollback plan) — move to .devforge-trash/<timestamp>.
        const trashDir = path.join(process.env.USERPROFILE || ".", ".devforge-trash");
        await fs.mkdir(trashDir, { recursive: true });
        const backupName = `${path.basename(resolved)}.${Date.now()}.bak`;
        const backupPath = path.join(trashDir, backupName);
        try {
          await fs.rename(resolved, backupPath);
        } catch {
          // Fallback: if rename fails (cross-device), just unlink.
          await fs.rm(resolved, { recursive: true, force: true });
        }
        return NextResponse.json({
          action: "delete",
          path: resolved,
          ok: true,
          data: { backup: backupPath },
        } satisfies FilesResponse);
      }
      default:
        return NextResponse.json(
          { error: `POST does not support action: ${body.action}` },
          { status: 400 },
        );
    }
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function listDir(dir: string, includeHidden: boolean): Promise<FileEntry[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const result: FileEntry[] = [];
  for (const e of entries) {
    if (!includeHidden && (e.name.startsWith(".") || e.name.startsWith("~"))) continue;
    const full = path.join(dir, e.name);
    try {
      const stat = await fs.stat(full);
      result.push({
        name: e.name,
        path: full,
        isDirectory: stat.isDirectory(),
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      });
    } catch {
      // Skip entries we can't stat (broken symlinks etc.).
    }
  }
  return result.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

async function safeStat(p: string): Promise<FilesResponse["stat"]> {
  try {
    const stat = await fs.stat(p);
    return {
      exists: true,
      isDirectory: stat.isDirectory(),
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    };
  } catch {
    return { exists: false, isDirectory: false, size: 0, modifiedAt: "" };
  }
}

/**
 * Recursive glob search. Supports `*` and `**`. Capped at `limit` results.
 * Uses a stack-based walk so we don't blow the call stack on deep trees.
 */
async function searchFiles(root: string, pattern: string, limit: number): Promise<string[]> {
  const matches: string[] = [];
  const stack: string[] = [root];
  const regex = globToRegex(pattern);
  while (stack.length && matches.length < limit) {
    const dir = stack.pop()!;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (matches.length >= limit) break;
      const full = path.join(dir, e.name);
      if (regex.test(e.name)) matches.push(full);
      if (e.isDirectory() && !e.name.startsWith(".")) stack.push(full);
    }
  }
  return matches;
}

function globToRegex(pattern: string): RegExp {
  // Convert a simple glob (*, ?, **) to a regex.
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\x00")
    .replace(/\*/g, "[^/\\\\]*")
    .replace(/\?/g, "[^/\\\\]")
    .replace(/\x00/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

function handleError(err: unknown): Response {
  if (err instanceof JailViolationError) {
    return NextResponse.json(
      { error: err.message, code: err.code, allowedRoots: err.allowedRoots },
      { status: 403 },
    );
  }
  if (err instanceof Error && err.message.includes("ENOENT")) {
    return NextResponse.json(
      { error: "Path does not exist.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }
  console.error("[api/computer/files] error:", err);
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "File operation failed." },
    { status: 500 },
  );
}
