import type { Metadata } from "next";
import { Inter, Geist_Mono, Playfair_Display } from "next/font/google";
import Link from "next/link";

import { AdminNavLink } from "@/components/AdminNavLink";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { NavAuth } from "@/components/NavAuth";
import { PrimaryNav } from "@/components/PrimaryNav";
import { LanguageProvider } from "@/lib/i18n";
import "./globals.css";

const geistSans = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const brandFont = Playfair_Display({
  subsets: ["latin", "cyrillic"],
  weight: ["700"],
});

export const metadata: Metadata = {
  title: "Qadam",
  description: "AI-платформа для планирования, обучения и выполнения целей",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <LanguageProvider>
          <div className="min-h-screen bg-zinc-950 md:flex">
            <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur md:hidden">
              <div className="flex items-center justify-between">
                <Link
                  className={`${brandFont.className} inline-block rounded-xl bg-emerald-50 px-4 py-2 text-4xl font-bold tracking-tight text-emerald-700 transition-all duration-150 hover:bg-emerald-100`}
                  href="/"
                >
                  Qadam
                </Link>
                <details className="group relative">
                  <summary className="cursor-pointer list-none rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100">
                    ☰
                  </summary>
                  <div className="absolute right-0 mt-2 w-72 rounded-xl border border-zinc-200 bg-white p-3 shadow-xl">
                    <div className="mb-2">
                      <NavAuth />
                    </div>
                    <PrimaryNav />
                    <div className="mt-2">
                      <AdminNavLink />
                    </div>
                  </div>
                </details>
              </div>
              <div className="mt-2 flex justify-end">
                <LanguageSwitcher />
              </div>
            </header>

            <aside className="hidden h-screen w-72 shrink-0 overflow-y-auto border-r border-zinc-200 bg-white px-4 py-5 md:sticky md:top-0 md:block">
              <div className="mb-5">
                <Link
                  className={`${brandFont.className} inline-block rounded-xl bg-emerald-50 px-4 py-2 text-4xl font-bold tracking-tight text-emerald-700 transition-all duration-150 hover:bg-emerald-100`}
                  href="/"
                >
                  Qadam
                </Link>
              </div>
              <div className="mb-4">
                <NavAuth />
              </div>
              <PrimaryNav />
              <div className="mt-3">
                <AdminNavLink />
              </div>
            </aside>
            <main className="min-w-0 flex-1 bg-zinc-50">
              <div className="hidden justify-end px-6 pt-3 md:flex">
                <LanguageSwitcher />
              </div>
              {children}
            </main>
          </div>
        </LanguageProvider>
      </body>
    </html>
  );
}
