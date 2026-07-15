import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { LoadingBarProvider } from "@/components/layout/loading-bar";
import { SettingsProvider } from "@/components/layout/settings";
import { LanguageProvider } from "@/components/language-provider";
import { ServiceWorkerRegistrar } from "@/components/pwa/register-sw";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DevForge AI — Full-Stack AI Developer Hub",
  description:
    "An integrated developer workspace combining LLM chat, vision analysis, image generation, voice synthesis, speech recognition, web intelligence, a code snippet vault, and a real-time collaborative task board. Crafted by Jad Jbara.",
  applicationName: "DevForge AI",
  creator: "Jad Jbara",
  publisher: "Jad Jbara",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "DevForge AI",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  keywords: [
    "DevForge",
    "AI",
    "Next.js",
    "TypeScript",
    "LLM",
    "VLM",
    "TTS",
    "ASR",
    "Developer Tools",
    "Jad Jbara",
    "jadjbara",
  ],
  authors: [{ name: "Jad Jbara", url: "mailto:jadjbara@live.com" }],
};

export const viewport: Viewport = {
  themeColor: "#e8770e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        {/* PWA — explicit tags (Next.js metadata export above also covers these) */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#e8770e" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <LanguageProvider>
            <LoadingBarProvider>
              <SettingsProvider>
                {children}
                <Toaster />
              </SettingsProvider>
            </LoadingBarProvider>
            <ServiceWorkerRegistrar />
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
