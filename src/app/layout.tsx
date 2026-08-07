import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Underwriting Copilot",
  description:
    "Multi-agent customer data analysis, risk assessment, and policy recommendation for personal-lines underwriting.",
};

const NAV = [
  { href: "/", label: "Submissions" },
  { href: "/agents", label: "Agents" },
  { href: "/metrics", label: "Metrics" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header
          className="sticky top-0 z-20 border-b backdrop-blur"
          style={{ background: "color-mix(in srgb, var(--surface-1) 88%, transparent)" }}
        >
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
            <Link href="/" className="flex items-center gap-2.5">
              <span
                className="grid h-7 w-7 place-items-center rounded-md text-[13px] font-bold text-white"
                style={{ background: "var(--series-1)" }}
                aria-hidden
              >
                UC
              </span>
              <span className="text-[15px] font-semibold tracking-tight">
                Underwriting Copilot
              </span>
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-2.5 py-1.5 ink-secondary hover:bg-[var(--surface-3)]"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-5 py-7">{children}</main>
      </body>
    </html>
  );
}
