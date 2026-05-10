import { useEffect, useRef, useState } from 'react';

export type MultiSelectOption = {
  value: string;
  label: string;
};

export type MultiSelectProps = {
  /** Label rendered as the button text when no values are selected. */
  placeholder: string;
  options: MultiSelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
  /** Extra class names on the root wrapper. */
  className?: string;
};

/**
 * ASCII-framed multi-select dropdown. Renders as a bracketed button
 * (`[ STRATEGY: 2 ▼ ]`) that expands to a checklist of options.
 * Clicks outside the panel close it; the Escape key closes it too.
 *
 * Deliberately minimalist — no search box, no virtualization. V1
 * expects dozens of options, not thousands. Bumping up would move to a
 * `<Combobox>` pattern.
 */
export function MultiSelect({
  placeholder,
  options,
  value,
  onChange,
  className,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggle(val: string) {
    onChange(value.includes(val) ? value.filter((v) => v !== val) : [...value, val]);
  }

  const summary =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? (options.find((o) => o.value === value[0])?.label ?? placeholder)
        : `${placeholder}: ${value.length}`;

  return (
    <div ref={rootRef} className={['relative inline-block', className ?? ''].join(' ').trim()}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className={[
          'font-mono text-xs whitespace-nowrap px-1 select-none',
          value.length > 0
            ? 'text-term-greenBright'
            : 'text-term-muted hover:text-term-greenBright',
        ].join(' ')}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        [ {summary} {open ? '▲' : '▼'} ]
      </button>
      {open ? (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute top-full left-0 z-20 mt-1 min-w-[12rem] max-h-64 overflow-auto bg-term-bg border border-term-green/60 font-mono text-xs"
        >
          {options.length === 0 ? (
            <div className="px-2 py-1 text-term-dim">— no options —</div>
          ) : (
            options.map((opt) => {
              const checked = value.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  onClick={() => toggle(opt.value)}
                  className={[
                    'w-full text-left px-2 py-1 flex items-center gap-2 whitespace-nowrap',
                    checked
                      ? 'text-term-greenBright bg-term-green/10'
                      : 'text-term-text hover:bg-term-green/10 hover:text-term-greenBright',
                  ].join(' ')}
                >
                  <span aria-hidden="true" className="select-none">
                    {checked ? '[x]' : '[ ]'}
                  </span>
                  <span>{opt.label}</span>
                </button>
              );
            })
          )}
          {value.length > 0 ? (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full text-left px-2 py-1 text-term-red hover:underline border-t border-term-green/40"
            >
              [ clear {value.length} ]
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
