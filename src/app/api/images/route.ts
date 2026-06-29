import { NextResponse } from "next/server";

import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/images
 *
 * Returns the last 24 generated images, newest first.
 * Shape: { images: { id, url, prompt, size, createdAt }[] }
 */
export async function GET() {
  try {
    const rows = await db.generatedImage.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 24,
      select: {
        id: true,
        url: true,
        prompt: true,
        size: true,
        createdAt: true,
      },
    });

    const images = rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    }));

    return NextResponse.json({ images });
  } catch (err) {
    console.error("[images] GET failed:", err);
    const message =
      err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
