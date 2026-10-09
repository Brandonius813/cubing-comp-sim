import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import './select.css';

export interface SelectOption { value: string; label: string }
/** A consistently aligned, keyboard-operable menu in the browser's top layer. */
export function Select({ value, onChange, options, label, disabled = false }: {
  value: string; onChange: (value: string) => void; options: readonly SelectOption[]; label: string; disabled?: boolean;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<CSSProperties>({});
  const search = useRef({ text: '', at: 0 });
  const selected = Math.max(0, options.findIndex(option => option.value === value));
  const close = (restore = true) => { setOpen(false); if (restore) trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const element = menu.current;
    const button = trigger.current;
    if (!element || !button) return;
    const place = () => {
      const rect = button.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width, 200), window.innerWidth - 24);
      const below = window.innerHeight - rect.bottom - 16;
      const above = rect.top - 16;
      const upwards = below < 200 && above > below;
      const height = Math.max(80, Math.min(320, upwards ? above : below));
      setPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), width, maxHeight: height,
        top: upwards ? 'auto' : rect.bottom + 6, bottom: upwards ? window.innerHeight - rect.top + 6 : 'auto' });
    };
    place();
    element.showPopover?.();
    element.focus();
    const outside = (event: PointerEvent) => { if (!element.contains(event.target as Node) && !button.contains(event.target as Node)) close(false); };
    const focus = (event: FocusEvent) => { if (!element.contains(event.target as Node) && !button.contains(event.target as Node)) close(false); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', focus);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { element.hidePopover?.(); document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', focus); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);
  useEffect(() => { if (open) menu.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [open, active]);
  const choose = (index: number) => { const option = options[index]; if (option) onChange(option.value); close(); };
  const onKeyDown = (event: KeyboardEvent) => {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Escape'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); }
    if (event.key === 'ArrowDown') setActive(index => (index + 1) % options.length);
    else if (event.key === 'ArrowUp') setActive(index => (index - 1 + options.length) % options.length);
    else if (event.key === 'Home') setActive(0);
    else if (event.key === 'End') setActive(options.length - 1);
    else if (event.key === 'Enter' || event.key === ' ') choose(active);
    else if (event.key === 'Escape') close();
    else if (event.key === 'Tab') {
      event.preventDefault();
      const scope = trigger.current?.closest('dialog') ?? document;
      const controls = Array.from(scope.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'))
        .filter(element => element.getClientRects().length > 0 && !menu.current?.contains(element));
      const index = controls.indexOf(trigger.current!);
      const next = controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length];
      close(false); next?.focus();
    }
    else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const now = Date.now(); search.current = { text: (now - search.current.at < 700 ? search.current.text : '') + event.key.toLocaleLowerCase(), at: now };
      const index = options.findIndex(option => option.label.toLocaleLowerCase().startsWith(search.current.text));
      if (index >= 0) setActive(index);
    }
  };
  return <div className="app-select">
    <button ref={trigger} type="button" role="combobox" data-value={value} aria-label={label} aria-expanded={open} aria-haspopup="listbox" aria-controls={open ? id : undefined} className="select-trigger" disabled={disabled}
      onClick={() => { setActive(selected); setOpen(!open); }} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setActive(selected); setOpen(true); } }}>
      <span>{options[selected]?.label ?? value}</span><svg width="12" height="16" viewBox="0 0 12 16" aria-hidden="true"><path d="m3 6 3-3 3 3M3 10l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    {open && <div ref={menu} id={id} popover="manual" role="listbox" tabIndex={-1} aria-label={label} aria-activedescendant={`${id}-${active}`} className="select-menu" style={position} onKeyDown={onKeyDown}>
      {options.map((option, index) => <div key={option.value} id={`${id}-${index}`} data-index={index} data-value={option.value} role="option" aria-selected={option.value === value} className={`select-option ${active === index ? 'active' : ''}`} onPointerMove={() => setActive(index)} onClick={() => choose(index)}><span>{option.label}</span><span aria-hidden="true">{option.value === value ? '✓' : ''}</span></div>)}
    </div>}
  </div>;
}
