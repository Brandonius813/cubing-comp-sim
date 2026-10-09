import { useEffect, useId, useRef, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { t } from './i18n';

export function Icon({ name, event = false }: { name: string; event?: boolean }) {
  return <span className={event ? 'event-icon' : 'icon'} aria-hidden="true"><img src={`/assets/${event ? 'event-' : ''}${name}.svg`} alt="" /></span>;
}
export function IconButton({ name, label, ...props }: { name: string; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className="icon-button" aria-label={label} title={label} {...props}><Icon name={name} /></button>;
}
export function FlowButton({ children, shortcut, secondary = false, ...props }: { children: ReactNode; shortcut?: string; secondary?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={`flow-button ${secondary ? 'secondary' : ''}`} {...props}>{children}{shortcut && <span className="shortcut-tooltip" aria-hidden="true">{shortcut}</span>}</button>;
}
export function Dialog({ title, children, onClose, className = '', headerContent, returnFocus }: { title: string; children: ReactNode; onClose: () => void; className?: string; headerContent?: ReactNode; returnFocus?: () => HTMLElement | null }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; ref.current?.showModal(); return () => { ref.current?.close(); (returnFocus?.() ?? previous)?.focus({ preventScroll: true }); }; }, []);
  return <dialog ref={ref} className={`dialog ${className}`} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose(); } }}><header className="dialog-header"><h1 id={titleId}>{title}</h1>{headerContent}<IconButton name="close" label={t('close')} onClick={onClose} /></header><div className="dialog-body">{children}</div></dialog>;
}
export { Select } from './Select';
export function Toggle({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" className="toggle" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}><span /></button>;
}
