import { useCallback, useRef, useState, type DragEvent } from 'react';
import { BracketedButton } from '@/components/ui';

const ACCEPTED_EXT = ['.xlsx', '.htm', '.html'];

export interface DropZoneProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

/**
 * Drag-and-drop file zone for MT5 reports. Accepts `.xlsx`, `.htm`,
 * `.html`. Shows a hover state while a file is being dragged over.
 *
 * Falls back to a visible `[ BROWSE ]` button — the underlying file
 * input is hidden but always rendered so keyboard users can tab into
 * it and press Enter to open the picker.
 */
export function DropZone({ onFiles, disabled = false }: DropZoneProps) {
  const [hovering, setHovering] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setHovering(false);
      if (disabled) return;
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        ACCEPTED_EXT.some((ext) => f.name.toLowerCase().endsWith(ext)),
      );
      if (files.length) onFiles(files);
    },
    [onFiles, disabled],
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setHovering(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setHovering(false);
  }, []);

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={[
        'border-2 border-dashed p-8 text-center font-mono select-none transition-colors',
        hovering
          ? 'border-term-greenBright bg-term-text/5 text-term-greenBright'
          : 'border-term-borderDim text-term-muted',
        disabled ? 'opacity-50 pointer-events-none' : 'cursor-pointer',
      ].join(' ')}
      onClick={() => inputRef.current?.click()}
    >
      <p className="text-sm uppercase tracking-widest mb-1">
        {hovering ? '── DROP TO PARSE ──' : '── DRAG MT5 REPORT(S) HERE ──'}
      </p>
      <p className="text-xs text-term-dim mb-4">
        Accepted: {ACCEPTED_EXT.join('  ')}
      </p>
      <BracketedButton
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          inputRef.current?.click();
        }}
      >
        Browse
      </BracketedButton>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXT.join(',')}
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          // Reset so re-selecting the same file fires onChange.
          e.target.value = '';
        }}
      />
    </div>
  );
}
