export default function ContractViewLoading() {
  return (
    <main className="pt-20">
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-3xl">
          {/* Header skeleton */}
          <div className="flex items-center gap-3 mb-6">
            <div className="h-6 w-6 rounded-full bg-surface-elevated animate-pulse" />
            <div className="h-5 w-48 rounded bg-surface-elevated animate-pulse" />
          </div>

          {/* Contract ID + hash */}
          <div className="h-8 w-56 rounded bg-surface-elevated animate-pulse mb-2" />
          <div className="h-4 w-full rounded bg-surface-elevated animate-pulse mb-8" />

          {/* Tab bar */}
          <div className="flex gap-4 mb-6 border-b border-border pb-3">
            <div className="h-4 w-24 rounded bg-surface-elevated animate-pulse" />
            <div className="h-4 w-28 rounded bg-surface-elevated animate-pulse" />
          </div>

          {/* Contract body */}
          <div className="rounded-xl border border-border bg-surface p-6 space-y-3">
            <div className="h-4 w-full rounded bg-surface-elevated animate-pulse" />
            <div className="h-4 w-5/6 rounded bg-surface-elevated animate-pulse" />
            <div className="h-4 w-4/6 rounded bg-surface-elevated animate-pulse" />
            <div className="h-4 w-full rounded bg-surface-elevated animate-pulse" />
            <div className="h-4 w-3/4 rounded bg-surface-elevated animate-pulse" />
            <div className="h-4 w-5/6 rounded bg-surface-elevated animate-pulse" />
            <div className="h-4 w-2/3 rounded bg-surface-elevated animate-pulse" />
          </div>

          {/* Principal declaration */}
          <div className="mt-6 rounded-xl border border-border bg-surface p-6">
            <div className="h-4 w-36 rounded bg-surface-elevated animate-pulse mb-4" />
            <div className="space-y-2">
              <div className="h-3 w-48 rounded bg-surface-elevated animate-pulse" />
              <div className="h-3 w-40 rounded bg-surface-elevated animate-pulse" />
              <div className="h-3 w-32 rounded bg-surface-elevated animate-pulse" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
