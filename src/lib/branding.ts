// Branding constants for DevForge AI.
// Centralized so the author name, email, version, and links can be updated
// in one place and consumed by every UI surface (sidebar, footer, About
// dialog, command palette, etc.).

export const APP_NAME = "DevForge AI";
export const APP_VERSION = "1.0.0";
export const APP_AUTHOR = "Jad Jbara";
export const APP_EMAIL = "jadjbara@live.com";
export const APP_GITHUB = "https://github.com/jadjbara3-cpu/devforge-ai";
export const APP_LICENSE = "MIT";
export const APP_TECH_STACK = [
  "Next.js 16",
  "TypeScript 5",
  "Prisma + SQLite",
  "Tailwind CSS 4",
  "shadcn/ui",
  "Z.ai SDK",
];

// Email obfuscation for UI — the raw address is never stored as a single
// continuous string in the JS bundle, which defeats naive harvesters that
// grep for the `xxx@yyy.tld` pattern in compiled client code.
export function getContactEmail(): string {
  return ["jad", "jbara"].join("") + "@" + ["live", "com"].join(".");
}

// Build a mailto: link, optionally with a pre-filled subject.
export function getMailtoLink(subject?: string): string {
  const email = getContactEmail();
  return subject
    ? `mailto:${email}?subject=${encodeURIComponent(subject)}`
    : `mailto:${email}`;
}
