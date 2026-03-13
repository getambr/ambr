import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-mono uppercase tracking-widest text-amber mb-3">
        404
      </p>
      <h1 className="text-3xl font-bold text-text-primary sm:text-4xl mb-3">
        Page Not Found
      </h1>
      <p className="text-text-secondary text-sm mb-8 max-w-md">
        The contract, page, or resource you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <div className="flex gap-3">
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-lg bg-amber px-5 py-2.5 text-sm font-medium text-background hover:bg-amber-light transition-colors"
        >
          Back to Home
        </Link>
        <Link
          href="/reader"
          className="inline-flex items-center justify-center rounded-lg border border-amber px-5 py-2.5 text-sm font-medium text-amber hover:bg-amber-glow transition-colors"
        >
          Contract Reader
        </Link>
      </div>
    </main>
  );
}
