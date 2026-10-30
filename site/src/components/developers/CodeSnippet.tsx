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
    <div className="rounded-none border border-amber/20 bg-[#0c0b09] overflow-hidden">
      {title && (
        <div className="flex items-center justify-between border-b border-amber/15 px-4 py-2">
          <span className="text-xs font-mono text-[#8a8170]">{title}</span>
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#6f675b]">{language}</span>
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
          className="absolute top-3 right-3 rounded-none border border-amber/25 bg-[#111] px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-[#8a8170] hover:text-amber hover:border-amber/50 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Copy code"
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
