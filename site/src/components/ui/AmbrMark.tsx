interface AmbrMarkProps {
  size?: number;
  className?: string;
}

/**
 * Ambr brand mark — the "C organic" shell holding the AI core (a 4-point spark
 * + three connected nodes). Inline SVG so it stays crisp at any size, themeable,
 * and free of next/image SVG quirks. Internal elements carry stable classes
 * (`am-shell`, `am-link`, `am-spark`) so a host can animate it (e.g. the hero's
 * genesis assemble) by scoping rules under a wrapper class.
 */
export default function AmbrMark({ size = 32, className }: AmbrMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="Ambr"
      className={className}
      style={{ overflow: 'visible' }}
    >
      <style>{`.am-link{opacity:.55}`}</style>
      <defs>
        <linearGradient id="amg" x1="24" y1="12" x2="76" y2="86" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#9a7d52" />
          <stop offset=".5" stopColor="#c6a87c" />
          <stop offset="1" stopColor="#8a6f48" />
        </linearGradient>
      </defs>
      <path
        className="am-shell"
        pathLength={1}
        d="M51 12 C39 20 31 38 29 52 C27 71 39 86 50 86 C62 86 72 71 71 53 C70 38 64 21 51 12 Z"
        fill="none"
        stroke="url(#amg)"
        strokeWidth={2.4}
        strokeLinejoin="round"
      />
      <g className="am-link" stroke="#c6a87c" strokeWidth={0.9}>
        <line x1="50" y1="52" x2="40" y2="39" />
        <line x1="50" y1="52" x2="62" y2="45" />
        <line x1="50" y1="52" x2="56" y2="65" />
      </g>
      <g className="am-link" fill="#c6a87c">
        <circle cx="40" cy="39" r="1.9" />
        <circle cx="62" cy="45" r="1.6" />
        <circle cx="56" cy="65" r="1.5" />
      </g>
      <path
        className="am-spark"
        d="M50 43 C50.9 50 52.7 51.7 60 52.5 C52.7 53.3 50.9 55 50 62 C49.1 55 47.3 53.3 40 52.5 C47.3 51.7 49.1 50 50 43 Z"
        fill="#e8d9bb"
      />
    </svg>
  );
}
