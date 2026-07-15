import { NextRequest, NextResponse } from "next/server";

import { runPowerShellJson, psVars, WindowsNotAvailableError, PS_WIN32_ADD_TYPE } from "@/lib/computer-use/powershell";
import {
  buildHotkeyString,
  escapeSendKeysText,
  sanitiseKeyName,
} from "@/lib/computer-use/security";
import type { KeyboardRequest, KeyboardActionType } from "@/lib/computer-use/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const VALID_ACTIONS = new Set<KeyboardActionType>(["type", "press", "hotkey", "key-down", "key-up"]);

/**
 * POST /api/computer/keyboard
 *
 * Body: KeyboardRequest
 *   { action: "type"|"press"|"hotkey"|"key-down"|"key-up",
 *     text?, key?, keys[], interval? }
 *
 * For "type":    text = literal string to type.
 * For "press":   key  = single key name (e.g. "enter").
 * For "hotkey":  keys = ["ctrl","c"] etc.
 * For "key-down"/"key-up": key = single key name.
 */
export async function POST(req: NextRequest) {
  let body: KeyboardRequest;
  try {
    body = (await req.json()) as KeyboardRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body.", code: "BAD_BODY" }, { status: 400 });
  }

  if (!body || typeof body.action !== "string" || !VALID_ACTIONS.has(body.action as KeyboardActionType)) {
    return NextResponse.json(
      { error: `Invalid action. Must be one of: ${[...VALID_ACTIONS].join(", ")}` },
      { status: 400 },
    );
  }

  // Validate per-action fields + build the SendKeys string.
  let sendKeysStr: string;
  try {
    switch (body.action) {
      case "type":
        if (typeof body.text !== "string") {
          return NextResponse.json({ error: "type requires string text." }, { status: 400 });
        }
        if (body.text.length > 10_000) {
          return NextResponse.json({ error: "text exceeds 10,000 char limit." }, { status: 400 });
        }
        sendKeysStr = escapeSendKeysText(body.text);
        break;
      case "press":
        if (typeof body.key !== "string") {
          return NextResponse.json({ error: "press requires string key." }, { status: 400 });
        }
        sendKeysStr = sanitiseKeyName(body.key);
        break;
      case "hotkey":
        if (!Array.isArray(body.keys) || body.keys.length === 0) {
          return NextResponse.json({ error: "hotkey requires non-empty keys array." }, { status: 400 });
        }
        if (body.keys.length > 6) {
          return NextResponse.json({ error: "hotkey supports at most 6 keys." }, { status: 400 });
        }
        sendKeysStr = buildHotkeyString(body.keys);
        break;
      case "key-down":
      case "key-up":
        if (typeof body.key !== "string") {
          return NextResponse.json({ error: `${body.action} requires string key.` }, { status: 400 });
        }
        // key-down / key-up use the lower-level keybd_event API, not SendKeys.
        return await execKeybdEvent(body.key, body.action);
      default:
        return NextResponse.json({ error: "Unhandled action." }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid key specification." },
      { status: 400 },
    );
  }

  // Cap interval to a sane range (0-200 ms).
  const interval = Math.max(0, Math.min(200, body.interval ?? 0));
  const vars = psVars({ combo: sendKeysStr, interval });
  const script = `
Add-Type -AssemblyName System.Windows.Forms
${vars}
[System.Windows.Forms.SendKeys]::SendWait($combo)
@{ ok = $true; sent = $combo } | ConvertTo-Json -Compress
`;

  try {
    const startedAt = Date.now();
    await runPowerShellJson(script, { timeoutMs: 30_000 });
    return NextResponse.json({
      ok: true,
      action: body.action,
      sent: sendKeysStr,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    if (err instanceof WindowsNotAvailableError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 503 });
    }
    console.error("[api/computer/keyboard] error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Keyboard action failed.",
        code: "KEYBOARD_FAILED",
      },
      { status: 500 },
    );
  }
}

/**
 * Low-level key-down / key-up handler. We don't use SendKeys for these
 * because SendKeys always does a full press+release cycle. The agent uses
 * this for hold-and-release patterns (rare).
 */
async function execKeybdEvent(
  key: string,
  action: "key-down" | "key-up",
): Promise<Response> {
  // We only support a small set of well-known VK codes here.
  const vkMap: Record<string, number> = {
    ctrl: 0x11, control: 0x11, alt: 0x12, shift: 0x10, win: 0x5B,
    enter: 0x0d, return: 0x0d, tab: 0x09, escape: 0x1b, esc: 0x1b,
    space: 0x20, spacebar: 0x20, backspace: 0x08, delete: 0x2e, insert: 0x2d,
    up: 0x26, down: 0x28, left: 0x25, right: 0x27,
    home: 0x24, end: 0x23, pageup: 0x21, pagedown: 0x22,
    f1: 0x70, f2: 0x71, f3: 0x72, f4: 0x73, f5: 0x74, f6: 0x75,
    f7: 0x76, f8: 0x77, f9: 0x78, f10: 0x79, f11: 0x7a, f12: 0x7b,
    capslock: 0x14, numlock: 0x90,
  };
  const lower = key.toLowerCase().trim();
  let vk: number;
  if (vkMap[lower] !== undefined) {
    vk = vkMap[lower];
  } else if (/^[a-z0-9]$/.test(lower)) {
    vk = lower.charCodeAt(0);
  } else {
    return NextResponse.json(
      { error: `key-down/key-up only supports well-known keys, got: "${key}"` },
      { status: 400 },
    );
  }

  const flags = action === "key-up" ? 2 : 0;
  const vars = psVars({ vk, flags });
  const script = `
${PS_WIN32_ADD_TYPE}
${vars}
[Win32]::keybd_event($vk, 0, $flags, [UIntPtr]::Zero)
@{ ok = $true; vk = $vk; flags = $flags } | ConvertTo-Json -Compress
`;
  try {
    const startedAt = Date.now();
    await runPowerShellJson(script, { timeoutMs: 5_000 });
    return NextResponse.json({
      ok: true,
      action,
      vk,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    if (err instanceof WindowsNotAvailableError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 503 });
    }
    console.error("[api/computer/keyboard] keybd_event error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "keybd_event failed." },
      { status: 500 },
    );
  }
}
