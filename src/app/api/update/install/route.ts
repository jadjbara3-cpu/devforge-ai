// ============================================================================
//  POST /api/update/install
// ----------------------------------------------------------------------------
//  Launches the downloaded setup.exe silently. The Next.js server returns
//  immediately after spawning; the installer (running detached) will then:
//
//    1. taskkill bun.exe (via Inno Setup [Code].PrepareToInstall)
//    2. overwrite the app files
//    3. run the "launchnow" task -> wscript.exe start-devforge.vbs
//       -> a fresh server + browser window opens
//
//  The current server process dies at step 1, so the client must show a
//  "Restarting..." state and rely on the new server coming back up.
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { installUpdate, getJob, DOWNLOAD_TARGET } from "@/lib/updater";
import { existsSync } from "node:fs";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface InstallBody {
  /** Optional explicit path; defaults to the standard download target. */
  path?: unknown;
  /** Optional job ID - if provided, we read the path from the finished job. */
  jobId?: unknown;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as InstallBody | null;

  // Resolve the installer path: explicit > job.path > default target.
  let installerPath = DOWNLOAD_TARGET;

  if (typeof body?.path === "string" && body.path) {
    installerPath = body.path;
  } else if (typeof body?.jobId === "string" && body.jobId) {
    const job = getJob(body.jobId);
    if (job?.path) installerPath = job.path;
  }

  if (!existsSync(installerPath)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Installer file not found. Run the download step first, or pass an explicit path.",
        path: installerPath,
      },
      { status: 404 },
    );
  }

  const result = await installUpdate(installerPath);

  if (!result.ok) {
    return NextResponse.json(result, { status: 500 });
  }

  // Tell the client to begin its "restarting" countdown. The actual
  // termination is asynchronous - the installer takes a few seconds to
  // spin up before it taskkills bun.exe.
  return NextResponse.json({
    ...result,
    message:
      "Installer launched. The app will close and restart automatically in a few seconds.",
    restartInSeconds: 3,
  });
}
