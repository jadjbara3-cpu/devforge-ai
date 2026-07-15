// ============================================================================
//  DevForge AI - Auto-Update Engine  (lib/updater.ts)
// ----------------------------------------------------------------------------
//  Server-side, framework-agnostic update primitives.
//
//  Flow:
//    1. checkForUpdates()    -> GitHub Releases API -> compare with current ver
//    2. downloadUpdate(url)  -> %TEMP%\devforge-update.exe (resumable)
//    3. installUpdate(path)  -> spawn setup.exe /SILENT /NORESTART (detached)
//
//  All functions are network-fault tolerant: they NEVER throw on transient
//  errors - they resolve to a result object with an `error` field instead, so
//  callers (API routes) can simply forward the result without try/catch noise.
//
//  Runs only on the server (Node / Bun). Uses node:fs, node:path, node:os,
//  node:child_process and the global fetch (Node 18+ / Bun).
// ============================================================================

import { spawn } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  readFileSync,
  statSync,
  promises as fs,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { APP_GITHUB, APP_VERSION } from "@/lib/branding";

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

export interface UpdateInfo {
  /** Whether a newer version than the running one was found. */
  updateAvailable: boolean;
  /** The running app's version (e.g. "1.0.0"). */
  currentVersion: string;
  /** Latest version tag from GitHub (e.g. "v1.1.0"), without leading "v". */
  latestVersion?: string;
  /** Direct browser_download_url of the setup.exe asset. */
  downloadUrl?: string;
  /** HTML body / markdown of the release notes. */
  releaseNotes?: string;
  /** Permalink to the release page on GitHub. */
  releaseUrl?: string;
  /** ISO date the release was published. */
  publishedAt?: string;
  /** ISO timestamp of when this check ran. */
  checkedAt: string;
  /** Populated when the check itself failed (network, parse, etc.). */
  error?: string;
}

export interface DownloadResult {
  ok: boolean;
  /** Absolute path to the downloaded setup.exe (when ok). */
  path?: string;
  /** Bytes received (final). */
  bytesReceived: number;
  /** Total bytes (Content-Length), 0 if unknown. */
  bytesTotal: number;
  /** Whether the download resumed from a partial file. */
  resumed: boolean;
  error?: string;
}

export interface InstallResult {
  ok: boolean;
  /** The PID of the spawned installer (when ok). */
  pid?: number;
  /** The command line that was launched. */
  command?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
//  Constants
// ---------------------------------------------------------------------------

/** GitHub releases JSON endpoint for the "latest" release. */
const RELEASES_API = `${APP_GITHUB}/releases/latest`.replace(
  "github.com",
  "api.github.com/repos",
);

/**
 * Where on disk the downloaded setup.exe lives.
 * Re-using a fixed path makes resumable downloads possible.
 */
export const DOWNLOAD_TARGET = path.join(tmpdir(), "devforge-update.exe");

/** User-Agent: GitHub requires one, and it helps with rate-limiting. */
const UA = "DevForge-AI-Updater/1.0";

/** Hard cap on a single download attempt (10 min). */
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
//  Version comparison (minimal semver)
// ---------------------------------------------------------------------------

/**
 * Normalize a version tag like "v1.2.3" or "1.2.3-beta+build" into a tuple
 * of integers [major, minor, patch]. Non-numeric pre-release suffixes are
 * ignored for comparison purposes (we treat 1.2.3-beta as 1.2.3).
 *
 * Returns [0,0,0] for unparseable input.
 */
export function parseVersion(raw: string | undefined | null): [number, number, number] {
  if (!raw) return [0, 0, 0];
  const cleaned = raw.trim().replace(/^v/i, "").split("-")[0].split("+")[0];
  const parts = cleaned.split(".");
  const nums = parts.slice(0, 3).map((p) => {
    const n = parseInt(p, 10);
    return Number.isFinite(n) ? n : 0;
  });
  while (nums.length < 3) nums.push(0);
  return [nums[0] ?? 0, nums[1] ?? 0, nums[2] ?? 0];
}

/**
 * Returns:
 *   -1 if a < b
 *    0 if a == b
 *    1 if a > b
 */
export function compareVersions(a: string, b: string): number {
  const [aMaj, aMin, aPat] = parseVersion(a);
  const [bMaj, bMin, bPat] = parseVersion(b);
  if (aMaj !== bMaj) return aMaj < bMaj ? -1 : 1;
  if (aMin !== bMin) return aMin < bMin ? -1 : 1;
  if (aPat !== bPat) return aPat < bPat ? -1 : 1;
  return 0;
}

// ---------------------------------------------------------------------------
//  Current version detection
// ---------------------------------------------------------------------------

/**
 * The most accurate installed version. Order of precedence:
 *   1. version.txt in the install root (written by install-logic.bat)
 *   2. The compiled-in APP_VERSION from lib/branding.ts
 *
 * The registry (HKCU\Software\DevForge_AI\Version) is intentionally NOT read
 * here - it requires `reg.exe` on Windows and adds a child-process call per
 * check. version.txt is plain text and trivially fast to read.
 */
export function getCurrentVersion(): string {
  try {
    // The Next.js standalone server runs from <install>\app\server.js.
    // version.txt lives one level up, in the install root.
    const candidates = [
      path.resolve(process.cwd(), "..", "version.txt"),
      path.resolve(process.cwd(), "version.txt"),
      // When running in dev (not from the install dir), LOCALAPPDATA points
      // to the real install location if the app was installed.
      process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, "DevForge_AI", "version.txt")
        : "",
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (candidate && existsSync(candidate)) {
        const raw = readFileSync(candidate, "utf8");
        const trimmed = raw.trim();
        if (trimmed) return trimmed;
      }
    }
  } catch {
    /* swallow - fall back to APP_VERSION */
  }
  return APP_VERSION;
}

// ---------------------------------------------------------------------------
//  1. checkForUpdates()
// ---------------------------------------------------------------------------

interface GitHubAsset {
  name: string;
  browser_download_url: string;
  content_type: string;
  size: number;
}

interface GitHubRelease {
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
  published_at: string;
  assets: GitHubAsset[];
  prerelease: boolean;
  draft: boolean;
}

/**
 * Fetch the latest release from GitHub and compare its tag against the
 * currently-installed version.
 *
 * Network errors are caught and returned as `UpdateInfo.error` with
 * `updateAvailable: false` - this function NEVER throws.
 */
export async function checkForUpdates(): Promise<UpdateInfo> {
  const currentVersion = getCurrentVersion();
  const checkedAt = new Date().toISOString();

  try {
    const res = await fetch(RELEASES_API, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": UA,
      },
      // Don't let a flaky network hang the app.
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });

    if (!res.ok) {
      // 404 = no releases published yet. Not an error from the user's POV.
      if (res.status === 404) {
        return {
          updateAvailable: false,
          currentVersion,
          checkedAt,
          error: "No releases have been published yet.",
        };
      }
      // 403 typically = rate-limited. GitHub returns ~60 req/hr per IP.
      if (res.status === 403 || res.status === 429) {
        return {
          updateAvailable: false,
          currentVersion,
          checkedAt,
          error: "GitHub API rate-limited. Try again later.",
        };
      }
      return {
        updateAvailable: false,
        currentVersion,
        checkedAt,
        error: `GitHub API returned HTTP ${res.status}.`,
      };
    }

    const release = (await res.json()) as GitHubRelease;

    // Pick the setup.exe asset (prefer .exe, fall back to the first asset).
    const exeAsset =
      release.assets.find((a) => a.name.toLowerCase().endsWith(".exe")) ??
      release.assets.find((a) => a.name.toLowerCase().includes("setup")) ??
      release.assets[0];

    const latestVersion = release.tag_name;
    const updateAvailable = compareVersions(latestVersion, currentVersion) > 0;

    return {
      updateAvailable,
      currentVersion,
      latestVersion,
      downloadUrl: exeAsset?.browser_download_url,
      releaseNotes: release.body ?? undefined,
      releaseUrl: release.html_url,
      publishedAt: release.published_at,
      checkedAt,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown network error";
    return {
      updateAvailable: false,
      currentVersion,
      checkedAt,
      error: `Update check failed: ${message}`,
    };
  }
}

// ---------------------------------------------------------------------------
//  2. downloadUpdate()
// ---------------------------------------------------------------------------

/**
 * Download the new setup.exe to DOWNLOAD_TARGET.
 *
 * Features:
 *   - Resumable: if a partial file already exists at the target, sends
 *     `Range: bytes=N-` and appends. If the server ignores the range
 *     (returns 200), restarts from scratch cleanly.
 *   - Progress reporting via onProgress(percent 0..100).
 *   - Hard timeout (DOWNLOAD_TIMEOUT_MS) so a stalled connection can't hang.
 *
 * Never throws - returns DownloadResult with `ok: false` + `error` on failure.
 */
export async function downloadUpdate(
  url: string,
  onProgress?: (percent: number, bytesReceived: number, bytesTotal: number) => void,
): Promise<DownloadResult> {
  if (!url || !/^https?:\/\//i.test(url)) {
    return {
      ok: false,
      bytesReceived: 0,
      bytesTotal: 0,
      resumed: false,
      error: "Invalid download URL.",
    };
  }

  // Check for an existing partial file to resume from.
  let existingBytes = 0;
  let resumed = false;
  try {
    if (existsSync(DOWNLOAD_TARGET)) {
      existingBytes = statSync(DOWNLOAD_TARGET).size;
      if (existingBytes > 0) resumed = true;
    }
  } catch {
    /* ignore stat errors - just start fresh */
  }

  let res: Response;
  try {
    const headers: Record<string, string> = { "User-Agent": UA };
    if (resumed) headers.Range = `bytes=${existingBytes}-`;

    res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      redirect: "follow",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    return {
      ok: false,
      bytesReceived: 0,
      bytesTotal: 0,
      resumed: false,
      error: `Download request failed: ${message}`,
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      bytesReceived: 0,
      bytesTotal: 0,
      resumed: false,
      error: `Download failed: HTTP ${res.status} ${res.statusText}`,
    };
  }

  // The server honored our Range request -> 206 Partial Content, append.
  // Otherwise (200) -> start over, truncate.
  const honoredResume = resumed && res.status === 206;
  if (!honoredResume) {
    existingBytes = 0;
    resumed = false;
  }

  const contentLengthHeader = res.headers.get("content-length");
  const contentLength = contentLengthHeader
    ? parseInt(contentLengthHeader, 10)
    : 0;
  const bytesTotal = contentLength + existingBytes;

  if (!res.body) {
    return {
      ok: false,
      bytesReceived: 0,
      bytesTotal: 0,
      resumed: false,
      error: "Response has no body.",
    };
  }

  // Pipe the response stream to disk, reporting progress periodically.
  try {
    const flags = honoredResume ? "a" : "w";
    const out = createWriteStream(DOWNLOAD_TARGET, { flags });

    let received = existingBytes;
    let lastReportedPct = -1;

    const reader = res.body.getReader();
    const REPORT_INTERVAL = 1024 * 256; // report every 256KB

    // We use an explicit pump instead of `pipeline` so we can compute
    // progress per chunk without monkey-patching the stream.
    const pump = async (): Promise<void> => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        received += value.byteLength;

        await new Promise<void>((resolve, reject) => {
          out.write(Buffer.from(value), (err) =>
            err ? reject(err) : resolve(),
          );
        });

        // Throttle progress reports to avoid React re-render storms.
        const pct =
          bytesTotal > 0
            ? Math.min(100, Math.floor((received / bytesTotal) * 100))
            : 0;
        if (onProgress && (pct !== lastReportedPct || received % REPORT_INTERVAL === 0)) {
          lastReportedPct = pct;
          onProgress(pct, received, bytesTotal);
        }
      }
    };

    await pump();

    await new Promise<void>((resolve, reject) => {
      out.on("error", (err: Error) => reject(err));
      out.on("finish", () => resolve());
      out.end();
    });

    // Final 100% report
    onProgress?.(100, received, bytesTotal);

    return {
      ok: true,
      path: DOWNLOAD_TARGET,
      bytesReceived: received,
      bytesTotal,
      resumed,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Write error";
    return {
      ok: false,
      bytesReceived: existingBytes,
      bytesTotal,
      resumed,
      error: `Download write failed: ${message}`,
    };
  }
}

/**
 * Remove any leftover partial download. Called when the user cancels or
 * before starting a fresh check, to avoid resuming a stale/corrupt file.
 */
export async function clearDownloadCache(): Promise<void> {
  try {
    if (existsSync(DOWNLOAD_TARGET)) {
      await fs.unlink(DOWNLOAD_TARGET);
    }
  } catch {
    /* best-effort */
  }
}

// ---------------------------------------------------------------------------
//  3. installUpdate()
// ---------------------------------------------------------------------------

/**
 * Launch the downloaded setup.exe silently. The current app MUST exit
 * shortly after this resolves - the installer will taskkill bun.exe (via
 * its [Code].PrepareToInstall hook) before overwriting files.
 *
 * Flags:
 *   /SILENT      - Inno Setup: no UI, no prompts
 *   /NORESTART   - don't reboot the machine (we relaunch the app ourselves
 *                  via the [Run] entry gated on IsSilentInstall)
 *   /NOCANCEL    - hide the Cancel button (cosmetic; ignored in /SILENT)
 *
 * We intentionally do NOT pass /TASKS="launchnow" - the silent-mode
 * relaunch is handled by a dedicated [Run] entry with `Check: IsSilentInstall`
 * in devforge-setup.iss, which runs regardless of task selection. Passing
 * /TASKS= would override the default task set and could suppress the
 * desktop-icon task on upgrades.
 *
 * The process is spawned detached and unref'd so it survives the parent
 * (the Next.js server) being killed by the installer.
 *
 * Never throws.
 */
export async function installUpdate(
  downloadedPath: string,
): Promise<InstallResult> {
  if (!downloadedPath || !existsSync(downloadedPath)) {
    return { ok: false, error: "Installer file not found." };
  }

  const args = ["/SILENT", "/NORESTART", "/NOCANCEL"];

  const command = `"${downloadedPath}" ${args.join(" ")}`;

  try {
    const child = spawn(downloadedPath, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      cwd: path.dirname(downloadedPath),
    });
    child.unref();

    return {
      ok: true,
      pid: child.pid,
      command,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "spawn failed";
    return { ok: false, command, error: message };
  }
}

// ---------------------------------------------------------------------------
//  In-process job tracker (used by the /api/update/download route)
// ---------------------------------------------------------------------------

export type JobStatus = "downloading" | "done" | "error" | "cancelled";

export interface DownloadJob {
  id: string;
  url: string;
  status: JobStatus;
  percent: number;
  bytesReceived: number;
  bytesTotal: number;
  resumed: boolean;
  path?: string;
  error?: string;
  startedAt: number;
  updatedAt: number;
}

/** Module-level Map - persists across requests in the same server process. */
const jobs = new Map<string, DownloadJob>();

/** Cull finished/failed jobs older than 30 minutes to bound memory. */
const JOB_TTL_MS = 30 * 60 * 1000;

function cullOldJobs(): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (
      job.status !== "downloading" &&
      now - job.updatedAt > JOB_TTL_MS
    ) {
      jobs.delete(id);
    }
  }
}

export function createJob(url: string): DownloadJob {
  cullOldJobs();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const job: DownloadJob = {
    id,
    url,
    status: "downloading",
    percent: 0,
    bytesReceived: 0,
    bytesTotal: 0,
    resumed: false,
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };
  jobs.set(id, job);
  return job;
}

export function getJob(id: string): DownloadJob | undefined {
  return jobs.get(id);
}

export function listJobs(): DownloadJob[] {
  return Array.from(jobs.values());
}

export function updateJob(
  id: string,
  patch: Partial<DownloadJob>,
): DownloadJob | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;
  Object.assign(job, patch, { updatedAt: Date.now() });
  return job;
}

export function cancelJob(id: string): boolean {
  const job = jobs.get(id);
  if (!job || job.status !== "downloading") return false;
  job.status = "cancelled";
  job.updatedAt = Date.now();
  return true;
}

/**
 * Kick off the download in the background, updating the job's progress
 * fields as bytes arrive. Resolves once the download finishes (ok or not).
 */
export function startDownloadJob(
  job: DownloadJob,
): Promise<void> {
  return downloadUpdate(
    job.url,
    (pct, received, total) => {
      updateJob(job.id, {
        percent: pct,
        bytesReceived: received,
        bytesTotal: total,
      });
    },
  ).then((result) => {
    if (job.status === "cancelled") return;
    if (result.ok) {
      updateJob(job.id, {
        status: "done",
        percent: 100,
        bytesReceived: result.bytesReceived,
        bytesTotal: result.bytesTotal,
        resumed: result.resumed,
        path: result.path,
      });
    } else {
      updateJob(job.id, {
        status: "error",
        error: result.error ?? "Unknown download error",
        bytesReceived: result.bytesReceived,
        bytesTotal: result.bytesTotal,
        resumed: result.resumed,
      });
    }
  });
}
