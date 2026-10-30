/**
 * Editorial section divider — a 1px brass rule fading to nothing on the right.
 *
 * Deliberately asymmetric: it anchors the left edge where the eyebrow and
 * headline start, and dissolves rather than boxing the section in. The
 * centred `.section-divider` in globals.css is a different device for a
 * different job and is not interchangeable with this.
 *
 * Previously a copy-pasted local `hairline` const in five marketing pages.
 */
export default function Hairline({ className = '' }: { className?: string }) {
  return (
    <div
      className={className}
      style={{ height: 1, background: 'linear-gradient(to right, rgba(198,168,124,0.45), transparent)' }}
    />
  );
}
