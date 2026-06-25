import { Link } from "@tanstack/react-router";
import { Flame } from "lucide-react";
import type { ReactNode } from "react";

const NAV = [
  { to: "/", label: "Dashboard" },
  { to: "/signals", label: "Signals" },
  { to: "/events", label: "Events" },
  { to: "/stocks", label: "Universe" },
  { to: "/methodology", label: "Methodology" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary signal-glow">
              <Flame className="h-4 w-4" strokeWidth={2.5} />
            </span>
            <span className="flex flex-col leading-none">
              <span className="font-display text-sm font-bold tracking-tight text-foreground">
                BIST Signal Lab
              </span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Research Mode
              </span>
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === "/" }}
                activeProps={{ className: "bg-secondary text-foreground" }}
                inactiveProps={{
                  className: "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                }}
                className="rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">Research only — not investment advice.</span>{" "}
            This lab does not generate buy or sell signals. It collects daily snapshots, flags large
            moves as events, and measures which conditions recurred before those moves. Sample data
            is synthetic for demonstration; connect a live BIST feed to study real patterns.
          </p>
        </div>
      </footer>
    </div>
  );
}
