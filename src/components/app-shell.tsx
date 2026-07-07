import { Link } from "@tanstack/react-router";
import { Flame, Menu } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const NAV = [
  { to: "/", label: "Ana Sayfa" },
  { to: "/firsatlar", label: "Fırsatlar" },
  { to: "/tahmin-takibi", label: "Tahmin Takibi" },
  { to: "/ai-patterns", label: "Yapay Zeka Analizi" },
  { to: "/signals", label: "En Güçlü Sinyaller" },
  { to: "/feature-importance", label: "Göstergeler" },
  { to: "/watchlist", label: "İzleme Listesi" },
  { to: "/backtest", label: "Geçmiş Performans" },
  { to: "/backtest-lab", label: "Backtest Motoru" },
  { to: "/oos", label: "Canlı Doğrulama" },
  { to: "/events", label: "Olaylar" },
  { to: "/stocks", label: "Evren" },
  { to: "/coverage", label: "Veri Kapsamı" },
  { to: "/methodology", label: "Yöntem" },
] as const;

function Brand({ onClick }: { onClick?: () => void }) {
  return (
    <Link to="/" onClick={onClick} className="flex min-w-0 items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary signal-glow">
        <Flame className="h-4 w-4" strokeWidth={2.5} />
      </span>
      <span className="flex min-w-0 flex-col leading-none">
        <span className="truncate font-display text-sm font-bold tracking-tight text-foreground">
          BIST Sinyal Lab
        </span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Araştırma Modu
        </span>
      </span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Brand />

          {/* Desktop: full horizontal nav */}
          <nav className="hidden items-center gap-1 lg:flex">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === "/" }}
                activeProps={{ className: "bg-secondary text-foreground" }}
                inactiveProps={{
                  className: "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                }}
                className="rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors xl:px-3 xl:text-sm"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Mobile / tablet: hamburger drawer */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Menüyü aç"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-secondary/40 text-foreground transition hover:bg-secondary lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[82vw] max-w-xs overflow-y-auto">
              <SheetHeader className="mb-4 text-left">
                <SheetTitle asChild>
                  <div>
                    <Brand onClick={() => setOpen(false)} />
                  </div>
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1">
                {NAV.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setOpen(false)}
                    activeOptions={{ exact: item.to === "/" }}
                    activeProps={{ className: "bg-secondary text-foreground" }}
                    inactiveProps={{
                      className: "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                    }}
                    className="rounded-md px-3 py-2.5 text-sm font-medium transition-colors"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">Yalnızca araştırma amaçlıdır — yatırım tavsiyesi değildir.</span>{" "}
            Bu laboratuvar al/sat sinyali üretmez. Günlük verileri toplar, büyük hareketleri olay
            olarak işaretler ve bu hareketlerden önce hangi koşulların tekrarlandığını ölçer. Gerçek
            kalıpları incelemek için canlı bir BIST veri kaynağı bağlayın.
          </p>
        </div>
      </footer>
    </div>
  );
}
