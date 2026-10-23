import { useEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function ActionSheet({ title, onClose, children }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    const focusable = () => [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]')].filter(e => e.getClientRects().length);
    focusable()[0]?.focus();
    function keydown(e) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === 'Tab') {
        const nodes = focusable(), first = nodes[0], last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }
    dialog.addEventListener('keydown', keydown);
    return () => { dialog.removeEventListener('keydown', keydown); if (previous?.isConnected) previous.focus(); };
  }, [onClose]);
  return createPortal(<div className="sheet-overlay feature-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section ref={ref} className="sheet feature-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="sheet-grabber" aria-hidden="true" />
      <button className="sheet-close" aria-label={`Close ${title}`} onClick={onClose}><X size={18} /></button>
      <div className="sheet-body"><h2 id={titleId} className="sheet-title">{title}</h2>{children}</div>
    </section>
  </div>, document.body);
}
