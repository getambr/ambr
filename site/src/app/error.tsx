'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-mono uppercase tracking-widest text-error mb-3">
        Error
      </p>
      <h1 className="text-3xl font-bold text-text-primary sm:text-4xl mb-3">
        Something Went Wrong
      </h1>
      <p className="text-text-secondary text-sm mb-8 max-w-md">
        {error.message || 'An unexpected error occurred. Please try again.'}
      </p>
      <button
        onClick={reset}
        className="inline-flex items-center justify-center rounded-lg bg-amber px-5 py-2.5 text-sm font-medium text-background hover:bg-amber-light transition-colors"
      >
        Try Again
      </button>
    </main>
  );
}
