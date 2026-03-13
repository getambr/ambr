export default function ReaderLoading() {
  return (
    <main className="pt-20">
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-xl text-center">
          <div className="h-4 w-28 mx-auto rounded bg-surface-elevated animate-pulse mb-4" />
          <div className="h-9 w-64 mx-auto rounded bg-surface-elevated animate-pulse mb-4" />
          <div className="h-4 w-80 mx-auto rounded bg-surface-elevated animate-pulse mb-8" />

          <div className="flex gap-3">
            <div className="flex-1 h-12 rounded-lg bg-surface animate-pulse" />
            <div className="h-12 w-24 rounded-lg bg-surface-elevated animate-pulse" />
          </div>

          <div className="mt-12 rounded-xl border border-border bg-surface p-6">
            <div className="h-4 w-36 rounded bg-surface-elevated animate-pulse mb-4" />
            <div className="space-y-3">
              <div className="h-3 w-full rounded bg-surface-elevated animate-pulse" />
              <div className="h-3 w-5/6 rounded bg-surface-elevated animate-pulse" />
              <div className="h-3 w-4/6 rounded bg-surface-elevated animate-pulse" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
