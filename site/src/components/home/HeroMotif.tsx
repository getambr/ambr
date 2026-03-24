'use client';

export default function HeroMotif() {
  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] z-[1] pointer-events-none opacity-40 max-md:w-[400px] max-md:h-[400px]">
      <svg
        className="w-full h-full"
        viewBox="0 0 800 800"
        style={{ animation: 'rotateMotif 120s linear infinite' }}
      >
        <defs>
          <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#c6a87c" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#e8d9bb" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#9a7d52" stopOpacity="0.8" />
          </linearGradient>
        </defs>

        {/* Outer rings */}
        <circle cx="400" cy="400" r="350" fill="none" stroke="url(#goldGrad)" strokeWidth="0.5" strokeDasharray="4 4" />
        <circle cx="400" cy="400" r="250" fill="none" stroke="url(#goldGrad)" strokeWidth="1" />

        {/* Cross lines */}
        <g stroke="url(#goldGrad)" strokeWidth="0.5" opacity="0.5">
          <line x1="400" y1="0" x2="400" y2="800" />
          <line x1="0" y1="400" x2="800" y2="400" />
          <line x1="117" y1="117" x2="683" y2="683" />
          <line x1="117" y1="683" x2="683" y2="117" />
        </g>

        {/* Orbital ellipses */}
        <ellipse cx="400" cy="400" rx="300" ry="150" fill="none" stroke="url(#goldGrad)" strokeWidth="2" transform="rotate(30 400 400)" />
        <ellipse cx="400" cy="400" rx="300" ry="150" fill="none" stroke="url(#goldGrad)" strokeWidth="2" transform="rotate(-30 400 400)" />

        {/* Center */}
        <circle cx="400" cy="400" r="20" fill="url(#goldGrad)" />
        <circle cx="400" cy="400" r="80" fill="none" stroke="url(#goldGrad)" strokeWidth="1" />
      </svg>
    </div>
  );
}
