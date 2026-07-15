/**
 * Workflow Engine — recording + playback logic for the AI Workflow Recorder.
 *
 * Recording model:
 *   - The recorder attaches document-level event listeners (click, input,
 *     scroll, navigation) and accumulates WorkflowStep drafts in memory.
 *   - Each step gets a best-effort CSS selector for the target element, the
 *     typed text or scroll position, and a human-friendly description.
 *   - When the user stops recording, the steps are POSTed to /api/workflow
 *     along with a name → saved as a Workflow + WorkflowStep rows.
 *
 * Playback model:
 *   - For each step, we wait `durationMs`, then resolve the CSS selector and
 *     dispatch the appropriate event (click / focus+input / scrollTo).
 *   - If a selector can't be found, the step is skipped (with a warning).
 *
 * "AI Play" model:
 *   - For each step we ask the LLM to interpret it semantically: "what was
 *     the user trying to do here?" — e.g. "click the Send button", "type
 *     'hello world' into the chat input". The AI returns a normalized
 *     description; we then use that description to find the right element
 *     by aria-label / text content / role, so the replay survives UI
 *     changes (renamed classes, re-ordered DOM).
 *
 * NOTE: This module is CLIENT-ONLY. It attaches to `document` directly and
 * must not be imported from a Server Component.
 */

"use client";

import * as React from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StepType =
  | "click"
  | "type"
  | "scroll"
  | "navigate"
  | "paste"
  | "custom";

export interface WorkflowStepDraft {
  index: number;
  type: StepType;
  selector?: string;
  text?: string;
  value?: string;
  description: string;
  durationMs: number;
}

export interface WorkflowStep extends WorkflowStepDraft {
  id: string;
  workflowId: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  tags: string | null;
  steps: WorkflowStep[];
  runCount: number;
  lastRunAt: string | null;
  schedule: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Selector builder — best-effort unique CSS selector for an element.
// ---------------------------------------------------------------------------

export function buildSelector(el: Element): string {
  if (el.id) return `#${CSS.escape(el.id)}`;

  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node.nodeType === 1) {
    const current: Element = node;
    let part: string = current.tagName.toLowerCase();
    if (current.id) {
      parts.unshift(`#${CSS.escape(current.id)}`);
      break;
    }
    const parent: Element | null = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (c: Element) => c.tagName === current.tagName,
      );
      if (siblings.length > 1) {
        const idx = siblings.indexOf(current) + 1;
        part += `:nth-of-type(${idx})`;
      }
    }
    parts.unshift(part);
    node = parent;
    if (parts.length > 8) break; // depth cap
  }
  return parts.join(" > ");
}

/** Human-friendly description of an element. */
export function describeElement(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const text = (el.textContent || "").trim().slice(0, 40);
  const ariaLabel = el.getAttribute("aria-label");
  const role = el.getAttribute("role");
  const type = el.getAttribute("type");
  const name = el.getAttribute("name");
  const placeholder = el.getAttribute("placeholder");

  if (ariaLabel) return `${tag}[aria-label="${ariaLabel}"]`;
  if (role) return `${tag}[role=${role}]`;
  if (tag === "input" && type) return `input[type=${type}]${name ? ` (${name})` : ""}`;
  if (tag === "input" && placeholder) return `input[placeholder="${placeholder}"]`;
  if (tag === "button" && text) return `button "${text}"`;
  if (tag === "a" && text) return `link "${text}"`;
  if (text) return `${tag} "${text}"`;
  return tag;
}

// ---------------------------------------------------------------------------
// Recorder
// ---------------------------------------------------------------------------

export interface RecorderOptions {
  onStep?: (step: WorkflowStepDraft) => void;
  /** Ignore elements inside these CSS selectors (e.g. the recorder UI itself). */
  ignoreSelector?: string;
}

export class WorkflowRecorder {
  private steps: WorkflowStepDraft[] = [];
  private startTime = 0;
  private lastStepTime = 0;
  private listeners: Array<() => void> = [];
  private active = false;
  private opts: RecorderOptions;
  private clickHandler?: (e: MouseEvent) => void;
  private inputHandler?: (e: Event) => void;
  private scrollHandler?: (e: Event) => void;

  constructor(opts: RecorderOptions = {}) {
    this.opts = opts;
  }

  isActive() {
    return this.active;
  }

  getSteps() {
    return [...this.steps];
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.steps = [];
    this.startTime = Date.now();
    this.lastStepTime = this.startTime;

    this.clickHandler = (e: MouseEvent) => this.handleClick(e);
    this.inputHandler = (e: Event) => this.handleInput(e);
    this.scrollHandler = (e: Event) => this.handleScroll(e);

    document.addEventListener("click", this.clickHandler, true);
    document.addEventListener("input", this.inputHandler, true);
    window.addEventListener("scroll", this.scrollHandler, true);
  }

  stop(): WorkflowStepDraft[] {
    if (!this.active) return [];
    this.active = false;
    if (this.clickHandler)
      document.removeEventListener("click", this.clickHandler, true);
    if (this.inputHandler)
      document.removeEventListener("input", this.inputHandler, true);
    if (this.scrollHandler)
      window.removeEventListener("scroll", this.scrollHandler, true);
    return [...this.steps];
  }

  private pushStep(step: Omit<WorkflowStepDraft, "index" | "durationMs">) {
    const now = Date.now();
    const durationMs = Math.max(0, now - this.lastStepTime);
    this.lastStepTime = now;
    const draft: WorkflowStepDraft = {
      ...step,
      index: this.steps.length,
      durationMs,
    };
    this.steps.push(draft);
    this.opts.onStep?.(draft);
    this.notify();
  }

  private shouldIgnore(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return true;
    if (this.opts.ignoreSelector && target.closest(this.opts.ignoreSelector)) {
      return true;
    }
    return false;
  }

  private handleClick(e: MouseEvent) {
    const target = e.target;
    if (this.shouldIgnore(target)) return;
    if (!(target instanceof Element)) return;
    const selector = buildSelector(target);
    this.pushStep({
      type: "click",
      selector,
      description: `Click ${describeElement(target)}`,
    });
  }

  private handleInput(e: Event) {
    const target = e.target;
    if (this.shouldIgnore(target)) return;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
      return;
    }
    const value = target.value;
    this.pushStep({
      type: "type",
      selector: buildSelector(target),
      text: value,
      description: `Type into ${describeElement(target)}`,
    });
  }

  private handleScroll(_e: Event) {
    const y = window.scrollY;
    this.pushStep({
      type: "scroll",
      value: String(y),
      description: `Scroll to ${y}px`,
    });
  }

  private notify() {
    for (const l of this.listeners) {
      try {
        l();
      } catch {
        /* ignore */
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Player — replays a workflow's steps.
// ---------------------------------------------------------------------------

export interface PlaybackEvent {
  type: "start" | "step" | "skip" | "done" | "error";
  index?: number;
  total?: number;
  description?: string;
  error?: string;
}

export interface PlayerOptions {
  onEvent?: (e: PlaybackEvent) => void;
  /** Speed multiplier — 1 = real-time, 2 = 2x faster. */
  speed?: number;
}

export class WorkflowPlayer {
  private cancelled = false;
  private opts: PlayerOptions;

  constructor(opts: PlayerOptions = {}) {
    this.opts = opts;
  }

  cancel() {
    this.cancelled = true;
  }

  async play(steps: WorkflowStep[]): Promise<void> {
    this.cancelled = false;
    const total = steps.length;
    this.emit({ type: "start", total });

    for (const step of steps) {
      if (this.cancelled) {
        this.emit({ type: "done", total });
        return;
      }
      const delay = Math.max(50, (step.durationMs || 200) / (this.opts.speed ?? 1));
      await sleep(delay);
      if (this.cancelled) {
        this.emit({ type: "done", total });
        return;
      }

      try {
        const ok = await this.executeStep(step);
        if (ok) {
          this.emit({
            type: "step",
            index: step.index,
            total,
            description: step.description,
          });
        } else {
          this.emit({
            type: "skip",
            index: step.index,
            total,
            description: step.description,
          });
        }
      } catch (err) {
        this.emit({
          type: "error",
          index: step.index,
          total,
          error: err instanceof Error ? err.message : "Step failed",
        });
      }
    }
    this.emit({ type: "done", total });
  }

  private async executeStep(step: WorkflowStep): Promise<boolean> {
    switch (step.type) {
      case "click": {
        if (!step.selector) return false;
        const el = document.querySelector(step.selector);
        if (!el) return false;
        (el as HTMLElement).click();
        return true;
      }
      case "type":
      case "paste": {
        if (!step.selector) return false;
        const el = document.querySelector(step.selector);
        if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
          return false;
        }
        el.focus();
        el.value = step.text || "";
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
      case "scroll": {
        const y = parseInt(step.value || "0", 10);
        window.scrollTo({ top: y, behavior: "smooth" });
        return true;
      }
      case "navigate": {
        if (step.value) window.location.href = step.value;
        return true;
      }
      case "custom":
      default:
        return false;
    }
  }

  private emit(e: PlaybackEvent) {
    this.opts.onEvent?.(e);
  }
}

// ---------------------------------------------------------------------------
// React hook: useWorkflowRecorder
// ---------------------------------------------------------------------------

export function useWorkflowRecorder(opts: RecorderOptions = {}) {
  const recorderRef = React.useRef<WorkflowRecorder | null>(null);
  const [active, setActive] = React.useState(false);
  const [steps, setSteps] = React.useState<WorkflowStepDraft[]>([]);

  const start = React.useCallback(() => {
    if (!recorderRef.current) {
      recorderRef.current = new WorkflowRecorder({
        ...opts,
        onStep: (s) => setSteps((prev) => [...prev, s]),
      });
    }
    recorderRef.current.start();
    setSteps([]);
    setActive(true);
  }, [opts]);

  const stop = React.useCallback((): WorkflowStepDraft[] => {
    const rec = recorderRef.current;
    if (!rec) return [];
    const all = rec.stop();
    setSteps(all);
    setActive(false);
    return all;
  }, []);

  const cancel = React.useCallback(() => {
    const rec = recorderRef.current;
    if (!rec) return;
    rec.stop();
    setSteps([]);
    setActive(false);
  }, []);

  return { active, steps, start, stop, cancel };
}

// ---------------------------------------------------------------------------
// React hook: useWorkflowPlayer
// ---------------------------------------------------------------------------

export function useWorkflowPlayer() {
  const playerRef = React.useRef<WorkflowPlayer | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [progress, setProgress] = React.useState<{ index: number; total: number } | null>(null);
  const [lastEvent, setLastEvent] = React.useState<PlaybackEvent | null>(null);

  const play = React.useCallback(
    async (steps: WorkflowStep[], speed = 1) => {
      setPlaying(true);
      setProgress({ index: 0, total: steps.length });
      playerRef.current = new WorkflowPlayer({
        speed,
        onEvent: (e) => {
          setLastEvent(e);
          if (e.type === "step" && e.index !== undefined && e.total !== undefined) {
            setProgress({ index: e.index + 1, total: e.total });
          }
          if (e.type === "done") {
            setPlaying(false);
            setProgress(null);
          }
        },
      });
      await playerRef.current.play(steps);
    },
    [],
  );

  const cancel = React.useCallback(() => {
    playerRef.current?.cancel();
    setPlaying(false);
    setProgress(null);
  }, []);

  return { playing, progress, lastEvent, play, cancel };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
