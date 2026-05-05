"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { format } from "date-fns";
import type { ContextUpdate } from "@/lib/types";

export default function HistoryAccordion({ updates }: { updates: ContextUpdate[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (updates.length === 0) {
    return (
      <p className="text-body-sm font-light text-fg-muted">
        No previous updates yet.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border-soft">
      {updates.map((update) => {
        const isOpen = openId === update.id;
        return (
          <div key={update.id}>
            <button
              onClick={() => setOpenId(isOpen ? null : update.id)}
              className="flex w-full items-center justify-between py-5 text-left transition-colors hover:text-accent"
              aria-expanded={isOpen}
            >
              <div>
                <p className="text-sm font-medium text-fg-1">
                  {format(update.generatedAt, "MMMM d, yyyy")}
                </p>
                <p className="mt-0.5 text-xs font-light text-fg-3">
                  {format(update.windowStart, "MMM d")} –{" "}
                  {format(update.windowEnd, "MMM d")} ·{" "}
                  {update.bullets.bullets.length} updates
                </p>
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-fg-muted transition-transform duration-300 ease-helios ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {isOpen && (
              <ul className="pb-6 space-y-4">
                {update.bullets.bullets.map((bullet, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-helios-green" />
                    <p className="text-body-sm font-light leading-relaxed text-fg-2">
                      {bullet.text}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
