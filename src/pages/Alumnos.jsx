import React, { useState, useEffect } from 'react';
import {
    GraduationCap,
    Search,
    Mail,
    Phone,
    BookOpen,
    Clock,
    Users as UsersIcon,
    CheckCircle2,
    AlertCircle,
    RefreshCw,
    ExternalLink,
    Loader2
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import Sidebar from '../components/Sidebar';
import DataTable from '../components/DataTable';
import CustomSelect from '../components/CustomSelect';
import FichasFundaeList from '../components/fundae/FichasFundaeList';
import { useNotifications } from '../context/NotificationContext';
import { useGlobalLoading } from '../context/LoadingContext';

export default function Alumnos() {
    const { showNotification } = useNotifications();
    const { withLoading } = useGlobalLoading();
    const [loading, setLoading] = useState(false);
    const [alumnos, setAlumnos] = useState([]);
    const [fichasPendientes, setFichasPendientes] = useState([]);
    const [search, setSearch] = useState('');
    const [filterCampus, setFilterCampus] = useState('todos'); // todos | matriculados | sin_matricular
    const [syncing, setSyncing] = useState(false);
    const [activeTab, setActiveTab] = useState('alumnos'); // alumnos | pendientes

    const fetchAlumnos = async () => {
        setLoading(true);
        try {
            // Cargar alumnos + sus inscripciones FUNDAE para mostrar empresa, fichas y estado evolCampus
            const { data, error } = await supabase
                .from('alumnos')
                .select(`
                    *,
                    fundae_alumnos(
                        id,
                        empresa,
                        ficha_estado,
                        firmada_at,
                        evolcampus_enrollmentid,
                        evolcampus_groupid,
                        matriculado_at,
                        evolcampus_completed_percent,
                        evolcampus_grade,
                        evolcampus_passed,
                        evolcampus_status,
                        evolcampus_lastconnect,
                        evolcampus_url_diploma,
                        evolcampus_synced_at,
                        fundae_id
                    )
                `)
                .order('updated_at', { ascending: false });

            if (error) throw error;
            setAlumnos(data || []);
        } catch (err) {
            console.error('Error fetching alumnos:', err);
            showNotification(`Error al cargar alumnos: ${err.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    // Fichas pendientes globales: firmadas o verificadas (aún no convertidas).
    // Embed del expediente fundae + lead para mostrar a qué cliente pertenece cada ficha.
    const fetchFichasPendientes = async () => {
        try {
            const { data, error } = await supabase
                .from('fundae_alumnos')
                .select(`
                    *,
                    fundae_seguimiento(
                        id, empresa, lead_id,
                        leads(id, nombre, empresa_nombre)
                    )
                `)
                .in('ficha_estado', ['firmada', 'verificada'])
                .order('firmada_at', { ascending: false });
            if (error) throw error;
            setFichasPendientes(data || []);
        } catch (err) {
            console.error('Error fetching fichas pendientes:', err);
            showNotification(`Error al cargar fichas pendientes: ${err.message}`, 'error');
        }
    };

    useEffect(() => {
        fetchAlumnos();
        fetchFichasPendientes();
        const channel = supabase
            .channel('alumnos-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'alumnos' }, () => { fetchAlumnos(); })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'fundae_alumnos' }, () => { fetchAlumnos(); fetchFichasPendientes(); })
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, []);

    const handleSyncEvolCampus = async () => {
        setSyncing(true);
        await withLoading(async () => {
            try {
                const { data, error } = await supabase.functions.invoke('evolcampus-sync-alumnos', { body: {} });
                if (error) {
                    let detail = error.message || 'Error desconocido';
                    if (error.context && typeof error.context.json === 'function') {
                        try { const body = await error.context.json(); detail = body?.detail || body?.error || detail; } catch (_) {}
                    }
                    console.error('[evolcampus-sync] error:', error, '→', detail);
                    showNotification('Error al sincronizar: ' + detail, 'error');
                    return;
                }
                if (data?.error) {
                    showNotification('Error: ' + (data.detail || data.error), 'error');
                    return;
                }
                if (data?.total === 0) {
                    showNotification('evolCampus no devolvió matrículas.', 'info');
                } else {
                    const parts = [`Sincronizados ${data.synced}/${data.total}`];
                    if (data.created) parts.push(`${data.created} nuevos`);
                    if (data.errors) parts.push(`${data.errors} errores`);
                    showNotification(`✅ ${parts.join(' · ')}.`);
                }
                await fetchAlumnos();
            } catch (err) {
                console.error('[evolcampus-sync] error:', err);
                showNotification('Error al sincronizar con evolCampus: ' + (err.message || ''), 'error');
            }
        }, 'Sincronizando con evolCampus...');
        setSyncing(false);
    };

    const handleAutologin = async (userid) => {
        if (!userid) {
            showNotification('Este alumno aún no tiene userid de evolCampus.', 'error');
            return;
        }
        await withLoading(async () => {
            try {
                const { data, error } = await supabase.functions.invoke('evolcampus-proxy', {
                    body: { action: 'getUrlAutologin', method: 'POST', params: { userid } }
                });
                if (error) throw error;
                const url = data?.urlautologin;
                if (!url) throw new Error('La API no devolvió URL de autologin.');
                window.open(url, '_blank', 'noopener');
            } catch (err) {
                showNotification('Error generando autologin: ' + (err.message || ''), 'error');
            }
        }, 'Generando acceso al campus...');
    };

    const filtered = alumnos.filter(a => {
        const q = search.trim().toLowerCase();
        if (q) {
            const haystack = `${a.nombre || ''} ${a.apellidos || ''} ${a.dni || ''} ${a.email || ''}`.toLowerCase();
            if (!haystack.includes(q)) return false;
        }
        const isMatriculado = !!a.evolcampus_userid || (a.fundae_alumnos || []).some(f => f.evolcampus_enrollmentid);
        if (filterCampus === 'matriculados' && !isMatriculado) return false;
        if (filterCampus === 'sin_matricular' && isMatriculado) return false;
        return true;
    });

    const stats = {
        total: alumnos.length,
        matriculados: alumnos.filter(a => !!a.evolcampus_userid || (a.fundae_alumnos || []).some(f => f.evolcampus_enrollmentid)).length,
        sinMatricular: alumnos.filter(a => !a.evolcampus_userid && !(a.fundae_alumnos || []).some(f => f.evolcampus_enrollmentid)).length,
        totalFichas: alumnos.reduce((s, a) => s + ((a.fundae_alumnos || []).length), 0)
    };

    return (
        <div className="flex min-h-screen transition-colors duration-300 overflow-hidden">
            <Sidebar />

            <main className="flex-1 p-4 sm:p-10 overflow-y-auto pb-32 md:pb-10">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-8 sm:mb-12">
                    <div>
                        <h1 className="text-2xl sm:text-4xl font-bold font-display tracking-tight mb-2 text-variable-main">Alumnos</h1>
                        <p className="text-variable-muted">Trabajadores inscritos a través de expedientes FUNDAE</p>
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <button
                            onClick={handleSyncEvolCampus}
                            disabled={syncing}
                            className="px-4 py-3 glass rounded-2xl text-xs font-bold text-variable-muted hover:text-primary transition-all flex items-center gap-2 disabled:opacity-60"
                            title="Sincronizar progreso desde evolCampus"
                        >
                            {syncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                            <span className="hidden sm:inline">Sincronizar campus</span>
                        </button>
                        <button onClick={fetchAlumnos} className="p-3 glass rounded-2xl text-variable-muted hover:text-primary transition-all" title="Refrescar lista">
                            <Clock size={20} />
                        </button>
                    </div>
                </header>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
                    {[
                        { key: 'total', label: 'Alumnos', value: stats.total, icon: UsersIcon, color: 'text-primary' },
                        { key: 'matr', label: 'Matriculados', value: stats.matriculados, icon: CheckCircle2, color: 'text-emerald-500' },
                        { key: 'sin', label: 'Sin matricular', value: stats.sinMatricular, icon: AlertCircle, color: 'text-amber-500' },
                        { key: 'fichas', label: 'Fichas FUNDAE', value: stats.totalFichas, icon: BookOpen, color: 'text-blue-500' }
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

                {/* Pestañas */}
                <div className="flex flex-wrap gap-2 mb-6 bg-white/5 p-1.5 rounded-[1.5rem] border border-variable w-fit">
                    {[
                        { id: 'alumnos', label: `Alumnos consolidados (${alumnos.length})`, icon: GraduationCap },
                        { id: 'pendientes', label: `Fichas pendientes (${fichasPendientes.length})`, icon: AlertCircle }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-5 py-2.5 rounded-2xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === tab.id
                                ? 'bg-primary text-white shadow-lg shadow-primary/30'
                                : 'text-variable-muted hover:text-variable-main'}`}
                        >
                            <tab.icon size={14} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {activeTab === 'pendientes' && (
                    <div className="glass rounded-[1.5rem] p-6">
                        <FichasFundaeList
                            fichas={fichasPendientes}
                            onRefresh={() => { fetchAlumnos(); fetchFichasPendientes(); }}
                            showNotification={showNotification}
                            tableId="fichas-pendientes-globales"
                        />
                    </div>
                )}

                {activeTab === 'alumnos' && (
                <DataTable
                    tableId="alumnos"
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
                                    placeholder="Buscar por nombre, DNI o email..."
                                />
                            </div>
                            <div className="w-full sm:w-56">
                                <CustomSelect
                                    value={filterCampus}
                                    onChange={setFilterCampus}
                                    options={[
                                        { value: 'todos', label: 'Todos los alumnos' },
                                        { value: 'matriculados', label: 'Matriculados en campus' },
                                        { value: 'sin_matricular', label: 'Sin matricular' }
                                    ]}
                                />
                            </div>
                        </div>
                    }
                    columns={[
                        {
                            key: 'alumno',
                            label: 'Alumno',
                            render: (a) => (
                                <div className="flex items-center gap-3">
                                    <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-black text-sm flex-shrink-0">
                                        {`${(a.nombre || '?')[0]}${(a.apellidos || '')[0] || ''}`.toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="font-bold text-variable-main">{a.nombre} {a.apellidos}</p>
                                        <p className="text-[10px] text-variable-muted uppercase font-black tracking-widest">{a.dni}</p>
                                    </div>
                                </div>
                            )
                        },
                        {
                            key: 'contacto',
                            label: 'Contacto',
                            render: (a) => (
                                <div className="text-sm">
                                    <div className="flex items-center gap-2 text-variable-muted">
                                        <Mail size={12} className="opacity-60" />
                                        <span className="truncate max-w-[200px]">{a.email || '—'}</span>
                                    </div>
                                    {a.telefono && (
                                        <div className="flex items-center gap-2 text-variable-muted mt-1">
                                            <Phone size={12} className="opacity-60" />
                                            <span>{a.telefono}</span>
                                        </div>
                                    )}
                                </div>
                            )
                        },
                        {
                            key: 'empresa',
                            label: 'Empresa',
                            render: (a) => {
                                const empresas = Array.from(new Set((a.fundae_alumnos || []).map(f => f.empresa).filter(Boolean)));
                                if (empresas.length === 0) return <span className="text-variable-muted text-[10px]">—</span>;
                                return (
                                    <div className="text-xs text-variable-main">
                                        {empresas[0]}
                                        {empresas.length > 1 && (
                                            <span className="ml-1 text-[9px] text-variable-muted">+{empresas.length - 1}</span>
                                        )}
                                    </div>
                                );
                            }
                        },
                        {
                            key: 'categoria',
                            label: 'Categoría',
                            render: (a) => (
                                <span className="text-xs text-variable-muted">{a.categoria_profesional || '—'}</span>
                            )
                        },
                        {
                            key: 'fichas',
                            label: 'Fichas FUNDAE',
                            render: (a) => {
                                const fichas = a.fundae_alumnos || [];
                                if (fichas.length === 0) return <span className="text-variable-muted text-[10px]">—</span>;
                                const firmadas = fichas.filter(f => f.ficha_estado === 'firmada').length;
                                return (
                                    <div className="flex items-center gap-2">
                                        <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-500 text-[10px] font-bold border border-blue-500/20">
                                            {fichas.length} {fichas.length === 1 ? 'ficha' : 'fichas'}
                                        </span>
                                        {firmadas > 0 && (
                                            <span className="text-[9px] text-emerald-500 font-black">✓ {firmadas}</span>
                                        )}
                                    </div>
                                );
                            }
                        },
                        {
                            key: 'progreso',
                            label: 'Progreso',
                            render: (a) => {
                                const matriculas = (a.fundae_alumnos || []).filter(f => f.evolcampus_enrollmentid);
                                if (matriculas.length === 0) {
                                    return (
                                        <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border bg-amber-500/10 text-amber-500 border-amber-500/20">
                                            Sin matricular
                                        </span>
                                    );
                                }
                                const m = matriculas[0]; // primera matrícula
                                const pct = m.evolcampus_completed_percent;
                                const grade = m.evolcampus_grade;
                                const passed = m.evolcampus_passed;
                                if (pct === null || pct === undefined) {
                                    return <span className="text-variable-muted text-[10px]">Sin sincronizar</span>;
                                }
                                const pctNum = Number(pct);
                                const color = passed ? 'bg-emerald-500' : pctNum >= 50 ? 'bg-blue-500' : 'bg-amber-500';
                                return (
                                    <div className="min-w-[140px]">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-[10px] font-black text-variable-main">{Math.round(pctNum)}%</span>
                                            {grade !== null && grade !== undefined && (
                                                <span className={`text-[9px] font-bold ${passed ? 'text-emerald-500' : 'text-variable-muted'}`}>
                                                    {Number(grade).toFixed(1)}
                                                </span>
                                            )}
                                        </div>
                                        <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                                            <div className={`${color} h-full rounded-full transition-all`} style={{ width: `${Math.min(pctNum, 100)}%` }} />
                                        </div>
                                        {matriculas.length > 1 && (
                                            <span className="text-[9px] text-variable-muted mt-0.5 block">+{matriculas.length - 1} matrícula{matriculas.length === 2 ? '' : 's'} más</span>
                                        )}
                                    </div>
                                );
                            }
                        },
                        {
                            key: 'lastconnect',
                            label: 'Última conexión',
                            render: (a) => {
                                const lc = (a.fundae_alumnos || []).map(f => f.evolcampus_lastconnect).filter(Boolean).sort().pop();
                                if (!lc) return <span className="text-variable-muted text-[10px]">—</span>;
                                return <span className="text-variable-muted text-xs">{new Date(lc).toLocaleDateString('es-ES')}</span>;
                            }
                        },
                        {
                            key: 'actions',
                            label: '',
                            align: 'right',
                            render: (a) => {
                                if (!a.evolcampus_userid) return <span className="text-variable-muted text-[10px]">—</span>;
                                return (
                                    <button
                                        onClick={() => handleAutologin(a.evolcampus_userid)}
                                        title="Acceso directo al campus"
                                        className="inline-flex items-center gap-1 px-2 py-1.5 glass rounded-xl text-blue-500 hover:bg-blue-500/10 transition-colors border border-transparent hover:border-blue-500/20 text-[10px] font-bold"
                                    >
                                        Campus <ExternalLink size={11} />
                                    </button>
                                );
                            }
                        }
                    ]}
                />
                )}
            </main>
        </div>
    );
}
