'use client';

import { useState } from 'react';

interface CodeSnippetProps {
  code: string;
  language?: string;
  title?: string;
}

export default function CodeSnippet({ code, language = 'typescript', title }: CodeSnippetProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      {title && (
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <span className="text-xs font-mono text-text-secondary">{title}</span>
          <span className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{language}</span>
        </div>
      )}
      <div className="relative">
        <pre className="p-4 overflow-x-auto">
          <code className="font-mono text-sm text-text-primary leading-relaxed whitespace-pre">
            {code}
          </code>
        </pre>
        <button
          onClick={handleCopy}
          className="absolute top-3 right-3 rounded-md bg-surface-elevated px-2 py-1 text-xs text-text-secondary hover:text-text-primary transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Copy code"
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
