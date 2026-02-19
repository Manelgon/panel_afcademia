import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
    ChevronUp,
    ChevronDown,
    ChevronsLeft,
    ChevronLeft,
    ChevronRight,
    ChevronsRight,
    Columns3,
    Eye,
    EyeOff,
} from 'lucide-react';

/**
 * DataTable — Reusable sortable + paginated table with column visibility toggle.
 *
 * Props:
 *  - tableId      : string — unique id used to persist column visibility in localStorage
 *  - columns      : [{ key, label, sortable?, align?, render?(row), hideable? }]
 *                   hideable defaults to true. Set to false to prevent hiding (e.g. actions).
 *  - data         : array of row objects
 *  - loading      : boolean
 *  - emptyIcon    : optional JSX for the empty-state icon
 *  - emptyTitle   : string shown when no data
 *  - emptySub     : string subtitle
 *  - rowKey       : string — property used as React key (default "id")
 *  - defaultSort  : { key, dir } (default none)
 *  - onRowClick   : optional callback(row)
 */
export default function DataTable({
    tableId = 'default',
    columns = [],
    data = [],
    loading = false,
    emptyIcon,
    emptyTitle = 'Sin datos',
    emptySub = '',
    rowKey = 'id',
    defaultSort,
    onRowClick,
}) {
    // ================================================================
    // COLUMN VISIBILITY  (persisted in localStorage)
    // ================================================================
    const storageKey = `datatable-cols-${tableId}`;

    const getInitialVisibility = () => {
        try {
            const saved = localStorage.getItem(storageKey);
            if (saved) {
                const parsed = JSON.parse(saved);
                // Validate: make sure every column key exists in the saved config.
                // If a new column was added after the user saved, default it to visible.
                const result = {};
                columns.forEach((col) => {
                    result[col.key] = parsed[col.key] !== undefined ? parsed[col.key] : true;
                });
                return result;
            }
        } catch { /* ignore corrupt localStorage */ }
        // Default: all columns visible
        const result = {};
        columns.forEach((col) => { result[col.key] = true; });
        return result;
    };

    const [colVisibility, setColVisibility] = useState(getInitialVisibility);
    const [colMenuOpen, setColMenuOpen] = useState(false);
    const colMenuRef = useRef(null);

    // Persist to localStorage whenever visibility changes
    useEffect(() => {
        localStorage.setItem(storageKey, JSON.stringify(colVisibility));
    }, [colVisibility, storageKey]);

    // Close menu on outside click
    useEffect(() => {
        const handler = (e) => {
            if (colMenuRef.current && !colMenuRef.current.contains(e.target)) {
                setColMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const toggleColumn = (key) => {
        setColVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    // Visible columns (filtered)
    const visibleColumns = columns.filter((col) => colVisibility[col.key] !== false);

    // Count of hideable columns that are currently visible
    const hideableColumns = columns.filter((col) => col.hideable !== false);
    const visibleHideableCount = hideableColumns.filter((col) => colVisibility[col.key] !== false).length;

    // ================================================================
    // SORTING
    // ================================================================
    const [sortKey, setSortKey] = useState(defaultSort?.key ?? null);
    const [sortDir, setSortDir] = useState(defaultSort?.dir ?? 'asc');

    const handleSort = (key) => {
        if (sortKey === key) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    };

    const sortedData = useMemo(() => {
        if (!sortKey) return data;
        const col = columns.find((c) => c.key === sortKey);
        if (!col) return data;

        return [...data].sort((a, b) => {
            let va = a[sortKey];
            let vb = b[sortKey];

            if (va == null) va = '';
            if (vb == null) vb = '';

            // Dates
            if (va instanceof Date || (typeof va === 'string' && !isNaN(Date.parse(va)))) {
                va = new Date(va).getTime();
                vb = new Date(vb).getTime();
            }

            // Numbers
            if (typeof va === 'number' && typeof vb === 'number') {
                return sortDir === 'asc' ? va - vb : vb - va;
            }

            // Strings
            const strA = String(va).toLowerCase();
            const strB = String(vb).toLowerCase();
            if (strA < strB) return sortDir === 'asc' ? -1 : 1;
            if (strA > strB) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
    }, [data, sortKey, sortDir, columns]);

    // ================================================================
    // PAGINATION
    // ================================================================
    const pageSizeOptions = [10, 20, 50, 100];
    const [pageSize, setPageSize] = useState(10);
    const [currentPage, setCurrentPage] = useState(1);

    const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
    const safePage = Math.min(currentPage, totalPages);
    if (safePage !== currentPage) setCurrentPage(safePage);

    const paged = sortedData.slice((safePage - 1) * pageSize, safePage * pageSize);
    const goTo = (p) => setCurrentPage(Math.max(1, Math.min(totalPages, p)));

    // ================================================================
    // RENDER
    // ================================================================
    return (
        <div className="glass rounded-[1.5rem] sm:rounded-[2.5rem] p-4 sm:p-8">
            {/* ----- TOOLBAR (column selector) ----- */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div className="flex-1 min-w-0">
                    {/* Optional: Add search or breadcrumbs here in the future */}
                </div>

                <div ref={colMenuRef} className="relative">
                    <button
                        type="button"
                        onClick={() => setColMenuOpen((v) => !v)}
                        className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-[10px] sm:text-xs font-bold uppercase tracking-widest transition-all border"
                        style={{
                            borderColor: colMenuOpen ? 'var(--primary)' : 'rgba(243,121,27,0.25)',
                            backgroundColor: colMenuOpen ? 'rgba(243,121,27,0.1)' : 'rgba(255,255,255,0.03)',
                            color: colMenuOpen ? 'var(--primary)' : 'var(--text-muted)',
                            boxShadow: colMenuOpen
                                ? '0 0 0 3px rgba(243,121,27,0.1), 0 0 12px rgba(243,121,27,0.08)'
                                : 'none',
                        }}
                    >
                        <Columns3 size={15} />
                        <span className="hidden xs:inline">Columnas</span>
                        <span
                            className="px-1.5 py-0.5 rounded-lg text-[10px] font-black"
                            style={{
                                backgroundColor: 'rgba(243,121,27,0.15)',
                                color: 'var(--primary)',
                            }}
                        >
                            {visibleHideableCount}/{hideableColumns.length}
                        </span>
                    </button>

                    {/* Dropdown panel */}
                    {colMenuOpen && (
                        <div
                            className="absolute right-0 z-[80] mt-2 w-64 rounded-2xl overflow-hidden shadow-2xl"
                            style={{
                                border: '1.5px solid rgba(243,121,27,0.35)',
                                backgroundColor: 'var(--bg-main)',
                                backdropFilter: 'blur(24px)',
                                WebkitBackdropFilter: 'blur(24px)',
                            }}
                        >
                            {/* Header */}
                            <div
                                className="px-4 py-3 border-b flex items-center justify-between"
                                style={{ borderColor: 'rgba(243,121,27,0.15)' }}
                            >
                                <span className="text-xs font-black uppercase tracking-widest" style={{ color: 'var(--primary)' }}>
                                    Mostrar / Ocultar
                                </span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const reset = {};
                                        columns.forEach((col) => { reset[col.key] = true; });
                                        setColVisibility(reset);
                                    }}
                                    className="text-[10px] font-bold uppercase tracking-widest transition-colors"
                                    style={{ color: 'var(--text-muted)' }}
                                >
                                    Mostrar todas
                                </button>
                            </div>

                            {/* Column toggles */}
                            <ul className="custom-select-list overflow-y-auto py-1" style={{ maxHeight: '260px' }}>
                                {columns.map((col) => {
                                    const isHideable = col.hideable !== false;
                                    const isVisible = colVisibility[col.key] !== false;

                                    return (
                                        <li key={col.key}>
                                            <button
                                                type="button"
                                                disabled={!isHideable}
                                                onClick={() => isHideable && toggleColumn(col.key)}
                                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors duration-150"
                                                style={{
                                                    color: !isHideable
                                                        ? 'var(--text-muted)'
                                                        : isVisible
                                                            ? 'var(--text-main)'
                                                            : 'var(--text-muted)',
                                                    opacity: !isHideable ? 0.5 : 1,
                                                    cursor: isHideable ? 'pointer' : 'not-allowed',
                                                }}
                                            >
                                                {/* Toggle icon */}
                                                <span
                                                    className="shrink-0 size-5 rounded-lg flex items-center justify-center transition-all"
                                                    style={{
                                                        backgroundColor: isVisible
                                                            ? 'rgba(243,121,27,0.2)'
                                                            : 'rgba(255,255,255,0.05)',
                                                        border: isVisible
                                                            ? '1.5px solid var(--primary)'
                                                            : '1.5px solid rgba(255,255,255,0.1)',
                                                    }}
                                                >
                                                    {isVisible
                                                        ? <Eye size={12} style={{ color: 'var(--primary)' }} />
                                                        : <EyeOff size={12} style={{ color: 'var(--text-muted)' }} />
                                                    }
                                                </span>
                                                <span className="flex-1 text-left truncate">{col.label}</span>
                                                {!isHideable && (
                                                    <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                                                        Fija
                                                    </span>
                                                )}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}
                </div>
            </div>

            {/* ----- TABLE ----- */}
            <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
                <table className="w-full text-left min-w-[600px] sm:min-w-full">
                    {/* HEAD */}
                    <thead className="text-variable-muted text-[10px] sm:text-xs uppercase tracking-[0.2em] font-bold border-b border-variable">
                        <tr>
                            {visibleColumns.map((col) => (
                                <th
                                    key={col.key}
                                    className={`pb-4 sm:pb-6 ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : ''} ${col.sortable !== false ? 'cursor-pointer select-none group' : ''}`}
                                    onClick={() => col.sortable !== false && handleSort(col.key)}
                                >
                                    <span className="inline-flex items-center gap-1.5">
                                        {col.label}
                                        {col.sortable !== false && (
                                            <span className="inline-flex flex-col -space-y-1 opacity-40 group-hover:opacity-100 transition-opacity">
                                                <ChevronUp
                                                    size={10}
                                                    className={sortKey === col.key && sortDir === 'asc' ? 'text-primary !opacity-100' : ''}
                                                    style={sortKey === col.key && sortDir === 'asc' ? { opacity: 1 } : {}}
                                                />
                                                <ChevronDown
                                                    size={10}
                                                    className={sortKey === col.key && sortDir === 'desc' ? 'text-primary !opacity-100' : ''}
                                                    style={sortKey === col.key && sortDir === 'desc' ? { opacity: 1 } : {}}
                                                />
                                            </span>
                                        )}
                                    </span>
                                </th>
                            ))}
                        </tr>
                    </thead>

                    {/* BODY */}
                    <tbody className="divide-y divide-variable">
                        {loading && data.length === 0 ? (
                            <tr>
                                <td colSpan={visibleColumns.length} className="py-20 text-center">
                                    <div className="flex flex-col items-center gap-4">
                                        <div className="size-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                                        <p className="text-variable-muted font-medium">Cargando...</p>
                                    </div>
                                </td>
                            </tr>
                        ) : data.length === 0 ? (
                            <tr>
                                <td colSpan={visibleColumns.length} className="py-20 text-center">
                                    <div className="flex flex-col items-center gap-4 text-variable-muted">
                                        {emptyIcon}
                                        <p className="font-medium">{emptyTitle}</p>
                                        {emptySub && <p className="text-xs italic">{emptySub}</p>}
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            paged.map((row) => (
                                <tr
                                    key={row[rowKey]}
                                    className={`group hover:bg-white/[0.02] transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
                                    onClick={() => onRowClick?.(row)}
                                >
                                    {visibleColumns.map((col) => (
                                        <td
                                            key={col.key}
                                            className={`py-4 sm:py-6 ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : ''}`}
                                        >
                                            <div className="min-h-[1.5rem] flex items-center">
                                                {col.render ? col.render(row) : row[col.key]}
                                            </div>
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* ----- PAGINATION BAR ----- */}
            {data.length > 0 && (
                <div className="flex flex-col items-center justify-between gap-6 mt-6 pt-6 border-t border-variable lg:flex-row">
                    {/* Rows per page */}
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] text-variable-muted font-bold uppercase tracking-widest">Mostrar</span>
                        <div className="flex gap-1">
                            {pageSizeOptions.map((n) => (
                                <button
                                    key={n}
                                    onClick={() => { setPageSize(n); setCurrentPage(1); }}
                                    className={`
                                        px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all border
                                        ${pageSize === n
                                            ? 'bg-primary/20 border-primary text-primary shadow-sm shadow-primary/10'
                                            : 'bg-white/5 border-variable text-variable-muted hover:border-primary/30 hover:text-primary'
                                        }
                                    `}
                                    style={pageSize === n ? { borderColor: 'var(--primary)' } : {}}
                                >
                                    {n}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Center: info */}
                    <span className="text-[10px] sm:text-xs text-variable-muted font-medium tracking-wide order-last lg:order-none">
                        {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, sortedData.length)} de <strong className="text-variable-main">{sortedData.length}</strong>
                    </span>

                    {/* Page navigation */}
                    <div className="flex items-center gap-1 overflow-x-auto pb-1 max-w-full">
                        <PageBtn onClick={() => goTo(1)} disabled={safePage === 1} title="Primera">
                            <ChevronsLeft size={14} />
                        </PageBtn>
                        <PageBtn onClick={() => goTo(safePage - 1)} disabled={safePage === 1} title="Anterior">
                            <ChevronLeft size={14} />
                        </PageBtn>

                        <div className="flex items-center gap-1 mx-1">
                            {getPageNumbers(safePage, totalPages).map((p, i) =>
                                p === '...' ? (
                                    <span key={`dots-${i}`} className="px-1 text-variable-muted text-xs">…</span>
                                ) : (
                                    <button
                                        key={p}
                                        onClick={() => goTo(p)}
                                        className={`
                                            size-8 min-w-[2rem] rounded-xl text-[10px] font-bold transition-all border
                                            ${p === safePage
                                                ? 'bg-primary text-white border-primary shadow-md shadow-primary/20'
                                                : 'bg-white/5 border-variable text-variable-muted hover:border-primary/30 hover:text-primary'
                                            }
                                        `}
                                        style={p === safePage ? { borderColor: 'var(--primary)' } : {}}
                                    >
                                        {p}
                                    </button>
                                )
                            )}
                        </div>

                        <PageBtn onClick={() => goTo(safePage + 1)} disabled={safePage === totalPages} title="Siguiente">
                            <ChevronRight size={14} />
                        </PageBtn>
                        <PageBtn onClick={() => goTo(totalPages)} disabled={safePage === totalPages} title="Última">
                            <ChevronsRight size={14} />
                        </PageBtn>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ---------- helpers ---------- */

function PageBtn({ onClick, disabled, title, children }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={title}
            className={`
                size-8 rounded-xl flex items-center justify-center transition-all border
                ${disabled
                    ? 'opacity-30 cursor-not-allowed bg-white/5 border-variable text-variable-muted'
                    : 'bg-white/5 border-variable text-variable-muted hover:border-primary/30 hover:text-primary'
                }
            `}
        >
            {children}
        </button>
    );
}

function getPageNumbers(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

    const pages = [];
    pages.push(1);

    if (current > 3) pages.push('...');

    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let i = start; i <= end; i++) pages.push(i);

    if (current < total - 2) pages.push('...');

    pages.push(total);
    return pages;
}
