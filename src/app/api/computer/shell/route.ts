import { NextRequest, NextResponse } from "next/server";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

import {
  classifyShellCommand,
  explainDanger,
  MAX_SHELL_TIMEOUT_MS,
} from "@/lib/computer-use/security";
import type { ShellRequest, ShellResponse, ShellKind } from "@/lib/computer-use/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const execFileAsync = promisify(execFile);

/**
 * POST /api/computer/shell
 *
 * Body: ShellRequest
 *   { command, kind?: "cmd"|"powershell" (default powershell),
 *     timeoutMs?, cwd?, allowDangerous? }
 *
 * Returns: ShellResponse
 *   { stdout, stderr, exitCode, durationMs, timedOut, command, kind }
 *
 * SECURITY:
 *   - All commands are scanned against the dangerous-pattern list. Matches
 *     are refused with 403 + the matched patterns, UNLESS `allowDangerous:true`
 *     is set (the agent loop never sets this).
 *   - Commands run via `child_process.execFile` with argument arrays (no
 *     shell interpolation) for `cmd /c`. PowerShell commands are passed via
 *     `-EncodedCommand` (base64 UTF-16LE) — this is the only quoting-safe
 *     way to pass an arbitrary script through cmd.exe to powershell.exe.
 *   - Default cwd is %USERPROFILE%.
 *   - Timeout is capped at 60s.
 */
export async function POST(req: NextRequest) {
  let body: ShellRequest;
  try {
    body = (await req.json()) as ShellRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body || typeof body.command !== "string" || !body.command.trim()) {
    return NextResponse.json({ error: "command is required." }, { status: 400 });
  }

  // Danger sweep.
  if (!body.allowDangerous) {
    const risk = classifyShellCommand(body.command);
    if (risk === "destructive") {
      const reasons = explainDanger(body.command);
      return NextResponse.json(
        {
          error: `Destructive command refused. Matched patterns: ${reasons.join("; ")}. Set allowDangerous:true to override (NOT recommended).`,
          code: "DESTRUCTIVE_BLOCKED",
          patterns: reasons,
        },
        { status: 403 },
      );
    }
  }

  const kind: ShellKind = body.kind === "cmd" ? "cmd" : "powershell";
  const timeoutMs = Math.min(
    MAX_SHELL_TIMEOUT_MS,
    Math.max(1_000, body.timeoutMs ?? 15_000),
  );
  const cwd = body.cwd || process.env.USERPROFILE || "C:\\";

  const startedAt = Date.now();
  try {
    if (kind === "cmd") {
      // execFile with arg array — no shell interpolation.
      try {
        const result = await execFileAsync("cmd.exe", ["/c", body.command], {
          cwd,
          timeout: timeoutMs,
          maxBuffer: 1024 * 1024,
          windowsHide: true,
        });
        return NextResponse.json({
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: 0,
          durationMs: Date.now() - startedAt,
          timedOut: false,
          command: body.command,
          kind,
        } satisfies ShellResponse);
      } catch (err) {
        // execFile rejects on non-zero exit; capture stdout/stderr.
        const e = err as Error & {
          stdout?: string;
          stderr?: string;
          code?: number | string;
          killed?: boolean;
          signal?: string;
        };
        const timedOut = Boolean(e.killed) || e.signal === "SIGTERM";
        return NextResponse.json({
          stdout: e.stdout ?? "",
          stderr: e.stderr ?? e.message ?? "",
          exitCode: typeof e.code === "number" ? e.code : null,
          durationMs: Date.now() - startedAt,
          timedOut,
          command: body.command,
          kind,
        } satisfies ShellResponse);
      }
    }

    // PowerShell via -EncodedCommand (base64 UTF-16LE) — fully quoting-safe.
    const encoded = Buffer.from(body.command, "utf16le").toString("base64");
    const result = await runSpawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
      cwd,
      timeoutMs,
    );
    return NextResponse.json({
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      durationMs: Date.now() - startedAt,
      timedOut: result.timedOut,
      command: body.command,
      kind,
    } satisfies ShellResponse);
  } catch (err) {
    console.error("[api/computer/shell] error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Shell exec failed.",
        code: "SHELL_FAILED",
      },
      { status: 500 },
    );
  }
}

/**
 * Spawn a process with stdout+stderr capture + timeout. Returns a structured
 * result regardless of exit code (does NOT throw on non-zero exit).
 */
function runSpawn(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }, timeoutMs);

    child.stdout.on("data", (c: Buffer) => stdoutChunks.push(c));
    child.stderr.on("data", (c: Buffer) => stderrChunks.push(c));

    child.on("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        exitCode: null,
        timedOut,
      });
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        exitCode: typeof code === "number" ? code : null,
        timedOut,
      });
    });
  });
}
