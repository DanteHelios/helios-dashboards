import Image from "next/image";
import Link from "next/link";
import Button from "@/components/Button";
import Eyebrow from "@/components/Eyebrow";
import Pill from "@/components/Pill";
import Card from "@/components/Card";

export default function Home() {
  return (
    <main className="min-h-screen bg-bg-page font-body">
      {/* Header */}
      <header className="fixed top-0 z-50 w-full border-b border-border-soft bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-[1280px] items-center px-6">
          <Image
            src="/helios-logo.png"
            alt="Helios Marketing"
            width={120}
            height={40}
            className="h-8 w-auto"
            priority
          />
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-[1280px] px-6 pb-24 pt-40">
        <div className="max-w-2xl">
          <Eyebrow color="green" className="mb-4">
            Helios Client Dashboards
          </Eyebrow>

          <h1 className="font-heading mb-6 text-[clamp(40px,5vw,60px)] font-bold leading-[1.15] tracking-tight text-fg-1">
            Your Project.<br />Always Up to Date.
          </h1>

          <p className="mb-10 text-body font-light leading-relaxed text-fg-2">
            Per-client dashboards powered by real GitHub activity and daily AI
            summaries. Clear, cited, and on brand.
          </p>

          <div className="flex flex-wrap items-center gap-4">
            <Link href="/d/demo-token-replace-me-in-prod">
              <Button variant="primary">View Dashboard</Button>
            </Link>
            <Link href="/admin">
              <Button variant="outline">Admin Login</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Feature cards */}
      <section className="bg-bg-alt py-24">
        <div className="mx-auto max-w-[1280px] px-6">
          <div className="mb-12 text-center">
            <Eyebrow color="orange" className="mb-3">
              The System
            </Eyebrow>
            <h2 className="font-heading text-[clamp(32px,3.5vw,48px)] font-bold tracking-tight text-fg-1">
              Built on Real Work
            </h2>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                label: "GitHub Activity",
                heading: "Commits, PRs, Issues",
                body:
                  "Every push, merge, and close is ingested automatically. Nothing manual.",
              },
              {
                label: "Daily AI Summary",
                heading: "Cited, Not Hallucinated",
                body:
                  "Claude generates each bullet from real events and cites its sources. If nothing happened, nothing gets written.",
              },
              {
                label: "Private URL",
                heading: "One Link Per Client",
                body:
                  "256-bit token, no login required. Rotate with one click if a URL leaks.",
              },
            ].map((card, i) => (
              <Card key={i} className="p-8">
                <Eyebrow color="green" className="mb-3">
                  {card.label}
                </Eyebrow>
                <h3 className="font-heading mb-3 text-[24px] font-bold tracking-tight text-fg-1">
                  {card.heading}
                </h3>
                <p className="text-body-sm font-light leading-relaxed text-fg-2">
                  {card.body}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA strip */}
      <section className="mx-auto max-w-[1280px] px-6 py-24 text-center">
        <Pill className="mb-6">Phase 0 — Foundation</Pill>
        <h2 className="font-heading mb-6 text-[clamp(32px,3.5vw,48px)] font-bold tracking-tight text-fg-1">
          Helios Design System Active
        </h2>
        <p className="mx-auto mb-10 max-w-lg text-body font-light text-fg-2">
          Pragmatica Extended Bold heading. Roboto Light body. Orange glow on the
          primary CTA. Tokens wired.
        </p>
        <Link href="/admin">
          <Button variant="primary" className="text-base px-8 py-4">
            Get Started
          </Button>
        </Link>
      </section>

      {/* Footer */}
      <footer className="bg-[#171717] py-12">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between px-6">
          <Image
            src="/helios-logo.png"
            alt="Helios Marketing"
            width={120}
            height={40}
            className="h-10 w-auto brightness-0 invert"
          />
          <p className="text-sm font-light text-white/60">
            questions? lucas@heliosmarketing.org
          </p>
        </div>
      </footer>
    </main>
  );
}
