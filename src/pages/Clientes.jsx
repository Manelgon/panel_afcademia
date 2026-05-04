import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    Users as UsersIcon,
    Search,
    Clock,
    Building2,
    Mail,
    Phone,
    BookOpen,
    Euro,
    ArrowUpRight,
    Filter,
    CheckCircle2,
    Briefcase
} from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import Sidebar from '../components/Sidebar';
import DataTable from '../components/DataTable';
import CustomSelect from '../components/CustomSelect';
import { useNotifications } from '../context/NotificationContext';

export default function Clientes() {
    const navigate = useNavigate();
    const { showNotification } = useNotifications();
    const [loading, setLoading] = useState(false);
    const [clientes, setClientes] = useState([]);
    const [search, setSearch] = useState('');
    const [filterFundae, setFilterFundae] = useState('todos'); // todos | con | sin

    const fetchClientes = async () => {
        setLoading(true);
        try {
            // Un cliente = un lead con flujos_embudo.status_actual = 'convertido'
            const { data, error } = await supabase
                .from('leads')
                .select(`
                    *,
                    flujos_embudo!inner(status_actual, actividad, tags_proceso),
                    segmentacion_despacho(num_comunidades, interes_fundae, software_actual),
                    lead_billing(razon_social, importe_factura, estado_factura),
                    fundae_seguimiento(id, estado, creditos_fundae, facturado, pagado)
                `)
                .eq('flujos_embudo.status_actual', 'convertido')
                .order('fecha_creacion', { ascending: false });

            if (error) throw error;
            setClientes(data || []);
        } catch (err) {
            console.error('Error fetching clientes:', err);
            showNotification(`Error al cargar clientes: ${err.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchClientes();
        const channel = supabase
            .channel('clientes-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, fetchClientes)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'flujos_embudo' }, fetchClientes)
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, []);

    // Filtrado por búsqueda y FUNDAE
    const filtered = clientes.filter(c => {
        // Búsqueda por nombre, empresa o email
        const q = search.trim().toLowerCase();
        if (q) {
            const haystack = `${c.nombre || ''} ${c.empresa_nombre || ''} ${c.email || ''}`.toLowerCase();
            if (!haystack.includes(q)) return false;
        }
        // Filtro FUNDAE
        const hasFundae = (c.fundae_seguimiento?.length || 0) > 0;
        if (filterFundae === 'con' && !hasFundae) return false;
        if (filterFundae === 'sin' && hasFundae) return false;
        return true;
    });

    // Stats agregadas
    const stats = {
        total: clientes.length,
        conFundae: clientes.filter(c => (c.fundae_seguimiento?.length || 0) > 0).length,
        importeTotal: clientes.reduce((sum, c) => {
            const facturas = c.lead_billing || [];
            const total = (Array.isArray(facturas) ? facturas : [facturas])
                .reduce((s, f) => s + (parseFloat(f?.importe_factura) || 0), 0);
            return sum + total;
        }, 0),
        activos: clientes.filter(c => c.flujos_embudo?.[0]?.actividad === 'lead_activo').length
    };

    return (
        <div className="flex min-h-screen transition-colors duration-300 overflow-hidden">
            <Sidebar />

            <main className="flex-1 p-4 sm:p-10 overflow-y-auto pb-32 md:pb-10">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-8 sm:mb-12">
                    <div>
                        <h1 className="text-2xl sm:text-4xl font-bold font-display tracking-tight mb-2 text-variable-main">Clientes</h1>
                        <p className="text-variable-muted">Despachos convertidos y operativos en AFCademIA</p>
                    </div>
                    <div className="flex items-center gap-4 w-full sm:w-auto">
                        <button onClick={fetchClientes} className="p-3 glass rounded-2xl text-variable-muted hover:text-primary transition-all">
                            <Clock size={20} />
                        </button>
                    </div>
                </header>

                {/* Stats */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
                    {[
                        { key: 'total', label: 'Clientes', value: stats.total, icon: Briefcase, color: 'text-primary' },
                        { key: 'activos', label: 'Activos', value: stats.activos, icon: CheckCircle2, color: 'text-emerald-500' },
                        { key: 'conFundae', label: 'Con FUNDAE', value: stats.conFundae, icon: BookOpen, color: 'text-blue-500' },
                        { key: 'importe', label: 'Facturado €', value: `${Number(stats.importeTotal).toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`, icon: Euro, color: 'text-amber-500' }
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

                {/* Filtros */}
                <div className="flex flex-wrap items-center gap-4 mb-6">
                    <div className="relative flex-1 min-w-[260px]">
                        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-variable-muted pointer-events-none" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-white/5 border border-variable rounded-2xl pl-11 pr-5 py-3.5 focus:outline-none focus:border-primary/50 text-variable-main transition-all text-sm"
                            placeholder="Buscar por nombre, empresa o email..."
                        />
                    </div>
                    <div className="w-full sm:w-56">
                        <CustomSelect
                            value={filterFundae}
                            onChange={setFilterFundae}
                            options={[
                                { value: 'todos', label: 'Todos los clientes' },
                                { value: 'con', label: 'Con expediente FUNDAE' },
                                { value: 'sin', label: 'Sin expediente FUNDAE' }
                            ]}
                        />
                    </div>
                </div>

                <DataTable
                    tableId="clientes"
                    loading={loading}
                    data={filtered}
                    rowKey="id"
                    onRowClick={(c) => navigate(`/clientes/${c.id}`)}
                    columns={[
                        {
                            key: 'cliente',
                            label: 'Cliente',
                            render: (c) => (
                                <div className="flex items-center gap-3">
                                    <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-black text-sm flex-shrink-0">
                                        {(c.empresa_nombre || c.nombre || '?').slice(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="font-bold text-variable-main">{c.empresa_nombre || c.nombre}</p>
                                        <p className="text-[10px] text-variable-muted uppercase font-black tracking-widest">{c.nombre}</p>
                                    </div>
                                </div>
                            )
                        },
                        {
                            key: 'contacto',
                            label: 'Contacto',
                            render: (c) => (
                                <div className="text-sm">
                                    <div className="flex items-center gap-2 text-variable-muted">
                                        <Mail size={12} className="opacity-60" />
                                        <span className="truncate max-w-[200px]">{c.email || '—'}</span>
                                    </div>
                                    {c.whatsapp && (
                                        <div className="flex items-center gap-2 text-variable-muted mt-1">
                                            <Phone size={12} className="opacity-60" />
                                            <span>{c.whatsapp}</span>
                                        </div>
                                    )}
                                </div>
                            )
                        },
                        {
                            key: 'comunidades',
                            label: 'Comunidades',
                            render: (c) => {
                                const segData = c.segmentacion_despacho;
                                const seg = Array.isArray(segData) ? segData[0] : segData;
                                return (
                                    <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-500 text-[10px] font-bold">
                                        {seg?.num_comunidades || '—'}
                                    </span>
                                );
                            }
                        },
                        {
                            key: 'fundae',
                            label: 'FUNDAE',
                            render: (c) => {
                                const expedientes = c.fundae_seguimiento || [];
                                if (!expedientes.length) {
                                    return <span className="text-variable-muted text-[10px]">—</span>;
                                }
                                const completados = expedientes.filter(e => e.estado === 'completado').length;
                                return (
                                    <div className="flex items-center gap-2">
                                        <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-500 text-[10px] font-bold border border-emerald-500/20">
                                            {expedientes.length} {expedientes.length === 1 ? 'expediente' : 'expedientes'}
                                        </span>
                                        {completados > 0 && (
                                            <span className="text-[9px] text-emerald-500 font-black">✓ {completados}</span>
                                        )}
                                    </div>
                                );
                            }
                        },
                        {
                            key: 'facturado',
                            label: 'Facturado',
                            render: (c) => {
                                const facturas = c.lead_billing || [];
                                const total = (Array.isArray(facturas) ? facturas : [facturas])
                                    .reduce((s, f) => s + (parseFloat(f?.importe_factura) || 0), 0);
                                return (
                                    <span className={`text-sm font-bold ${total > 0 ? 'text-primary' : 'text-variable-muted'}`}>
                                        {total > 0 ? `${Number(total).toLocaleString('es-ES')} €` : '—'}
                                    </span>
                                );
                            }
                        },
                        {
                            key: 'actividad',
                            label: 'Actividad',
                            align: 'center',
                            render: (c) => {
                                const actividad = c.flujos_embudo?.[0]?.actividad;
                                if (!actividad) return <span className="text-variable-muted text-[10px]">—</span>;
                                const isActive = actividad === 'lead_activo';
                                const styles = isActive
                                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                    : 'bg-rose-500/10 text-rose-500 border-rose-500/20';
                                return (
                                    <div className="flex justify-center">
                                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border ${styles}`}>
                                            {isActive ? 'ACTIVO' : 'INACTIVO'}
                                        </span>
                                    </div>
                                );
                            }
                        },
                        {
                            key: 'fecha_creacion',
                            label: 'Cliente desde',
                            render: (c) => (
                                <span className="text-variable-muted text-sm">
                                    {new Date(c.fecha_creacion).toLocaleDateString('es-ES')}
                                </span>
                            )
                        },
                        {
                            key: 'actions',
                            label: '',
                            align: 'right',
                            render: (c) => (
                                <Link
                                    to={`/clientes/${c.id}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-2 px-3 py-2 glass rounded-xl text-variable-muted hover:text-primary transition-all text-xs font-bold"
                                >
                                    Ver ficha <ArrowUpRight size={14} />
                                </Link>
                            )
                        }
                    ]}
                />
            </main>
        </div>
    );
}
