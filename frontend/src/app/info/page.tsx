"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Building2, CheckCircle2, CreditCard, QrCode, ScanLine, Sparkles } from "lucide-react";

type PaymentMode = "automatic" | "manual";

const locationSnapshots = [
  {
    name: "Gandhinagar",
    tableTurns: "2,400+ baskets/month",
    orderErrors: "-42% billing errors",
    paymentLag: "18 sec avg checkout",
  },
  {
    name: "Channi Himmat",
    tableTurns: "1,800+ baskets/month",
    orderErrors: "-35% billing errors",
    paymentLag: "22 sec avg checkout",
  },
  {
    name: "Kunjwani",
    tableTurns: "2,100+ baskets/month",
    orderErrors: "-38% billing errors",
    paymentLag: "20 sec avg checkout",
  },
];

const menuPreview = {
  fruits: [
    { name: "Alphonso Mango", time: "per kg", price: "280" },
    { name: "Red Apple (Shimla)", time: "per kg", price: "190" },
  ],
  vegetables: [
    { name: "Fresh Broccoli", time: "per kg", price: "120" },
    { name: "Baby Spinach Pack", time: "250g pack", price: "45" },
  ],
  drinks: [
    { name: "Cold Press Juice", time: "500ml", price: "89" },
    { name: "Coconut Water", time: "per piece", price: "49" },
  ],
} as const;

export default function HomePage() {
  const [reduceMotion, setReduceMotion] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("automatic");
  const [activeLocation, setActiveLocation] = useState(0);
  const [activeCategory, setActiveCategory] =
    useState<keyof typeof menuPreview>("fruits");
  const [ticketCount, setTicketCount] = useState(0);
  const [stage, setStage] = useState("Waiting for scan");

  const categoryEntries = useMemo(() => Object.entries(menuPreview), []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (event: MediaQueryListEvent) => setReduceMotion(event.matches);
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const interval = window.setInterval(() => {
      setActiveCategory((previous) => {
        const keys = categoryEntries.map(([key]) => key as keyof typeof menuPreview);
        const currentIndex = keys.indexOf(previous);
        const nextIndex = (currentIndex + 1) % keys.length;
        return keys[nextIndex];
      });
    }, 5000);

    return () => window.clearInterval(interval);
  }, [categoryEntries, reduceMotion]);

  const addItem = (dishName: string) => {
    setTicketCount((current) => current + 1);
    setStage(`Added ${dishName}`);
    window.setTimeout(() => setStage("Added to basket"), 900);
  };

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      <header className="sticky top-0 z-40 border-b border-[var(--border-subtle)] bg-[var(--bg-base)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <a href="#top" className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-brand)] text-[var(--bg-base)]">
              🥬
            </span>
            ApnaGreen Basket
          </a>
          <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
            <a href="#payments" className="hover:text-[var(--accent-brand)]">Payments</a>
            <a href="#chain" className="hover:text-[var(--accent-brand)]">Multi-location</a>
            <a href="#proof" className="hover:text-[var(--accent-brand)]">Proof</a>
            <a href="#pricing" className="hover:text-[var(--accent-brand)]">Pricing</a>
          </nav>
          <a
            href="#demo"
            className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-brand)] px-4 py-2 text-sm font-semibold text-[var(--text-on-accent)] transition hover:bg-[var(--accent-brand-hover)]"
          >
            Get a Demo
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </header>

      <main id="top">
        <section className="marketing-grid-bg relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="spotlight absolute -left-32 top-10 h-72 w-72 rounded-full" />
            <div className="spotlight absolute -right-20 bottom-8 h-64 w-64 rounded-full" />
          </div>
          <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:px-8 lg:py-20">
            <div className="space-y-7">
              <p className="inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                <Sparkles className="h-3.5 w-3.5 text-[var(--accent-brand)]" />
                Built for multi-outlet fresh marts
              </p>
              <h1 className="font-display text-4xl font-bold leading-tight text-balance sm:text-5xl lg:text-6xl">
                Fresh produce, smart checkout.
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">
                ApnaGreen Basket gives every outlet a hybrid self-checkout flow with basket QR scanning and counter billing. Your team gets faster throughput, accurate weight-based pricing, and real-time inventory across all locations.
              </p>
              <div className="grid gap-3 text-sm text-[var(--text-secondary)] sm:grid-cols-2">
                <p className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3">
                  Dual pricing: weight-based for loose produce, fixed-unit for packaged goods.
                </p>
                <p className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3">
                  Multi-outlet inventory, analytics, and staff management from one dashboard.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <a
                  id="demo"
                  href="#pricing"
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-brand)] px-5 py-3 text-sm font-semibold text-[var(--text-on-accent)] transition hover:bg-[var(--accent-brand-hover)]"
                >
                  Schedule a 30-minute demo
                  <ArrowRight className="h-4 w-4" />
                </a>
                <Link
                  href="/menu"
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--bg-surface)] px-5 py-3 text-sm font-semibold hover:border-[var(--accent-brand)] hover:text-[var(--accent-brand)]"
                >
                  Browse customer catalog
                  <QrCode className="h-4 w-4" />
                </Link>
              </div>
            </div>

            <div className="rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-4 shadow-[0_10px_35px_rgba(18,38,58,0.12)]">
              <div className="mb-3 flex items-center justify-between rounded-2xl bg-[var(--bg-surface-elevated)] px-3 py-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Live service pulse</p>
                  <p className="text-sm font-semibold">{locationSnapshots[activeLocation].name} outlet</p>
                </div>
                <select
                  value={activeLocation}
                  onChange={(event) => setActiveLocation(Number(event.target.value))}
                  aria-label="Choose outlet preview"
                  className="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2 py-1 text-xs"
                >
                  {locationSnapshots.map((location, index) => (
                    <option key={location.name} value={index}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-[var(--bg-surface-elevated)] p-2 text-xs">
                <button
                  type="button"
                  onClick={() => setPaymentMode("automatic")}
                  className={`rounded-xl px-3 py-2 text-left ${
                    paymentMode === "automatic"
                      ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)]"
                      : "bg-[var(--bg-surface)] text-[var(--text-secondary)]"
                  }`}
                >
                  Instant automatic
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMode("manual")}
                  className={`rounded-xl px-3 py-2 text-left ${
                    paymentMode === "manual"
                      ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)]"
                      : "bg-[var(--bg-surface)] text-[var(--text-secondary)]"
                  }`}
                >
                  Keep 100%, verify manually
                </button>
              </div>

              <div className="space-y-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3">
                <div className="flex gap-2">
                  {categoryEntries.map(([category]) => (
                    <button
                      type="button"
                      key={category}
                      onClick={() => setActiveCategory(category as keyof typeof menuPreview)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                        activeCategory === category
                          ? "bg-[var(--accent-brand)] text-[var(--text-on-accent)]"
                          : "bg-[var(--bg-surface)] text-[var(--text-secondary)]"
                      }`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
                <div className="space-y-2">
                  {menuPreview[activeCategory].map((item) => (
                    <div key={item.name} className="flex items-center justify-between rounded-xl bg-[var(--bg-surface)] px-3 py-2">
                      <div>
                        <p className="text-sm font-semibold">{item.name}</p>
                        <p className="text-xs text-[var(--text-muted)]">Unit: {item.time}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => addItem(item.name)}
                        className="rounded-lg bg-[var(--accent-alt)] px-3 py-1 text-xs font-semibold text-[var(--text-on-accent-alt)]"
                      >
                        Add {item.price}
                      </button>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Ticket status</p>
                  <p className="mt-1 text-sm font-semibold">{stage}</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    {ticketCount} item(s) in ticket, payment mode: {paymentMode === "automatic" ? "automatic capture" : "manual verification"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="payments" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mb-8 max-w-2xl">
            <h2 className="font-display text-3xl font-bold sm:text-4xl">Choose the payment model that matches your margins</h2>
            <p className="mt-3 text-[var(--text-secondary)]">
              Some outlets optimize for speed. Others prefer zero online transaction cost. You can run either mode per location and switch later without re-training your team.
            </p>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <article className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-brand-subtle)] text-[var(--accent-brand)]">
                <CreditCard className="h-5 w-5" />
              </div>
              <h3 className="text-xl font-semibold">Instant automatic payments</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                Customer scans, selects items, pays in one flow. Counter staff gets a clean paid ticket instantly. Ideal when your goal is faster checkout throughput with less cashier intervention.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-[var(--text-secondary)]">
                <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-[var(--accent-alt)]" />Lower queue pressure during rush hours</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-[var(--accent-alt)]" />Auto confirmation to packing and counter staff</li>
              </ul>
            </article>

            <article className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-alt-subtle)] text-[var(--accent-alt)]">
                <ScanLine className="h-5 w-5" />
              </div>
              <h3 className="text-xl font-semibold">Keep 100%, verify manually</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                Customer selects items digitally and pays your staff directly. Your cashier verifies payment in one tap before the order moves forward. Ideal where you want no online fee impact.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-[var(--text-secondary)]">
                <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-[var(--accent-alt)]" />No online gateway charge on every order</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-[var(--accent-alt)]" />Still keeps digital order clarity for counter</li>
              </ul>
            </article>
          </div>
        </section>

        <section id="chain" className="bg-[var(--bg-surface-elevated)] py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mb-8 flex items-center gap-3">
              <Building2 className="h-6 w-6 text-[var(--accent-brand)]" />
              <h2 className="font-display text-3xl font-bold sm:text-4xl">Run every outlet from one operating playbook</h2>
            </div>
            <p className="max-w-3xl text-[var(--text-secondary)]">
              Standardize categories, pricing logic, and availability across locations while still letting each outlet control local specials and sold-out states.
            </p>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {locationSnapshots.map((snapshot) => (
                <article key={snapshot.name} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
                  <h3 className="text-lg font-semibold">{snapshot.name}</h3>
                  <p className="mt-3 text-sm text-[var(--text-secondary)]">{snapshot.tableTurns}</p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">{snapshot.orderErrors}</p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">{snapshot.paymentLag}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="proof" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">Proof from operators</h2>
          <p className="mt-2 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Placeholder content for final customer logos and verified testimonials
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              "[Logo Placeholder] Fresh Mart Co",
              "[Logo Placeholder] Green Valley Stores",
              "[Logo Placeholder] Nature's Best Markets",
              "[Logo Placeholder] Farm Fresh Collective",
            ].map((logo) => (
              <div key={logo} className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] px-4 py-5 text-center text-sm text-[var(--text-secondary)]">
                {logo}
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] p-6">
            <p className="text-sm text-[var(--text-secondary)]">
              [Testimonial Placeholder] &quot;After rollout across five outlets, wrong-item complaints dropped and our evening cashier queues got shorter in week one.&quot;
            </p>
            <p className="mt-2 text-sm font-semibold">Operations Manager, Placeholder Chain</p>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-8">
            <h2 className="font-display text-3xl font-bold sm:text-4xl">Simple rollout, no pressure sales flow</h2>
            <p className="mt-3 max-w-3xl text-[var(--text-secondary)]">
              We map your current ordering process, configure one pilot outlet, and share measured results before full chain rollout. No forced annual commitment before the pilot proves value.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-[var(--bg-surface-elevated)] p-4">
                <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Pilot timeline</p>
                <p className="mt-1 text-lg font-semibold">10 business days</p>
              </div>
              <div className="rounded-xl bg-[var(--bg-surface-elevated)] p-4">
                <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Setup support</p>
                <p className="mt-1 text-lg font-semibold">Included</p>
              </div>
              <div className="rounded-xl bg-[var(--bg-surface-elevated)] p-4">
                <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Training format</p>
                <p className="mt-1 text-lg font-semibold">Manager + floor staff</p>
              </div>
            </div>
            <a
              href="mailto:hello@apnagreenbasket.com"
              className="mt-7 inline-flex items-center gap-2 rounded-full bg-[var(--accent-brand)] px-5 py-3 text-sm font-semibold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)]"
            >
              Request pricing and demo slots
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 text-sm sm:px-6 md:grid-cols-4 lg:px-8">
          <div>
            <p className="font-display text-base font-bold">ApnaGreen Basket</p>
            <p className="mt-2 text-[var(--text-secondary)]">Multi-outlet fruits, vegetables & drinks mart platform — Jammu.</p>
          </div>
          <div>
            <p className="font-semibold">Product</p>
            <ul className="mt-3 space-y-2 text-[var(--text-secondary)]">
              <li><a href="#payments">Payments</a></li>
              <li><a href="#chain">Chain controls</a></li>
              <li><Link href="/menu">Product catalog demo</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold">Company</p>
            <ul className="mt-3 space-y-2 text-[var(--text-secondary)]">
              <li><a href="#proof">Customer stories</a></li>
              <li><a href="#pricing">Pricing</a></li>
              <li><a href="mailto:hello@apnagreenbasket.com">Contact us</a></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold">Implementation</p>
            <ul className="mt-3 space-y-2 text-[var(--text-secondary)]">
              <li>Onboarding and QR setup</li>
              <li>Staff workflow training</li>
              <li>Multi-outlet rollout support</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-[var(--border-subtle)] px-4 py-4 text-center text-xs text-[var(--text-muted)]">
          © 2026 ApnaGreen Basket. Fresh Fruits, Vegetables & Drinks — Jammu.
        </div>
      </footer>
    </div>
  );
}
