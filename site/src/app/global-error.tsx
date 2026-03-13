'use client';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-background text-text-primary antialiased">
        <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
          <p className="text-sm font-mono uppercase tracking-widest text-error mb-3">
            Critical Error
          </p>
          <h1 className="text-3xl font-bold mb-3">
            Something Went Wrong
          </h1>
          <p className="text-gray-400 text-sm mb-8 max-w-md">
            A critical error occurred. Please try refreshing the page.
          </p>
          <button
            onClick={reset}
            className="inline-flex items-center justify-center rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-medium text-black hover:bg-amber-400 transition-colors"
          >
            Try Again
          </button>
        </main>
      </body>
    </html>
  );
}
