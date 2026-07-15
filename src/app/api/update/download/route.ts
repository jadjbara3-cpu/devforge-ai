// ============================================================================
//  /api/update/download
// ----------------------------------------------------------------------------
//  Long-running download of the new setup.exe. Because a typical installer
//  is 100-200 MB and the app runs on localhost, we use a polling pattern
//  instead of holding a single request open:
//
//    POST /api/update/download   { url }  -> { jobId }           (starts job)
//    GET  /api/update/download?jobId=xxx  -> DownloadJob          (poll status)
//    DELETE /api/update/download?jobId=xxx -> { ok }              (cancel)
//
//  The actual download runs in the background (see startDownloadJob in
//  lib/updater.ts) and updates the job's progress fields as bytes arrive.
//  The UI polls GET every ~1s and renders a progress bar.
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import {
  createJob,
  getJob,
  startDownloadJob,
  cancelJob,
  clearDownloadCache,
  type DownloadJob,
} from "@/lib/updater";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ---------------------------------------------------------------------------
//  POST - start a new download
// ---------------------------------------------------------------------------

interface StartBody {
  url?: unknown;
  /** Optional: clear any cached partial file before starting. */
  fresh?: unknown;
}

function sanitizeJob(job: DownloadJob) {
  // Strip the URL from the polling response - the client already has it
  // and we don't need to echo it back every poll.
  return { ...job, url: undefined };
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as StartBody | null;
  const url = typeof body?.url === "string" ? body.url : "";

  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json(
      { error: "A valid 'url' string is required." },
      { status: 400 },
    );
  }

  // Optionally start fresh (ignore partial downloads from a previous attempt).
  if (body?.fresh === true) {
    await clearDownloadCache();
  }

  const job = createJob(url);

  // Kick off the background download - we do NOT await it here.
  void startDownloadJob(job);

  return NextResponse.json(sanitizeJob(job), { status: 202 });
}

// ---------------------------------------------------------------------------
//  GET - poll status
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json(
      { error: "Missing 'jobId' query parameter." },
      { status: 400 },
    );
  }

  const job = getJob(jobId);
  if (!job) {
    return NextResponse.json(
      { error: "Job not found (it may have expired after 30 min)." },
      { status: 404 },
    );
  }

  return NextResponse.json(sanitizeJob(job));
}

// ---------------------------------------------------------------------------
//  DELETE - cancel an in-progress download
// ---------------------------------------------------------------------------

export async function DELETE(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json(
      { error: "Missing 'jobId' query parameter." },
      { status: 400 },
    );
  }

  const ok = cancelJob(jobId);
  if (!ok) {
    return NextResponse.json(
      { error: "Job not found or already finished." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true });
}
