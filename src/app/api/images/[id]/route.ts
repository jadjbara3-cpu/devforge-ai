import { NextResponse, type NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/images/[id]
 *
 * Deletes a generated image row from the database AND removes the file
 * from public/generated/. Missing files are ignored.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!id || typeof id !== "string") {
      return NextResponse.json(
        { error: "A valid image id is required." },
        { status: 400 },
      );
    }

    const row = await db.generatedImage.findUnique({ where: { id } });

    if (!row) {
      return NextResponse.json(
        { error: "Image not found." },
        { status: 404 },
      );
    }

    // 1. Delete the file from disk (ignore missing files).
    if (row.url?.startsWith("/generated/")) {
      const filename = path.basename(row.url);
      const filePath = path.join(
        process.cwd(),
        "public",
        "generated",
        filename,
      );
      try {
        await fs.unlink(filePath);
      } catch (unlinkErr) {
        // File may already be gone — log and continue.
        console.warn(
          `[images/[id]] file not deleted (likely missing): ${filePath}`,
          unlinkErr,
        );
      }
    }

    // 2. Delete the database row.
    await db.generatedImage.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[images/[id]] DELETE failed:", err);
    const message =
      err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
