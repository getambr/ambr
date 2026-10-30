import { MICRO } from '@/lib/type';

/**
 * Editorial section label — `§ 01 — Founder Program`.
 *
 * 11px mono at 0.3em tracking. That tracking is the signature of the current
 * brand; the older `.text-micro` class in globals.css sits at 0.08em, which
 * reads as a different identity entirely. Both survive on purpose:
 * `.text-micro` stays the data/metadata label (dashboard, cards), this is the
 * editorial section marker.
 *
 * Previously copy-pasted byte-identical into five marketing pages.
 */
export default function Eyebrow({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={`text-[11px] uppercase ${className}`.trim()} style={MICRO.eyebrow}>
      {children}
    </p>
  );
}
