'use client';

import { useRef, type ReactNode } from 'react';

interface AmbrCardProps {
  children: ReactNode;
  label?: string;
  meta?: string;
  footer?: { left: string; right: string };
  variant?: 'dark' | 'light';
  geoPattern?: 'ellipse' | 'circle' | 'cross' | 'none';
  className?: string;
}

const geoPatterns = {
  ellipse: (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
      <ellipse cx="50" cy="50" rx="60" ry="80" />
      <line x1="0" y1="30" x2="100" y2="30" />
      <line x1="0" y1="70" x2="100" y2="70" />
    </svg>
  ),
  circle: (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
      <circle cx="50" cy="50" r="45" />
      <line x1="50" y1="0" x2="50" y2="100" />
      <line x1="0" y1="50" x2="100" y2="50" />
    </svg>
  ),
  cross: (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
      <ellipse cx="50" cy="50" rx="40" ry="90" transform="rotate(45 50 50)" />
      <ellipse cx="50" cy="50" rx="40" ry="90" transform="rotate(-45 50 50)" />
    </svg>
  ),
  none: null,
};

export default function AmbrCard({
  children,
  label,
  meta,
  footer,
  variant = 'dark',
  geoPattern = 'none',
  className = '',
}: AmbrCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  const isDark = variant === 'dark';
  const borderColor = isDark ? 'border-amber/30' : 'border-black/20';
  const cornerColor = isDark ? 'bg-amber' : 'bg-black';
  const geoStroke = isDark ? 'stroke-amber/20' : 'stroke-black/10';
  const bgClass = isDark ? 'bg-background' : 'bg-taupe-dark';

  return (
    <div
      ref={ref}
      className={`relative overflow-hidden border ${borderColor} ${bgClass} p-8 flex flex-col transition-all duration-300 hover:border-amber/50 ${className}`}
      style={{ boxShadow: isDark ? '0 20px 40px rgba(0,0,0,0.2)' : 'none' }}
    >
      {/* Inner frame */}
      <div className={`absolute top-4 left-4 right-4 bottom-4 border ${borderColor} pointer-events-none z-[1]`} />

      {/* Corner dots */}
      {['top-4 left-4', 'top-4 right-4', 'bottom-4 left-4', 'bottom-4 right-4'].map((pos) => (
        <div key={pos} className={`absolute ${pos} w-1.5 h-1.5 ${cornerColor} z-[2]`} />
      ))}

      {/* Geometric background */}
      {geoPattern !== 'none' && (
        <div className="absolute inset-0 pointer-events-none z-0">
          <div className={`w-full h-full ${geoStroke} fill-none [&_svg]:stroke-[0.5]`}>
            {geoPatterns[geoPattern]}
          </div>
        </div>
      )}

      {/* Header */}
      {(label || meta) && (
        <div className="relative z-10 flex justify-between items-start mb-auto">
          {label && <span className="text-micro">{label}</span>}
          {meta && (
            <div className={`text-micro text-right ${isDark ? '' : '!text-black/60'}`}>
              {meta.split('\n').map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Body */}
      <div className="relative z-10 my-auto text-center">
        {children}
      </div>

      {/* Footer */}
      {footer && (
        <div className={`relative z-10 flex justify-between items-end border-t ${borderColor} pt-4 mt-auto`}>
          <span className={`text-micro ${isDark ? '' : '!text-black/60'}`}>{footer.left}</span>
          <span className={`text-micro ${isDark ? '!text-text-secondary' : '!text-black/40'}`}>{footer.right}</span>
        </div>
      )}
    </div>
  );
}
