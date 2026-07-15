import { NextResponse, type NextRequest } from "next/server";

import {
  getEncryptionStats,
  reencryptPlaintextKeys,
} from "@/lib/ai-providers";

export const dynamic = "force-dynamic";

/**
 * GET /api/provider/verify-encryption
 *
 * Admin diagnostic — reports how many stored API keys are already encrypted
 * (AES-256-GCM, `enc:` prefix) vs. how many are still legacy plaintext.
 *
 * Response:
 *   {
 *     encrypted_count: number,   // total across chat + specialty tables
 *     plaintext_count: number,
 *     total: number,
 *     chat:      { encrypted, plaintext },
 *     specialty: { encrypted, plaintext }
 *   }
 *
 * SECURITY: This route never returns key material — only counts. Safe to
 * expose to the local admin UI. Add auth if the app ever ships multi-user.
 */
export async function GET() {
  try {
    const stats = await getEncryptionStats();
    return NextResponse.json({
      encrypted_count: stats.encrypted_count,
      plaintext_count: stats.plaintext_count,
      total: stats.total,
      chat: {
        encrypted: stats.encryptedChat,
        plaintext: stats.plaintextChat,
      },
      specialty: {
        encrypted: stats.encryptedSpecialty,
        plaintext: stats.plaintextSpecialty,
      },
    });
  } catch (err) {
    console.error("[verify-encryption] GET failed:", err);
    const message =
      err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/provider/verify-encryption
 *
 * Admin maintenance — scans both ProviderConfig and SpecialtyServiceConfig
 * and re-encrypts any plaintext keys found (idempotent: already-encrypted
 * keys are skipped). Used by the "Encrypt now" button in the encryption
 * diagnostics UI, or as a one-shot migration after rolling out encryption.
 *
 * Optional body: `{ confirm?: boolean }` — advisory ack flag.
 *
 * Response:
 *   {
 *     ok: true,
 *     reencrypted: number,         // keys migrated plaintext → encrypted
 *     alreadyEncrypted: number,    // keys already encrypted (no-op)
 *     failed: number,              // keys that failed (see failedSlots)
 *     failedSlots: string[]
 *   }
 */
export async function POST(_req: NextRequest) {
  try {
    const result = await reencryptPlaintextKeys();
    return NextResponse.json({
      ok: true,
      reencrypted: result.reencrypted,
      alreadyEncrypted: result.alreadyEncrypted,
      failed: result.failed,
      failedSlots: result.failedSlots,
    });
  } catch (err) {
    console.error("[verify-encryption] POST failed:", err);
    const message =
      err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
