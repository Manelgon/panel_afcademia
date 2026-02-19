import React, { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react';

/**
 * DataTable — Reusable sortable + paginated table.
 *
 * Props:
 *  - columns    : [{ key, label, sortable?, align?, render?(row) }]
 *  - data       : array of row objects
 *  - loading    : boolean
 *  - emptyIcon  : optional JSX for the empty-state icon
 *  - emptyTitle : string shown when no data
 *  - emptySub   : string subtitle
 *  - rowKey     : string — property used as React key (default "id")
 *  - defaultSort: { key, dir } (default none)
 *  - onRowClick : optional callback(row)
 */
export default function DataTable({
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
    // ---- Sorting ----
    const [sortKey, setSortKey] = useState(defaultSort?.key ?? null);
    const [sortDir, setSortDir] = useState(defaultSort?.dir ?? 'asc'); // 'asc' | 'desc'

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

            // Handle null / undefined
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

    // ---- Pagination ----
    const pageSizeOptions = [10, 20, 50, 100];
    const [pageSize, setPageSize] = useState(10);
    const [currentPage, setCurrentPage] = useState(1);

    // Reset page when data changes
    const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
    const safePage = Math.min(currentPage, totalPages);
    if (safePage !== currentPage) setCurrentPage(safePage);

    const paged = sortedData.slice((safePage - 1) * pageSize, safePage * pageSize);

    const goTo = (p) => setCurrentPage(Math.max(1, Math.min(totalPages, p)));

    // ---- Render ----
    return (
        <div className="glass rounded-[2.5rem] p-8">
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    {/* ----- HEAD ----- */}
                    <thead className="text-variable-muted text-xs uppercase tracking-[0.2em] font-bold border-b border-variable">
                        <tr>
                            {columns.map((col) => (
                                <th
                                    key={col.key}
                                    className={`pb-6 ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : ''} ${col.sortable !== false ? 'cursor-pointer select-none group' : ''}`}
                                    onClick={() => col.sortable !== false && handleSort(col.key)}
                                >
                                    <span className="inline-flex items-center gap-1.5">
                                        {col.label}
                                        {col.sortable !== false && (
                                            <span className="inline-flex flex-col -space-y-1 opacity-40 group-hover:opacity-100 transition-opacity">
                                                <ChevronUp
                                                    size={12}
                                                    className={sortKey === col.key && sortDir === 'asc' ? 'text-primary !opacity-100' : ''}
                                                    style={sortKey === col.key && sortDir === 'asc' ? { opacity: 1 } : {}}
                                                />
                                                <ChevronDown
                                                    size={12}
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

                    {/* ----- BODY ----- */}
                    <tbody className="divide-y divide-variable">
                        {loading && data.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length} className="py-20 text-center">
                                    <div className="flex flex-col items-center gap-4">
                                        <div className="size-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                                        <p className="text-variable-muted font-medium">Conectando con Supabase...</p>
                                    </div>
                                </td>
                            </tr>
                        ) : data.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length} className="py-20 text-center">
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
                                    {columns.map((col) => (
                                        <td
                                            key={col.key}
                                            className={`py-6 ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : ''}`}
                                        >
                                            {col.render ? col.render(row) : row[col.key]}
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
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-6 border-t border-variable">
                    {/* Left: rows per page */}
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-variable-muted font-bold uppercase tracking-widest">Mostrar</span>
                        <div className="flex gap-1">
                            {pageSizeOptions.map((n) => (
                                <button
                                    key={n}
                                    onClick={() => { setPageSize(n); setCurrentPage(1); }}
                                    className={`
                                        px-3 py-1.5 rounded-xl text-xs font-bold transition-all border
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
                    <span className="text-xs text-variable-muted font-medium tracking-wide">
                        {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, sortedData.length)} de <strong className="text-variable-main">{sortedData.length}</strong>
                    </span>

                    {/* Right: page navigation */}
                    <div className="flex items-center gap-1">
                        <PageBtn onClick={() => goTo(1)} disabled={safePage === 1} title="Primera">
                            <ChevronsLeft size={16} />
                        </PageBtn>
                        <PageBtn onClick={() => goTo(safePage - 1)} disabled={safePage === 1} title="Anterior">
                            <ChevronLeft size={16} />
                        </PageBtn>

                        {/* Page numbers */}
                        {getPageNumbers(safePage, totalPages).map((p, i) =>
                            p === '...' ? (
                                <span key={`dots-${i}`} className="px-1 text-variable-muted text-xs">…</span>
                            ) : (
                                <button
                                    key={p}
                                    onClick={() => goTo(p)}
                                    className={`
                                        size-8 rounded-xl text-xs font-bold transition-all border
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

                        <PageBtn onClick={() => goTo(safePage + 1)} disabled={safePage === totalPages} title="Siguiente">
                            <ChevronRight size={16} />
                        </PageBtn>
                        <PageBtn onClick={() => goTo(totalPages)} disabled={safePage === totalPages} title="Última">
                            <ChevronsRight size={16} />
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
