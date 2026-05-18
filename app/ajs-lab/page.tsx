"use client";

import { useState } from "react";
import Image from "next/image";
import { Mail, Copy, Check, Loader2 } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Lead {
  id: string;
  industry: string;
  businessName: string;
  businessType: string;
  location: string;
  context: string;
}

interface EmailResult {
  subject: string;
  body: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_PROMPT = `You are an expert outreach copywriter for Helios Marketing, a digital marketing agency that builds AI-powered marketing systems for local and regional businesses.

Write a personalized cold outreach email to {BUSINESS_NAME}, a {BUSINESS_TYPE} in {LOCATION}.

Context about their business:
{BUSINESS_CONTEXT}

The email should:
- Open with a personalized hook that references something specific about their business or industry
- Briefly introduce Helios Marketing and what we specialize in
- Call out 1-2 specific pain points relevant to their business type
- Show concretely how our AI marketing systems could help them
- End with a low-commitment CTA (e.g., a 15-minute call)
- Stay under 200 words for the body — tight and punchy

Format your response exactly as:
Subject: [subject line here]

[email body here]`;

const LEADS: Lead[] = [
  {
    id: "law-firm",
    industry: "Law Firm",
    businessName: "Sterling & Associates Law",
    businessType: "personal injury law firm",
    location: "Austin, TX",
    context:
      "A boutique 4-attorney personal injury firm relying heavily on referrals. They have a dated website, run occasional Google Ads with no real strategy, and have no CRM or follow-up automation in place.",
  },
  {
    id: "restaurant",
    industry: "Restaurant",
    businessName: "Casa Bella Italian Kitchen",
    businessType: "upscale Italian restaurant",
    location: "Nashville, TN",
    context:
      "Open for 6 years, known for ambiance and weekend reservations that fill up fast. They post inconsistently on Instagram, have no email marketing list, and weekday lunch traffic is slow.",
  },
  {
    id: "med-spa",
    industry: "Med Spa",
    businessName: "Glow Aesthetics Med Spa",
    businessType: "medical spa",
    location: "Scottsdale, AZ",
    context:
      "3 providers offering botox, fillers, laser treatments, and IV therapy. Loyal existing clientele but struggle to attract new patients in a competitive market. Run text promos but have no automated follow-up sequence.",
  },
  {
    id: "real-estate",
    industry: "Real Estate",
    businessName: "Pinnacle Properties Group",
    businessType: "luxury real estate agency",
    location: "Miami, FL",
    context:
      "12 agents focused on luxury residential. Generate leads from Zillow but have poor nurture sequences and an inconsistent social presence. No automated review collection system.",
  },
  {
    id: "fitness",
    industry: "Fitness Studio",
    businessName: "Iron & Grace Fitness",
    businessType: "boutique fitness studio",
    location: "Denver, CO",
    context:
      "Strength training and yoga studio with 20-member session capacity. Struggles with member churn, has no referral program, and relies entirely on word-of-mouth. Uses Mindbody for scheduling but has no marketing automation.",
  },
];

const INDUSTRY_STYLES: Record<
  string,
  { badge: string; dot: string }
> = {
  "Law Firm":      { badge: "bg-blue-50 text-blue-700",    dot: "bg-blue-400" },
  Restaurant:      { badge: "bg-amber-50 text-amber-700",  dot: "bg-amber-400" },
  "Med Spa":       { badge: "bg-pink-50 text-pink-700",    dot: "bg-pink-400" },
  "Real Estate":   { badge: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-400" },
  "Fitness Studio":{ badge: "bg-violet-50 text-violet-700", dot: "bg-violet-400" },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseEmail(raw: string): EmailResult {
  const lines = raw.trim().split("\n");
  let subject = "";
  let bodyStart = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().startsWith("subject:")) {
      subject = lines[i].replace(/^subject:\s*/i, "").trim();
      bodyStart = i + 1;
      while (bodyStart < lines.length && lines[bodyStart].trim() === "")
        bodyStart++;
      break;
    }
  }
  return { subject, body: lines.slice(bodyStart).join("\n").trim() };
}

async function callGemini(fullPrompt: string, apiKey: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: { temperature: 0.85, maxOutputTokens: 1024 },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: { message?: string } })?.error?.message ??
        `HTTP ${res.status}`
    );
  }
  const data = await res.json();
  const text: string =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) throw new Error("Empty response from Gemini");
  return text;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-2.5 p-4">
      <div className="h-2.5 w-3/4 rounded-full bg-neutral-100" />
      <div className="h-2.5 w-full rounded-full bg-neutral-100" />
      <div className="h-2.5 w-5/6 rounded-full bg-neutral-100" />
      <div className="h-2.5 w-full rounded-full bg-neutral-100" />
      <div className="h-2.5 w-2/3 rounded-full bg-neutral-100" />
      <div className="h-2.5 w-full rounded-full bg-neutral-100" />
      <div className="h-2.5 w-4/5 rounded-full bg-neutral-100" />
      <div className="mt-4 h-2.5 w-full rounded-full bg-neutral-100" />
      <div className="h-2.5 w-3/5 rounded-full bg-neutral-100" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-white py-24 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-bg-alt">
        <Mail className="h-5 w-5 text-fg-muted" />
      </div>
      <p className="text-base font-medium text-fg-2">No emails yet</p>
      <p className="mt-1 text-sm text-fg-muted">
        Edit the prompt on the left, then click Generate.
      </p>
    </div>
  );
}

interface EmailCardProps {
  lead: Lead;
  result: EmailResult | undefined;
  error: string | undefined;
  isLoading: boolean;
  onCopy: () => Promise<void>;
}

function EmailCard({ lead, result, error, isLoading, onCopy }: EmailCardProps) {
  const [copied, setCopied] = useState(false);
  const style = INDUSTRY_STYLES[lead.industry] ?? {
    badge: "bg-neutral-100 text-neutral-600",
    dot: "bg-neutral-400",
  };

  async function handleCopy() {
    await onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-card-md border border-border bg-white shadow-[var(--shadow-sm)] transition-shadow duration-300 hover:shadow-[var(--shadow-md)]">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b border-border-soft px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-fg-1">
            {lead.businessName}
          </p>
          <p className="text-xs text-fg-muted">{lead.location}</p>
        </div>
        <span
          className={`shrink-0 rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style.badge}`}
        >
          {lead.industry}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1">
        {isLoading ? (
          <LoadingSkeleton />
        ) : error ? (
          <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {error}
          </div>
        ) : result ? (
          <div className="space-y-3 p-4">
            {result.subject && (
              <div className="rounded-lg bg-bg-alt px-3 py-2.5">
                <p className="mb-0.5 text-[10px] font-bold uppercase tracking-widest text-fg-muted">
                  Subject
                </p>
                <p className="text-sm font-medium text-fg-1">{result.subject}</p>
              </div>
            )}
            <p className="whitespace-pre-wrap text-sm font-light leading-relaxed text-fg-2">
              {result.body}
            </p>
          </div>
        ) : null}
      </div>

      {/* Footer */}
      {result && !isLoading && (
        <div className="border-t border-border-soft px-4 py-2.5">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs font-medium text-fg-3 transition-colors hover:text-fg-1"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-helios-green" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Copy email
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AJsLabPage() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [results, setResults] = useState<Record<string, EmailResult>>({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [globalError, setGlobalError] = useState("");

  const hasResults =
    Object.keys(results).length > 0 || loadingIds.size > 0;

  async function handleGenerate() {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      setGlobalError(
        "NEXT_PUBLIC_GEMINI_API_KEY is not set. Add it to your .env.local and restart the dev server."
      );
      return;
    }
    setGlobalError("");
    setResults({});
    setErrors({});
    setGenerating(true);
    setLoadingIds(new Set(LEADS.map((l) => l.id)));

    await Promise.all(
      LEADS.map(async (lead) => {
        const fullPrompt = prompt
          .replace(/\{BUSINESS_NAME\}/g, lead.businessName)
          .replace(/\{BUSINESS_TYPE\}/g, lead.businessType)
          .replace(/\{LOCATION\}/g, lead.location)
          .replace(/\{BUSINESS_CONTEXT\}/g, lead.context);
        try {
          const text = await callGemini(fullPrompt, apiKey);
          const parsed = parseEmail(text);
          setResults((prev) => ({ ...prev, [lead.id]: parsed }));
        } catch (e) {
          setErrors((prev) => ({
            ...prev,
            [lead.id]: e instanceof Error ? e.message : "Unknown error",
          }));
        } finally {
          setLoadingIds((prev) => {
            const next = new Set(prev);
            next.delete(lead.id);
            return next;
          });
        }
      })
    );

    setGenerating(false);
  }

  async function copyLead(lead: Lead) {
    const r = results[lead.id];
    if (!r) return;
    const text = r.subject ? `Subject: ${r.subject}\n\n${r.body}` : r.body;
    await navigator.clipboard.writeText(text);
  }

  return (
    <div className="min-h-screen bg-bg-alt font-body">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-white">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-6">
          <Image
            src="/helios-logo.png"
            alt="Helios Marketing"
            width={80}
            height={26}
            className="h-6 w-auto"
          />
          <div className="h-4 w-px bg-border" />
          <span className="font-heading text-sm font-bold tracking-tight text-fg-1">
            AJ&apos;s Lab
          </span>
          <span className="rounded-pill bg-[#FF5E1A] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">
            Beta
          </span>
          <span className="ml-auto hidden text-xs text-fg-muted sm:block">
            Gemini 2.5 Flash &bull; 5 leads
          </span>
        </div>
      </header>

      {/* Main layout */}
      <div className="mx-auto max-w-[1440px] px-6 py-6">
        <div className="flex items-start gap-6">
          {/* Left panel */}
          <aside className="w-[360px] shrink-0">
            <div className="sticky top-[3.75rem] space-y-4">
              {/* Prompt editor */}
              <div className="rounded-card-md border border-border bg-white p-5 shadow-[var(--shadow-sm)]">
                <p className="eyebrow mb-3">System Prompt</p>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={18}
                  spellCheck={false}
                  className="w-full resize-y rounded-lg border border-border bg-bg-alt px-3 py-2.5 font-body text-sm font-light leading-relaxed text-fg-1 outline-none transition-colors placeholder:text-fg-muted focus:border-[#FF5E1A] focus:ring-1 focus:ring-[#FF5E1A]/20"
                />
                <p className="mt-2 text-xs leading-relaxed text-fg-muted">
                  Placeholders:{" "}
                  <code className="rounded bg-bg-alt px-1 py-0.5 text-[11px]">
                    {"{BUSINESS_NAME}"}
                  </code>{" "}
                  <code className="rounded bg-bg-alt px-1 py-0.5 text-[11px]">
                    {"{BUSINESS_TYPE}"}
                  </code>{" "}
                  <code className="rounded bg-bg-alt px-1 py-0.5 text-[11px]">
                    {"{LOCATION}"}
                  </code>{" "}
                  <code className="rounded bg-bg-alt px-1 py-0.5 text-[11px]">
                    {"{BUSINESS_CONTEXT}"}
                  </code>
                </p>
              </div>

              {/* Lead list */}
              <div className="rounded-card-md border border-border bg-white p-5 shadow-[var(--shadow-sm)]">
                <p className="eyebrow mb-3">Sample Leads</p>
                <ul className="space-y-3">
                  {LEADS.map((lead) => {
                    const style = INDUSTRY_STYLES[lead.industry] ?? {
                      badge: "bg-neutral-100 text-neutral-600",
                      dot: "bg-neutral-400",
                    };
                    return (
                      <li key={lead.id} className="flex items-start gap-2.5">
                        <div
                          className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-fg-1">
                            {lead.businessName}
                          </p>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <span
                              className={`rounded-pill px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style.badge}`}
                            >
                              {lead.industry}
                            </span>
                            <span className="text-xs text-fg-muted">
                              {lead.location}
                            </span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Error */}
              {globalError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {globalError}
                </div>
              )}

              {/* Generate button */}
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex w-full items-center justify-center gap-2 rounded-pill bg-[#FF5E1A] px-6 py-3.5 text-sm font-semibold text-white shadow-cta-glow transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-[#E54E0F] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating&hellip;
                  </>
                ) : (
                  "Generate 5 Emails"
                )}
              </button>
            </div>
          </aside>

          {/* Right panel — results */}
          <main className="min-w-0 flex-1">
            {!hasResults ? (
              <EmptyState />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {LEADS.map((lead) => (
                  <EmailCard
                    key={lead.id}
                    lead={lead}
                    result={results[lead.id]}
                    error={errors[lead.id]}
                    isLoading={loadingIds.has(lead.id)}
                    onCopy={() => copyLead(lead)}
                  />
                ))}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
