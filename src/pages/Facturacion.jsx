import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    Receipt,
    Search,
    Clock,
    Mail,
    Euro,
    CheckCircle2,
    AlertCircle,
    FileText,
    Send,
    BookOpen,
    ArrowUpRight,
    Download
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import Sidebar from '../components/Sidebar';
import DataTable from '../components/DataTable';
import CustomSelect from '../components/CustomSelect';
import { useNotifications } from '../context/NotificationContext';
import { useGlobalLoading } from '../context/LoadingContext';

const ESTADO_FACTURA = {
    pendiente: { label: 'Pendiente', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
    enviada:   { label: 'Enviada',   color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
    pagada:    { label: 'Pagada',    color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
    cancelada: { label: 'Cancelada', color: 'bg-gray-500/10 text-gray-500 border-gray-500/20' }
};

export default function Facturacion() {
    const navigate = useNavigate();
    const { showNotification, confirm } = useNotifications();
    const { withLoading } = useGlobalLoading();
    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState([]);
    const [search, setSearch] = useState('');
    const [filterEstado, setFilterEstado] = useState('todos');
    const [filterFundae, setFilterFundae] = useState('todos'); // todos | con | sin

    const fetchFacturas = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('lead_billing')
                .select(`
                    *,
                    leads(
                        id,
                        nombre,
                        empresa_nombre,
                        email,
                        fundae_seguimiento(id, empresa, estado, num_asistentes),
                        clientes(id)
                    )
                `)
                .order('fecha_factura', { ascending: false, nullsFirst: false });
            if (error) throw error;
            setRows(data || []);
        } catch (err) {
            console.error('Error fetching facturas:', err);
            showNotification(`Error al cargar facturas: ${err.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFacturas();
        const channel = supabase
            .channel('facturacion-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_billing' }, fetchFacturas)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'fundae_seguimiento' }, fetchFacturas)
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, []);

    // Solo mostramos filas que tengan algún dato significativo de factura
    const facturas = rows.filter(r => r.numero_factura || r.factura_pdf_path || r.importe_factura > 0);

    const filtered = facturas.filter(f => {
        const q = search.trim().toLowerCase();
        if (q) {
            const hay = `${f.numero_factura || ''} ${f.razon_social || f.leads?.empresa_nombre || ''} ${f.cif || ''} ${f.leads?.email || ''} ${f.leads?.nombre || ''}`.toLowerCase();
            if (!hay.includes(q)) return false;
        }
        if (filterEstado !== 'todos' && f.estado_factura !== filterEstado) return false;
        const fundaes = f.leads?.fundae_seguimiento || [];
        const hasFundae = (Array.isArray(fundaes) ? fundaes.length : (fundaes ? 1 : 0)) > 0;
        if (filterFundae === 'con' && !hasFundae) return false;
        if (filterFundae === 'sin' && hasFundae) return false;
        return true;
    });

    const stats = {
        total: facturas.length,
        cobrado: facturas
            .filter(f => f.estado_factura === 'pagada')
            .reduce((s, f) => s + (parseFloat(f.importe_factura) || 0), 0),
        pendiente: facturas
            .filter(f => f.estado_factura !== 'pagada' && f.estado_factura !== 'cancelada')
            .reduce((s, f) => s + (parseFloat(f.importe_factura) || 0), 0),
        facturadoTotal: facturas
            .filter(f => f.estado_factura !== 'cancelada')
            .reduce((s, f) => s + (parseFloat(f.importe_factura) || 0), 0)
    };

    const handleDownload = async (f) => {
        if (!f.factura_pdf_path) {
            showNotification('Esta factura todavía no tiene PDF guardado.', 'error');
            return;
        }
        await withLoading(async () => {
            try {
                const { data, error } = await supabase.storage
                    .from('facturas')
                    .createSignedUrl(f.factura_pdf_path, 60);
                if (error) throw error;
                window.open(data.signedUrl, '_blank', 'noopener');
            } catch (err) {
                showNotification(`No se pudo descargar el PDF: ${err.message}`, 'error');
            }
        }, 'Generando enlace al PDF...');
    };

    const handleMarkEnviada = async (f) => {
        await withLoading(async () => {
            try {
                const { error } = await supabase
                    .from('lead_billing')
                    .update({
                        estado_factura: 'enviada',
                        fecha_factura_enviada: new Date().toISOString()
                    })
                    .eq('id', f.id);
                if (error) throw error;
                // Sincronizar paso del expediente FUNDAE
                const fundaes = f.leads?.fundae_seguimiento || [];
                const fundae = Array.isArray(fundaes) ? fundaes[0] : fundaes;
                if (fundae?.id) {
                    await supabase
                        .from('fundae_seguimiento')
                        .update({ factura_enviada: true })
                        .eq('id', fundae.id);
                }
                showNotification('✅ Factura marcada como enviada.');
            } catch (err) {
                showNotification(`Error: ${err.message}`, 'error');
            }
        }, 'Marcando factura como enviada...');
    };

    const handleMarkPagada = async (f) => {
        const ok = await confirm({
            title: 'Marcar factura como pagada',
            message: `Vas a marcar la factura ${f.numero_factura || ''} como pagada. Esto disparará automáticamente el envío del enlace de fichas de alumnos al cliente. ¿Continuar?`,
            confirmText: 'Sí, marcar pagada',
            cancelText: 'Cancelar'
        });
        if (!ok) return;
        await withLoading(async () => {
            try {
                const { error } = await supabase
                    .from('lead_billing')
                    .update({
                        estado_factura: 'pagada',
                        fecha_factura_pagada: new Date().toISOString()
                    })
                    .eq('id', f.id);
                if (error) throw error;
                showNotification('✅ Factura pagada. Se enviarán las fichas de alumnos al cliente.');
            } catch (err) {
                showNotification(`Error: ${err.message}`, 'error');
            }
        }, 'Marcando factura como pagada...');
    };

    return (
        <div className="flex min-h-screen transition-colors duration-300 overflow-hidden">
            <Sidebar />

            <main className="flex-1 p-4 sm:p-10 overflow-y-auto pb-32 md:pb-10">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-8 sm:mb-12">
                    <div>
                        <h1 className="text-2xl sm:text-4xl font-bold font-display tracking-tight mb-2 text-variable-main">Facturación</h1>
                        <p className="text-variable-muted">Todas las facturas emitidas a clientes</p>
                    </div>
                    <div className="flex items-center gap-4 w-full sm:w-auto">
                        <button onClick={fetchFacturas} className="p-3 glass rounded-2xl text-variable-muted hover:text-primary transition-all">
                            <Clock size={20} />
                        </button>
                    </div>
                </header>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
                    {[
                        { key: 'total', label: 'Facturas', value: stats.total, icon: Receipt, color: 'text-primary' },
                        { key: 'cobrado', label: 'Cobrado', value: `${Number(stats.cobrado).toLocaleString('es-ES', { maximumFractionDigits: 2 })} €`, icon: CheckCircle2, color: 'text-emerald-500' },
                        { key: 'pendiente', label: 'Pendiente', value: `${Number(stats.pendiente).toLocaleString('es-ES', { maximumFractionDigits: 2 })} €`, icon: AlertCircle, color: 'text-amber-500' },
                        { key: 'tot', label: 'Total facturado', value: `${Number(stats.facturadoTotal).toLocaleString('es-ES', { maximumFractionDigits: 2 })} €`, icon: Euro, color: 'text-blue-500' }
                    ].map(({ key, label, value, icon: Icon, color }) => (
                        <div key={key} className="glass rounded-2xl p-4 flex items-center gap-3">
                            <Icon size={20} className={color} />
                            <div>
                                <p className="text-xl font-black text-variable-main">{value}</p>
                                <p className="text-[10px] text-variable-muted uppercase font-bold tracking-widest">{label}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <DataTable
                    tableId="facturacion"
                    loading={loading}
                    data={filtered}
                    rowKey="id"
                    toolbarLeft={
                        <div className="flex flex-wrap items-center gap-3 w-full">
                            <div className="relative flex-1 min-w-[220px] max-w-md">
                                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-variable-muted pointer-events-none" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="w-full bg-white/5 border border-variable rounded-2xl pl-11 pr-5 py-2.5 focus:outline-none focus:border-primary/50 text-variable-main transition-all text-sm"
                                    placeholder="Buscar por nº, cliente, CIF o email..."
                                />
                            </div>
                            <div className="w-full sm:w-44">
                                <CustomSelect
                                    value={filterEstado}
                                    onChange={setFilterEstado}
                                    options={[
                                        { value: 'todos', label: 'Todos los estados' },
                                        { value: 'pendiente', label: 'Pendiente' },
                                        { value: 'enviada', label: 'Enviada' },
                                        { value: 'pagada', label: 'Pagada' },
                                        { value: 'cancelada', label: 'Cancelada' }
                                    ]}
                                />
                            </div>
                            <div className="w-full sm:w-44">
                                <CustomSelect
                                    value={filterFundae}
                                    onChange={setFilterFundae}
                                    options={[
                                        { value: 'todos', label: 'FUNDAE: todas' },
                                        { value: 'con', label: 'Con expediente' },
                                        { value: 'sin', label: 'Sin expediente' }
                                    ]}
                                />
                            </div>
                        </div>
                    }
                    columns={[
                        {
                            key: 'numero',
                            label: 'Nº Factura',
                            render: (f) => (
                                <div className="flex items-center gap-3">
                                    <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary flex-shrink-0">
                                        <FileText size={16} />
                                    </div>
                                    <div>
                                        <p className="font-bold text-variable-main text-sm">{f.numero_factura || '—'}</p>
                                        <p className="text-[10px] text-variable-muted uppercase font-black tracking-widest">
                                            {f.fecha_factura ? new Date(f.fecha_factura).toLocaleDateString('es-ES') : '—'}
                                        </p>
                                    </div>
                                </div>
                            )
                        },
                        {
                            key: 'cliente',
                            label: 'Cliente',
                            render: (f) => (
                                <div className="text-sm">
                                    <p className="font-bold text-variable-main">{f.razon_social || f.leads?.empresa_nombre || f.leads?.nombre || '—'}</p>
                                    {f.cif && <p className="text-[10px] text-variable-muted uppercase font-black tracking-widest">{f.cif}</p>}
                                    {f.leads?.email && (
                                        <div className="flex items-center gap-1 text-variable-muted mt-1">
                                            <Mail size={11} className="opacity-60" />
                                            <span className="truncate max-w-[200px] text-xs">{f.leads.email}</span>
                                        </div>
                                    )}
                                </div>
                            )
                        },
                        {
                            key: 'fundae',
                            label: 'FUNDAE',
                            render: (f) => {
                                const fundaes = f.leads?.fundae_seguimiento || [];
                                const fundae = Array.isArray(fundaes) ? fundaes[0] : fundaes;
                                if (!fundae?.id) return <span className="text-variable-muted text-[10px]">—</span>;
                                return (
                                    <Link
                                        to={`/fundae`}
                                        onClick={(e) => e.stopPropagation()}
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-500/10 text-blue-500 text-[10px] font-bold border border-blue-500/20 hover:bg-blue-500/20 transition-all"
                                    >
                                        <BookOpen size={11} /> {fundae.empresa || 'Expediente'}
                                    </Link>
                                );
                            }
                        },
                        {
                            key: 'base',
                            label: 'Base',
                            align: 'right',
                            render: (f) => (
                                <span className="text-xs text-variable-muted">
                                    {f.base_imponible != null ? `${Number(f.base_imponible).toLocaleString('es-ES', { maximumFractionDigits: 2 })} €` : '—'}
                                </span>
                            )
                        },
                        {
                            key: 'iva',
                            label: 'IVA',
                            align: 'right',
                            render: (f) => (
                                <span className="text-xs text-variable-muted">
                                    {f.iva_porcentaje != null ? `${f.iva_porcentaje}%` : '—'}
                                </span>
                            )
                        },
                        {
                            key: 'total',
                            label: 'Total',
                            align: 'right',
                            render: (f) => (
                                <span className="text-sm font-bold text-primary">
                                    {f.importe_factura ? `${Number(f.importe_factura).toLocaleString('es-ES', { maximumFractionDigits: 2 })} €` : '—'}
                                </span>
                            )
                        },
                        {
                            key: 'estado',
                            label: 'Estado',
                            align: 'center',
                            render: (f) => {
                                const cfg = ESTADO_FACTURA[f.estado_factura] || ESTADO_FACTURA.pendiente;
                                return (
                                    <div className="flex justify-center">
                                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border ${cfg.color}`}>
                                            {cfg.label}
                                        </span>
                                    </div>
                                );
                            }
                        },
                        {
                            key: 'actions',
                            label: '',
                            align: 'right',
                            render: (f) => (
                                <div className="flex items-center justify-end gap-1.5">
                                    {f.factura_pdf_path && (
                                        <button
                                            onClick={() => handleDownload(f)}
                                            title="Descargar PDF"
                                            className="p-2 glass rounded-xl text-blue-500 hover:bg-blue-500/10 transition-colors border border-transparent hover:border-blue-500/20"
                                        >
                                            <Download size={14} />
                                        </button>
                                    )}
                                    {f.estado_factura === 'pendiente' && f.factura_pdf_path && (
                                        <button
                                            onClick={() => handleMarkEnviada(f)}
                                            title="Marcar como enviada"
                                            className="p-2 glass rounded-xl text-variable-muted hover:text-primary transition-colors border border-transparent hover:border-primary/20"
                                        >
                                            <Send size={14} />
                                        </button>
                                    )}
                                    {(f.estado_factura === 'enviada' || f.estado_factura === 'pendiente') && (
                                        <button
                                            onClick={() => handleMarkPagada(f)}
                                            title="Marcar como pagada"
                                            className="p-2 glass rounded-xl text-emerald-500 hover:bg-emerald-500/10 transition-colors border border-transparent hover:border-emerald-500/20"
                                        >
                                            <CheckCircle2 size={14} />
                                        </button>
                                    )}
                                    {(() => {
                                        const cli = f.leads?.clientes;
                                        const cliId = Array.isArray(cli) ? cli[0]?.id : cli?.id;
                                        if (!cliId) return null;
                                        return (
                                            <Link
                                                to={`/clientes/${cliId}`}
                                                onClick={(e) => e.stopPropagation()}
                                                className="inline-flex items-center gap-1 px-3 py-2 glass rounded-xl text-variable-muted hover:text-primary transition-all text-xs font-bold"
                                            >
                                                Cliente <ArrowUpRight size={12} />
                                            </Link>
                                        );
                                    })()}
                                </div>
                            )
                        }
                    ]}
                />
            </main>
        </div>
    );
}
