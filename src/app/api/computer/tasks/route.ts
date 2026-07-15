import { NextRequest, NextResponse } from "next/server";

import { listRecentTasks } from "@/lib/computer-use/agent-loop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

/**
 * GET /api/computer/tasks?limit=20
 *
 * Returns recent ComputerTask rows for the UI's history sidebar.
 * Each row includes the step list as a JSON string (the UI parses it).
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const limit = sp.has("limit") ? parseInt(sp.get("limit")!, 10) : 20;
  const capped = Math.max(1, Math.min(100, Number.isFinite(limit) ? limit : 20));

  const tasks = await listRecentTasks(capped);
  return NextResponse.json({ tasks });
}
