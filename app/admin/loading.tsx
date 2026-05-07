export default function AdminLoading() {
  return (
    <div className="animate-pulse">
      {/* Page header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="h-7 w-24 rounded-md bg-neutral-200" />
          <div className="mt-1.5 h-4 w-20 rounded bg-neutral-100" />
        </div>
        <div className="h-9 w-32 rounded-pill bg-neutral-200" />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-white">
        <div className="flex gap-6 border-b border-border bg-bg-alt px-4 py-3">
          {[80, 64, 56, 48].map((w) => (
            <div
              key={w}
              style={{ width: w }}
              className="h-4 rounded bg-neutral-200"
            />
          ))}
        </div>
        <div className="divide-y divide-border-soft">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-4">
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-48 rounded bg-neutral-200" />
                <div className="h-3 w-32 rounded bg-neutral-100" />
              </div>
              <div className="h-4 w-28 rounded bg-neutral-100" />
              <div className="h-5 w-16 rounded-pill bg-neutral-200" />
              <div className="flex gap-2">
                <div className="h-7 w-16 rounded-lg bg-neutral-100" />
                <div className="h-7 w-10 rounded-lg bg-neutral-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
