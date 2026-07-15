"use client";

// ============================================================================
//  <UpdateNotifier />  (components/layout/update-notifier.tsx)
// ----------------------------------------------------------------------------
//  A small, always-mounted client component that:
//    1. Checks for updates on app load (deferred 3s, non-blocking) and every
//       hour thereafter, IF auto-check is enabled in localStorage.
//    2. Shows a toast when an update is available (with a "View" action that
//       opens the update dialog).
//    3. Drives the full update flow inside a dialog:
//          Available  ->  Downloading (progress bar)  ->  Ready to install
//                       ->  Confirm restart  ->  Installer launched
//                       ->  "Restarting..." overlay
//    4. Exposes a tiny event-based API so the Settings panel can trigger a
//       manual check or open the dialog:
//         window.dispatchEvent(new CustomEvent("devforge-update-action",
//           { detail: { action: "check" | "open" | "dismiss" } }))
//    5. Broadcasts state changes so Settings can show "last checked" etc:
//         window.dispatchEvent(new CustomEvent("devforge-update-state",
//           { detail: { status, info, lastCheckedAt, prefs } }))
//
//  Network errors are swallowed silently (a console.warn at most) so the app
//  NEVER crashes or blocks because of the update check.
// ============================================================================

import * as React from "react";
import {
  DownloadCloud,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  X,
  ExternalLink,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { APP_NAME, APP_GITHUB } from "@/lib/branding";

// ---------------------------------------------------------------------------
//  Shared types & constants
// ---------------------------------------------------------------------------

/** Subset of lib/updater.ts UpdateInfo that the client needs. */
export interface UpdateInfoClient {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion?: string;
  downloadUrl?: string;
  releaseNotes?: string;
  releaseUrl?: string;
  publishedAt?: string;
  checkedAt: string;
  error?: string;
}

export interface UpdatePrefs {
  autoCheck: boolean;
  /** ISO timestamp of the last successful (or attempted) check. */
  lastCheckedAt: string | null;
  /** A version tag the user has explicitly dismissed ("Later"). */
  skippedVersion: string | null;
}

const PREFS_KEY = "devforge-update-prefs";
const DEFAULT_PREFS: UpdatePrefs = {
  autoCheck: true,
  lastCheckedAt: null,
  skippedVersion: null,
};

type Status =
  | "idle"
  | "checking"
  | "available"
  | "up-to-date"
  | "downloading"
  | "ready"
  | "installing"
  | "error";

interface PollingJob {
  id: string;
  status: "downloading" | "done" | "error" | "cancelled";
  percent: number;
  bytesReceived: number;
  bytesTotal: number;
  resumed: boolean;
  path?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
//  Prefs hook (shared with Settings)
// ---------------------------------------------------------------------------

function loadPrefs(): UpdatePrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<UpdatePrefs>;
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(prefs: UpdatePrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    window.dispatchEvent(
      new CustomEvent("devforge-update-prefs", { detail: prefs }),
    );
  } catch {
    /* localStorage may be unavailable (private mode) - swallow */
  }
}

/**
 * React hook giving any component read/write access to the update prefs.
 * Re-renders when prefs change (via the 'devforge-update-prefs' event).
 */
export function useUpdatePrefs(): {
  prefs: UpdatePrefs;
  update: (patch: Partial<UpdatePrefs>) => void;
} {
  const [prefs, setPrefs] = React.useState<UpdatePrefs>(DEFAULT_PREFS);

  React.useEffect(() => {
    setPrefs(loadPrefs());
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<UpdatePrefs>).detail;
      if (detail) setPrefs(detail);
      else setPrefs(loadPrefs());
    };
    window.addEventListener("devforge-update-prefs", handler);
    window.addEventListener("storage", handler as EventListener);
    return () => {
      window.removeEventListener("devforge-update-prefs", handler);
      window.removeEventListener("storage", handler as EventListener);
    };
  }, []);

  const update = React.useCallback((patch: Partial<UpdatePrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);

  return { prefs, update };
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function formatBytes(n: number): string {
  if (!n || n < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Never";
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const days = Math.floor(hr / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

// ---------------------------------------------------------------------------
//  Main component
// ---------------------------------------------------------------------------

export function UpdateNotifier() {
  const { toast } = useToast();
  const { prefs } = useUpdatePrefs();

  const [status, setStatus] = React.useState<Status>("idle");
  const [info, setInfo] = React.useState<UpdateInfoClient | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [bytesReceived, setBytesReceived] = React.useState(0);
  const [bytesTotal, setBytesTotal] = React.useState(0);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [installMsg, setInstallMsg] = React.useState<string | null>(null);

  // Refs so async loops can read the latest values without re-creating.
  const pollingRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const jobIdRef = React.useRef<string | null>(null);

  // --------------------------------------------------------------
  //  check() - call the API and update state
  // --------------------------------------------------------------
  const check = React.useCallback(
    async (opts?: { silent?: boolean }): Promise<UpdateInfoClient | null> => {
      const silent = opts?.silent ?? false;
      if (!silent) setStatus("checking");
      try {
        const res = await fetch("/api/update/check", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as UpdateInfoClient;
        setInfo(data);
        // Persist last-checked timestamp.
        try {
          const raw = localStorage.getItem(PREFS_KEY);
          const current = raw
            ? ({ ...DEFAULT_PREFS, ...JSON.parse(raw) } as UpdatePrefs)
            : DEFAULT_PREFS;
          const next: UpdatePrefs = {
            ...current,
            lastCheckedAt: new Date().toISOString(),
          };
          localStorage.setItem(PREFS_KEY, JSON.stringify(next));
          window.dispatchEvent(
            new CustomEvent("devforge-update-prefs", { detail: next }),
          );
        } catch {
          /* ignore */
        }

        if (data.updateAvailable) {
          // Skip the toast (auto background checks only) if the user
          // explicitly dismissed this exact version. Manual checks from
          // Settings still surface the update so the user can change their
          // mind.
          if (silent && prefs.skippedVersion === data.latestVersion) {
            setStatus("idle");
            return data;
          }
          setStatus("available");
          if (!silent) {
            // Manual check from Settings: open the dialog directly.
            setDialogOpen(true);
            toast({
              title: `${APP_NAME} ${data.latestVersion} is available`,
              description: "Click to view release notes and update.",
              duration: 15000,
              action: (
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => setDialogOpen(true)}
                >
                  View
                </Button>
              ),
            });
          }
        } else if (!silent) {
          setStatus("up-to-date");
          toast({
            title: "You're up to date",
            description: `${APP_NAME} ${data.currentVersion} is the latest version.`,
          });
        } else {
          setStatus("idle");
        }
        return data;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error";
        if (!silent) {
          setStatus("error");
          setErrorMsg(message);
          setDialogOpen(true);
          toast({
            title: "Couldn't check for updates",
            description: message,
            variant: "destructive",
          });
        } else {
          // Silent background check failure - don't bother the user.
          // eslint-disable-next-line no-console
          console.warn("[DevForge] update check failed:", message);
        }
        return null;
      }
    },
    [prefs.skippedVersion, toast],
  );

  // --------------------------------------------------------------
  //  Auto-check on mount + hourly interval
  // --------------------------------------------------------------
  React.useEffect(() => {
    // Defer the initial check by 4s so it never blocks app startup.
    const t = setTimeout(() => {
      if (prefs.autoCheck) void check({ silent: true });
    }, 4000);
    return () => clearTimeout(t);
    // Only run once on mount; prefs.autoCheck is read at check time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!prefs.autoCheck) return;
    const interval = setInterval(() => {
      void check({ silent: true });
    }, 60 * 60 * 1000); // 1 hour
    return () => clearInterval(interval);
  }, [prefs.autoCheck, check]);

  // --------------------------------------------------------------
  //  Event API: let Settings (or anyone) trigger actions
  // --------------------------------------------------------------
  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ action: string }>).detail;
      if (!detail) return;
      switch (detail.action) {
        case "check":
          void check({ silent: false });
          break;
        case "open":
          setDialogOpen(true);
          break;
        case "dismiss":
          if (info?.latestVersion) {
            try {
              const raw = localStorage.getItem(PREFS_KEY);
              const current = raw
                ? ({ ...DEFAULT_PREFS, ...JSON.parse(raw) } as UpdatePrefs)
                : DEFAULT_PREFS;
              const next: UpdatePrefs = {
                ...current,
                skippedVersion: info.latestVersion,
              };
              localStorage.setItem(PREFS_KEY, JSON.stringify(next));
              window.dispatchEvent(
                new CustomEvent("devforge-update-prefs", { detail: next }),
              );
            } catch {
              /* ignore */
            }
          }
          setDialogOpen(false);
          setStatus("idle");
          break;
      }
    };
    window.addEventListener("devforge-update-action", handler);
    return () => window.removeEventListener("devforge-update-action", handler);
  }, [check, info?.latestVersion]);

  // Broadcast state to any listeners (Settings panel).
  React.useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("devforge-update-state", {
        detail: {
          status,
          info,
          lastCheckedAt: prefs.lastCheckedAt,
        },
      }),
    );
  }, [status, info, prefs.lastCheckedAt]);

  // --------------------------------------------------------------
  //  Download flow
  // --------------------------------------------------------------
  const stopPolling = React.useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const startDownload = React.useCallback(async () => {
    if (!info?.downloadUrl) {
      setErrorMsg("No download URL available for this release.");
      setStatus("error");
      return;
    }
    setStatus("downloading");
    setProgress(0);
    setBytesReceived(0);
    setBytesTotal(0);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/update/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: info.downloadUrl, fresh: false }),
      });
      if (!res.ok && res.status !== 202) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const job = (await res.json()) as PollingJob;
      jobIdRef.current = job.id;

      stopPolling();
      pollingRef.current = setInterval(async () => {
        const id = jobIdRef.current;
        if (!id) return;
        try {
          const r = await fetch(`/api/update/download?jobId=${id}`, {
            cache: "no-store",
          });
          if (!r.ok) {
            stopPolling();
            setErrorMsg(`Polling failed (HTTP ${r.status}).`);
            setStatus("error");
            return;
          }
          const j = (await r.json()) as PollingJob;
          setProgress(j.percent);
          setBytesReceived(j.bytesReceived);
          setBytesTotal(j.bytesTotal);

          if (j.status === "done") {
            stopPolling();
            setStatus("ready");
          } else if (j.status === "error") {
            stopPolling();
            setErrorMsg(j.error || "Download failed.");
            setStatus("error");
          } else if (j.status === "cancelled") {
            stopPolling();
            setStatus("idle");
          }
        } catch {
          /* keep polling - transient fetch errors are OK */
        }
      }, 800);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start download.";
      setErrorMsg(message);
      setStatus("error");
    }
  }, [info?.downloadUrl, stopPolling]);

  const cancelDownload = React.useCallback(async () => {
    const id = jobIdRef.current;
    stopPolling();
    if (id) {
      try {
        await fetch(`/api/update/download?jobId=${id}`, { method: "DELETE" });
      } catch {
        /* best-effort */
      }
    }
    jobIdRef.current = null;
    setStatus("available");
    setProgress(0);
  }, [stopPolling]);

  // --------------------------------------------------------------
  //  Install flow
  // --------------------------------------------------------------
  const install = React.useCallback(async () => {
    setStatus("installing");
    setErrorMsg(null);
    setInstallMsg(null);
    try {
      const res = await fetch("/api/update/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: jobIdRef.current }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
        restartInSeconds?: number;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setInstallMsg(
        data.message ||
          "Installer launched. The app will close and restart shortly.",
      );
      // The installer will taskkill bun.exe within a few seconds. Show a
      // friendly countdown; if for some reason the server is still up
      // after 20s, suggest a manual restart.
      // (No timer needed - the browser window will lose connection.)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to launch installer.";
      setErrorMsg(message);
      setStatus("error");
    }
  }, []);

  // --------------------------------------------------------------
  //  Cleanup on unmount
  // --------------------------------------------------------------
  React.useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  // --------------------------------------------------------------
  //  Render
  // --------------------------------------------------------------
  // `dialogOpen` is the single source of truth for dialog visibility.
  // Status transitions that should surface the dialog call setDialogOpen(true)
  // explicitly; user dismissals call setDialogOpen(false). The onOpenChange
  // handler blocks closing while the installer is running.
  const currentVersion = info?.currentVersion ?? "—";
  const latestVersion = info?.latestVersion ?? "—";

  return (
    <Dialog open={dialogOpen} onOpenChange={(o) => {
      // Block closing while the installer is running.
      if (!o && status === "installing") return;
      setDialogOpen(o);
    }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DownloadCloud className="h-4 w-4 text-primary" />
            {status === "installing"
              ? "Restarting DevForge AI"
              : status === "ready"
                ? "Ready to Install"
                : status === "downloading"
                  ? "Downloading Update"
                  : status === "error"
                    ? "Update Error"
                    : "Update Available"}
          </DialogTitle>
          <DialogDescription>
            {status === "installing"
              ? "Please keep this window open while the installer works."
              : status === "downloading"
                ? "Downloading the new setup.exe. You can continue using the app."
                : status === "ready"
                  ? "The new installer has been downloaded. Click Install to continue."
                  : status === "error"
                    ? "Something went wrong during the update process."
                    : "A new version of DevForge AI is available."}
          </DialogDescription>
        </DialogHeader>

        {/* Version comparison */}
        <div className="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 px-3 py-2">
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Current
            </div>
            <div className="font-mono text-sm font-medium">{currentVersion}</div>
          </div>
          <div className="text-muted-foreground">
            <RefreshCw className="h-4 w-4" />
          </div>
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Latest
            </div>
            <div className="font-mono text-sm font-medium text-primary">
              {latestVersion}
            </div>
          </div>
        </div>

        {/* Release notes */}
        {info?.releaseNotes && status !== "installing" && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <ExternalLink className="h-3 w-3" />
              Release Notes
            </div>
            <div className="max-h-40 overflow-y-auto scrollbar-thin rounded-md border border-border/40 bg-background/50 p-2.5">
              <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-muted-foreground">
                {info.releaseNotes}
              </pre>
            </div>
            {info.releaseUrl && (
              <a
                href={info.releaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                View full release on GitHub
              </a>
            )}
          </div>
        )}

        {/* Download progress */}
        {status === "downloading" && (
          <div className="space-y-2">
            <Progress value={progress} className="h-2" />
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                {progress}%
              </span>
              <span className="font-mono">
                {formatBytes(bytesReceived)} /{" "}
                {bytesTotal > 0 ? formatBytes(bytesTotal) : "…"}
              </span>
            </div>
          </div>
        )}

        {/* Ready to install */}
        {status === "ready" && (
          <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            <div className="leading-relaxed">
              <p className="font-medium text-foreground">Download complete</p>
              <p className="text-muted-foreground">
                Clicking <strong>Install &amp; Restart</strong> will close the
                app, replace it with the new version, and relaunch it. Make
                sure you&apos;ve saved your work.
              </p>
            </div>
          </div>
        )}

        {/* Installing */}
        {status === "installing" && (
          <div className="space-y-3 py-2">
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
            <p className="text-center text-xs text-muted-foreground">
              {installMsg ||
                "The installer is running. This window will close when the app restarts."}
            </p>
            <p className="text-center text-[10px] text-muted-foreground">
              If this window stays open for more than 30 seconds, please close
              and relaunch DevForge AI manually from the Start Menu.
            </p>
          </div>
        )}

        {/* Error */}
        {status === "error" && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="leading-relaxed">
              <p className="font-medium text-foreground">Update failed</p>
              <p className="text-muted-foreground">
                {errorMsg || "An unknown error occurred."}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                You can retry, or download the installer manually from{" "}
                <a
                  href={APP_GITHUB + "/releases"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  GitHub
                </a>
                .
              </p>
            </div>
          </div>
        )}

        {/* Footer actions */}
        {status !== "installing" && (
          <DialogFooter className="gap-2">
            {status === "available" && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    try {
                      if (info?.latestVersion) {
                        const raw = localStorage.getItem(PREFS_KEY);
                        const current = raw
                          ? ({ ...DEFAULT_PREFS, ...JSON.parse(raw) } as UpdatePrefs)
                          : DEFAULT_PREFS;
                        const next: UpdatePrefs = {
                          ...current,
                          skippedVersion: info.latestVersion,
                        };
                        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
                        window.dispatchEvent(
                          new CustomEvent("devforge-update-prefs", {
                            detail: next,
                          }),
                        );
                      }
                    } catch {
                      /* ignore */
                    }
                    setDialogOpen(false);
                    setStatus("idle");
                  }}
                >
                  Skip this version
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDialogOpen(false)}
                >
                  Later
                </Button>
                <Button size="sm" onClick={startDownload}>
                  <DownloadCloud className="mr-1 h-4 w-4" />
                  Download &amp; Install
                </Button>
              </>
            )}

            {status === "downloading" && (
              <>
                <Button variant="ghost" size="sm" onClick={cancelDownload}>
                  Cancel
                </Button>
                <Badge variant="secondary" className="font-mono">
                  {progress}%
                </Badge>
              </>
            )}

            {status === "ready" && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStatus("available")}
                >
                  Back
                </Button>
                <Button size="sm" onClick={install}>
                  Install &amp; Restart
                </Button>
              </>
            )}

            {status === "error" && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDialogOpen(false)}
                >
                  Close
                </Button>
                <Button size="sm" onClick={() => void check({ silent: false })}>
                  <RefreshCw className="mr-1 h-4 w-4" />
                  Retry check
                </Button>
                {info?.downloadUrl && (
                  <Button size="sm" onClick={startDownload}>
                    Retry download
                  </Button>
                )}
              </>
            )}

            {status === "up-to-date" && (
              <Button size="sm" onClick={() => setDialogOpen(false)}>
                <X className="mr-1 h-4 w-4" />
                Close
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
//  Convenience helpers for other components (Settings panel)
// ---------------------------------------------------------------------------

/** Trigger an update check from anywhere (e.g. Settings "Check now" button). */
export function triggerUpdateCheck(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("devforge-update-action", { detail: { action: "check" } }),
  );
}

/** Open the update dialog from anywhere. */
export function triggerUpdateDialog(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("devforge-update-action", { detail: { action: "open" } }),
  );
}

/** Format helper exposed for the Settings panel. */
export { formatRelativeTime as formatLastChecked };
