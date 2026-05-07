export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-bg-page font-body">
      {/* Top bar */}
      <header className="sticky top-0 z-50 border-b border-border-soft bg-white/95">
        <div className="mx-auto flex h-16 max-w-[1280px] animate-pulse items-center justify-between px-6">
          <div className="h-7 w-24 rounded-md bg-neutral-200" />
          <div className="h-6 w-28 rounded-pill bg-neutral-200" />
        </div>
      </header>

      {/* Latest update card */}
      <section className="py-16">
        <div className="mx-auto max-w-[1280px] animate-pulse px-6">
          <div className="rounded-card-lg border border-border-soft bg-white p-8 md:p-12">
            <div className="mb-6 flex items-center justify-between">
              <div className="h-5 w-32 rounded-md bg-neutral-200" />
              <div className="h-4 w-44 rounded-md bg-neutral-100" />
            </div>
            <div className="space-y-6">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex gap-3">
                  <div className="mt-[10px] h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-300" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-full rounded bg-neutral-200" />
                    <div className="h-4 w-4/5 rounded bg-neutral-200" />
                    <div className="flex gap-2">
                      <div className="h-5 w-24 rounded-pill bg-neutral-100" />
                      <div className="h-5 w-20 rounded-pill bg-neutral-100" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* About section */}
      <section className="bg-bg-alt py-16">
        <div className="mx-auto max-w-[1280px] animate-pulse px-6">
          <div className="mb-3 h-5 w-36 rounded bg-neutral-200" />
          <div className="mb-8 h-8 w-64 rounded bg-neutral-300" />
          <div className="h-[50vh] rounded-card-lg bg-neutral-200" />
        </div>
      </section>

      {/* History section */}
      <section className="py-16">
        <div className="mx-auto max-w-[1280px] animate-pulse px-6">
          <div className="mb-3 h-5 w-28 rounded bg-neutral-200" />
          <div className="mb-8 h-8 w-40 rounded bg-neutral-300" />
          <div className="divide-y divide-border-soft">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center justify-between py-5">
                <div className="space-y-1.5">
                  <div className="h-4 w-36 rounded bg-neutral-200" />
                  <div className="h-3 w-28 rounded bg-neutral-100" />
                </div>
                <div className="h-4 w-4 rounded bg-neutral-200" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
