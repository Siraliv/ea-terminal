import { useEffect } from 'react';

export type LightboxProps = {
  /** When non-null, the overlay opens with this image URL. */
  src: string | null;
  /** Image alt text for a11y. */
  alt?: string;
  /** Called when the user dismisses the overlay (ESC, backdrop click, × button). */
  onClose: () => void;
};

/**
 * Full-viewport image viewer. Pops above everything on a near-black
 * backdrop and constrains the image to `object-contain` inside the
 * viewport so the original aspect ratio is preserved.
 *
 * Dismiss triggers:
 *   - ESC key
 *   - click on the backdrop (outside the image)
 *   - click on the `[ × close ]` button
 *
 * While open, body scroll is locked so the page underneath doesn't
 * drift when the user scroll-wheels on the image.
 */
export function Lightbox({ src, alt, onClose }: LightboxProps) {
  useEffect(() => {
    if (!src) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [src, onClose]);

  if (!src) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt ?? 'Screenshot viewer'}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 cursor-zoom-out"
    >
      <img
        src={src}
        alt={alt ?? 'full-size screenshot'}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full object-contain border border-term-green/40 cursor-default"
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-3 right-4 text-term-muted hover:text-term-greenBright text-sm font-mono"
      >
        [ × close ]
      </button>
      <span
        aria-hidden="true"
        className="absolute bottom-3 left-4 text-term-dim text-xs font-mono select-none"
      >
        └─ click outside or press ESC to close
      </span>
    </div>
  );
}
