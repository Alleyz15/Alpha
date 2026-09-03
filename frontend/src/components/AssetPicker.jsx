import { useEffect, useRef, useState } from 'react';
import AssetLogo, { ASSET_IDENTITIES, getAssetIdentity } from './AssetLogo.jsx';
import { ChevronIcon } from './Icons.jsx';

const DEFAULT_OPTIONS = Object.keys(ASSET_IDENTITIES);

/**
 * A button-triggered asset dropdown, standing in for a native <select> so the
 * chosen asset can show its logo - option elements cannot render components.
 * Meant to be used as a FormField child: FormField clones id/required/
 * aria-describedby/aria-invalid onto whatever child it wraps, so those land
 * on the trigger button via ...triggerProps.
 */
export default function AssetPicker({
  id,
  value,
  onChange,
  options = DEFAULT_OPTIONS,
  disabled = false,
  className = '',
  ...triggerProps
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = getAssetIdentity(value);

  useEffect(() => {
    if (!open) return undefined;
    const closeIfOutside = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeIfOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeIfOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div className={['asset-picker', className].filter(Boolean).join(' ')} ref={rootRef}>
      <button
        {...triggerProps}
        id={id}
        type="button"
        className="asset-picker__trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <AssetLogo symbol={selected.symbol} name={selected.name} size="xsmall" />
        <span>{selected.name} ({selected.symbol})</span>
        <ChevronIcon size={14} />
      </button>

      {open && (
        <ul className="asset-picker__list" role="listbox" aria-label="Asset">
          {options.map((symbol) => {
            const identity = getAssetIdentity(symbol);
            return (
              <li key={symbol} role="option" aria-selected={symbol === value}>
                <button
                  type="button"
                  className={symbol === value ? 'is-selected' : ''}
                  onClick={() => { onChange?.(symbol); setOpen(false); }}
                >
                  <AssetLogo symbol={identity.symbol} name={identity.name} size="small" />
                  <span>{identity.name} ({identity.symbol})</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
