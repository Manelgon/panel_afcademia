import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * CustomSelect — Fully stylised dropdown with orange borders,
 * rounded corners and a custom scrollbar.
 *
 * Props:
 *  - value        : current value
 *  - onChange      : callback(value)
 *  - options       : [{ value, label }]
 *  - placeholder   : string (default "Seleccionar...")
 *  - className     : extra wrapper classes
 *  - icon          : optional Lucide icon component rendered inside the trigger
 *  - width         : optional explicit width (e.g. "120px", "100%")
 */
export default function CustomSelect({
    value,
    onChange,
    options = [],
    placeholder = 'Seleccionar...',
    className = '',
    icon: Icon,
    width,
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    // Close on outside click
    useEffect(() => {
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const selected = options.find((o) => o.value === value);

    return (
        <div
            ref={ref}
            className={`relative ${className}`}
            style={width ? { width } : undefined}
        >
            {/* ---- Trigger button ---- */}
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="
                    w-full flex items-center gap-2
                    bg-white/5 text-variable-main
                    border-[1.5px] border-[var(--primary)]/40
                    rounded-2xl px-4 py-3
                    focus:outline-none
                    transition-all duration-200
                    cursor-pointer select-none
                    hover:border-[var(--primary)]/70
                "
                style={{
                    borderColor: open
                        ? 'var(--primary)'
                        : 'rgba(243,121,27,0.35)',
                    boxShadow: open
                        ? '0 0 0 3px rgba(243,121,27,0.12), 0 0 16px rgba(243,121,27,0.1)'
                        : 'none',
                }}
            >
                {Icon && (
                    <Icon
                        size={18}
                        className="text-variable-muted shrink-0"
                    />
                )}
                <span className="flex-1 text-left truncate text-sm">
                    {selected ? selected.label : (
                        <span className="text-variable-muted">{placeholder}</span>
                    )}
                </span>
                <ChevronDown
                    size={16}
                    className={`text-primary shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                />
            </button>

            {/* ---- Dropdown panel ---- */}
            {open && (
                <div
                    className="absolute z-[100] mt-2 w-full rounded-2xl overflow-hidden shadow-2xl"
                    style={{
                        border: '1.5px solid rgba(243,121,27,0.4)',
                        backgroundColor: 'var(--bg-main)',
                        backdropFilter: 'blur(24px)',
                        WebkitBackdropFilter: 'blur(24px)',
                    }}
                >
                    <ul
                        className="custom-select-list overflow-y-auto py-1"
                        style={{ maxHeight: '220px' }}
                    >
                        {options.map((opt) => {
                            const isActive = opt.value === value;
                            return (
                                <li key={opt.value}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onChange(opt.value);
                                            setOpen(false);
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm font-medium transition-colors duration-150"
                                        style={{
                                            backgroundColor: isActive ? 'rgba(243,121,27,0.15)' : 'transparent',
                                            color: isActive ? 'var(--primary)' : 'var(--text-main)',
                                        }}
                                        onMouseEnter={(e) => {
                                            if (!isActive) {
                                                e.currentTarget.style.backgroundColor = 'rgba(243,121,27,0.1)';
                                                e.currentTarget.style.color = 'var(--primary)';
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            if (!isActive) {
                                                e.currentTarget.style.backgroundColor = 'transparent';
                                                e.currentTarget.style.color = 'var(--text-main)';
                                            }
                                        }}
                                    >
                                        {opt.label}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}
