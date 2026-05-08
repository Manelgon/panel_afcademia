import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
    const navigate = useNavigate();
    const { showNotification } = useNotifications();
    const { withLoading } = useGlobalLoading();
    const [loading, setLoading] = useState(false);
    const [alumnos, setAlumnos] = useState([]);
    const [fichasPendientes, setFichasPendientes] = useState([]);
    const [search, setSearch] = useState('');
    const [filterCampus, setFilterCampus] = useState('todos'); // todos | matriculados | sin_matricular
    const [syncing, setSyncing] = useState(false);
    const [activeTab, setActiveTab] = useState('alumnos'); // alumnos | pendientes | no_vinculados

    // Estado de la pestaña "No vinculados"
    const [evolEnrollments, setEvolEnrollments] = useState(null); // null = aún no cargado; [] = vacío
    const [evolLoading, setEvolLoading] = useState(false);
    const [evolError, setEvolError] = useState(null);
    const [importingEnrollment, setImportingEnrollment] = useState(null); // enrollmentid en curso

    const fetchAlumnos = async () => {
        setLoading(true);
        try {
            // Cargar alumnos + sus matrículas (fuente nueva) + clientes vía matriculas o vía fichas FUNDAE.
            const { data, error } = await supabase
                .from('alumnos')
                .select(`
                    *,
                    matriculas(
                        id, tipo, curso_nombre, grupo_nombre,
                        evolcampus_enrollmentid, evolcampus_groupid,
                        passed, enrollmentstatus, completedpercent,
                        cliente_id,
                        clientes(id, razon_social)
                    ),
                    fundae_alumnos(
                        id,
                        fundae_seguimiento(
                            id,
                            cliente_id,
                            clientes(id, razon_social)
                        )
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

    // Cargar matrículas de evolCampus la primera vez que se abre la pestaña "no_vinculados".
    useEffect(() => {
        if (activeTab === 'no_vinculados' && evolEnrollments === null && !evolLoading) {
            fetchEvolEnrollments();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

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

    // Trae todas las matrículas de evolCampus paginadas. Cada matrícula incluye person.userid;
    // las cruzamos contra la BD para detectar las que no tienen alumno local.
    const fetchEvolEnrollments = async () => {
        setEvolLoading(true);
        setEvolError(null);
        await withLoading(async () => {
            try {
                const all = [];
                let page = 1;
                let totalPages = 1;
                do {
                    const { data, error } = await supabase.functions.invoke('evolcampus-proxy', {
                        body: { action: 'getEnrollments', method: 'POST', params: { page, regs_per_page: 200 } }
                    });
                    if (error) throw error;
                    if (data?.error) throw new Error(data.detail || data.error);
                    const items = Array.isArray(data?.data) ? data.data : [];
                    all.push(...items);
                    totalPages = Number(data?.pages || 1);
                    page++;
                } while (page <= totalPages);
                setEvolEnrollments(all);
            } catch (err) {
                console.error('[evol-no-vinc] error:', err);
                setEvolError(err.message || String(err));
            }
        }, 'Consultando evolCampus...');
        setEvolLoading(false);
    };

    // Crea el alumno en BD + todas sus matrículas a partir de los datos de evolCampus.
    // El parámetro `enrollment` es la fila agrupada por persona, con `_matriculas` con
    // todas las matrículas que evolCampus tiene para ese userid.
    // Vacíos en evolCampus → null en BD (excepto el DNI: la columna es UNIQUE NOT NULL,
    // así que si evolCampus no devuelve DNI usamos el placeholder EVOL-{userid}, mismo
    // patrón que el sync. Si más tarde evolCampus rellena el DNI real, el sync lo
    // sobrescribe automáticamente —ver dniRecovered en evolcampus-sync-alumnos).
    const handleImportFromEvol = async (enrollment) => {
        const person = enrollment?.person || {};
        const userid = person.userid ? Number(person.userid) : null;
        const enrollmentid = person.enrollmentid ? Number(person.enrollmentid) : null;
        const dniReal = (person.identification || '').trim() || null;
        const dni = dniReal || (userid ? `EVOL-${userid}` : (enrollmentid ? `EVOL-${enrollmentid}` : null));
        const nombre = (person.name || '').trim() || null;
        const apellidos = (person.lastname || '').trim() || null;
        const email = (person.email || '').trim() || null;
        const telefono = (person.phone || '').trim() || null;

        if (!dni) {
            // Sin userid ni enrollmentid no podemos generar siquiera un placeholder único.
            showNotification('No se puede importar: la matrícula no tiene userid ni enrollmentid en evolCampus.', 'error');
            return;
        }

        const parseDate = (s) => {
            if (!s || typeof s !== 'string') return null;
            const t = s.trim();
            if (!t) return null;
            const d = new Date(t.replace(' ', 'T'));
            return isNaN(d.getTime()) ? null : d.toISOString();
        };
        const numOrNull = (v) => {
            if (v === null || v === undefined || v === '') return null;
            const n = Number(v);
            return isNaN(n) ? null : n;
        };
        const intOrNull = (v) => {
            const n = numOrNull(v);
            return n === null ? null : Math.trunc(n);
        };
        const cleanOrNull = (s) => {
            if (s === null || s === undefined) return null;
            const t = String(s).trim();
            return t === '' ? null : t;
        };

        setImportingEnrollment(enrollmentid);
        await withLoading(async () => {
            try {
                // 1. Crear alumno (o reutilizar si ya existe por DNI: import idempotente).
                const { data: alumno, error: aErr } = await supabase
                    .from('alumnos')
                    .upsert(
                        { dni, nombre, apellidos, email, telefono, evolcampus_userid: userid },
                        { onConflict: 'dni' }
                    )
                    .select('id')
                    .single();
                if (aErr) throw aErr;

                // 2. Insertar todas las matrículas que evolCampus tiene para esta persona.
                const enrollmentsToImport = enrollment._matriculas || [enrollment];
                const matriculasPayload = enrollmentsToImport.map(e => {
                    const en = e.enroll || {};
                    return {
                        alumno_id: alumno.id,
                        tipo: 'manual',
                        curso_nombre: cleanOrNull(en.study),
                        grupo_nombre: cleanOrNull(en.group),
                        evolcampus_userid: userid,
                        evolcampus_enrollmentid: intOrNull(e.person?.enrollmentid),
                        evolcampus_groupid: intOrNull(en.groupid),
                        completedpercent: numOrNull(en.completedpercent),
                        evaluations_percent: numOrNull(en.evaluationscompletedpercent),
                        grade: numOrNull(en.grade),
                        passed: en.passrequierements === 1 || en.passrequierements === '1',
                        enrollmentstatus: intOrNull(en.enrollmentstatus),
                        lastconnect: parseDate(en.lastconnect),
                        timeconnected: intOrNull(en.timeconnected),
                        connections: intOrNull(en.connections),
                        url_diploma: cleanOrNull(en.urldiploma),
                        evolcampus_synced_at: new Date().toISOString()
                    };
                }).filter(m => m.evolcampus_enrollmentid); // sin enrollmentid no podemos identificar la matrícula

                if (matriculasPayload.length > 0) {
                    const { error: mErr } = await supabase
                        .from('matriculas')
                        .upsert(matriculasPayload, { onConflict: 'evolcampus_enrollmentid' });
                    if (mErr) throw mErr;
                }

                const n = matriculasPayload.length;
                const displayName = [nombre, apellidos].filter(Boolean).join(' ') || dni;
                showNotification(
                    `✅ Alumno ${displayName} importado con ${n} ${n === 1 ? 'matrícula' : 'matrículas'}.`,
                    'success'
                );
                await fetchAlumnos();
            } catch (err) {
                showNotification(`Error importando: ${err.message}`, 'error');
            }
        }, 'Importando alumno y matrículas...');
        setImportingEnrollment(null);
    };

    // Devuelve los clientes únicos a los que está vinculado el alumno
    // (vía sus matrículas o, en su defecto, vía sus fichas FUNDAE).
    const getClientes = (a) => {
        const map = new Map();
        for (const m of a.matriculas || []) {
            const c = m.clientes;
            if (c?.id) map.set(c.id, c);
        }
        for (const f of a.fundae_alumnos || []) {
            const c = f.fundae_seguimiento?.clientes;
            if (c?.id) map.set(c.id, c);
        }
        return Array.from(map.values());
    };

    const filtered = alumnos.filter(a => {
        const q = search.trim().toLowerCase();
        if (q) {
            const clienteNames = getClientes(a).map(c => c.razon_social || '').join(' ');
            const haystack = `${a.nombre || ''} ${a.apellidos || ''} ${a.dni || ''} ${a.email || ''} ${clienteNames}`.toLowerCase();
            if (!haystack.includes(q)) return false;
        }
        const isMatriculado = !!a.evolcampus_userid || (a.matriculas || []).length > 0;
        if (filterCampus === 'matriculados' && !isMatriculado) return false;
        if (filterCampus === 'sin_matricular' && isMatriculado) return false;
        if (filterCampus === 'pendientes' && getClientes(a).length > 0) return false;
        return true;
    });

    const stats = {
        total: alumnos.length,
        matriculados: alumnos.filter(a => !!a.evolcampus_userid || (a.matriculas || []).length > 0).length,
        sinMatricular: alumnos.filter(a => !a.evolcampus_userid && (a.matriculas || []).length === 0).length,
        pendientes: alumnos.filter(a => getClientes(a).length === 0).length
    };

    // Derivados para la pestaña "No vinculados".
    // BD sin evolCampus: alumnos en BD sin evolcampus_userid Y sin ninguna matricula con enrollment.
    const alumnosBdSinEvol = alumnos.filter(a => {
        if (a.evolcampus_userid) return false;
        const matriculasConEnroll = (a.matriculas || []).filter(m => m.evolcampus_enrollmentid);
        return matriculasConEnroll.length === 0;
    });
    // EvolCampus sin BD: cada matrícula de evol cuyo userid no esté en alumnos.evolcampus_userid.
    // Una persona puede tener varias matrículas; agrupamos por userid para no listarla varias veces.
    const evolSinBd = (() => {
        if (!Array.isArray(evolEnrollments)) return [];
        const useridsEnBd = new Set(
            alumnos.map(a => a.evolcampus_userid).filter(Boolean).map(Number)
        );
        const huerfanos = evolEnrollments.filter(e => {
            const uid = e?.person?.userid ? Number(e.person.userid) : null;
            if (!uid) return true;
            return !useridsEnBd.has(uid);
        });
        // Agrupar por userid (o por enrollmentid si no hay userid) para mostrar 1 fila por persona.
        const map = new Map();
        for (const e of huerfanos) {
            const uid = e?.person?.userid ? Number(e.person.userid) : null;
            const key = uid ? `u-${uid}` : `e-${e?.person?.enrollmentid}`;
            if (!map.has(key)) {
                map.set(key, { ...e, _matriculas: [e] });
            } else {
                map.get(key)._matriculas.push(e);
            }
        }
        return Array.from(map.values());
    })();

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
                        { key: 'pend', label: 'Pendientes', value: stats.pendientes, icon: AlertCircle, color: 'text-amber-500' }
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
                        { id: 'pendientes', label: `Fichas pendientes (${fichasPendientes.length})`, icon: AlertCircle },
                        { id: 'no_vinculados', label: 'No vinculados', icon: AlertCircle }
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

                {activeTab === 'no_vinculados' && (
                    <div className="space-y-6">
                        {/* Sección 1: alumnos en BD sin matrícula evolCampus */}
                        <div className="glass rounded-[1.5rem] p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-black uppercase tracking-widest text-variable-main flex items-center gap-2">
                                    <AlertCircle size={16} className="text-amber-500" />
                                    En BD sin matrícula en evolCampus ({alumnosBdSinEvol.length})
                                </h3>
                            </div>
                            {alumnosBdSinEvol.length === 0 ? (
                                <p className="text-xs text-variable-muted">Todos los alumnos de la BD tienen su matrícula correspondiente en evolCampus.</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-[10px] font-black uppercase tracking-widest text-variable-muted border-b border-variable">
                                                <th className="text-left py-2 px-3">Alumno</th>
                                                <th className="text-left py-2 px-3">DNI</th>
                                                <th className="text-left py-2 px-3">Email</th>
                                                <th className="text-left py-2 px-3">Cliente</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {alumnosBdSinEvol.map(a => {
                                                const cls = getClientes(a);
                                                return (
                                                    <tr
                                                        key={a.id}
                                                        onClick={() => navigate(`/alumnos/${a.id}`)}
                                                        className="border-b border-variable/40 hover:bg-white/5 cursor-pointer transition-colors"
                                                    >
                                                        <td className="py-3 px-3 font-bold text-variable-main">{a.nombre} {a.apellidos}</td>
                                                        <td className="py-3 px-3 text-variable-muted">{a.dni || '—'}</td>
                                                        <td className="py-3 px-3 text-variable-muted">{a.email || '—'}</td>
                                                        <td className="py-3 px-3 text-variable-muted">
                                                            {cls.length > 0 ? (cls[0].razon_social || '—') : (
                                                                <span className="text-amber-500 text-[10px] font-bold uppercase">Sin cliente</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Sección 2: matrículas en evolCampus sin alumno en BD */}
                        <div className="glass rounded-[1.5rem] p-6">
                            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                                <h3 className="text-sm font-black uppercase tracking-widest text-variable-main flex items-center gap-2">
                                    <AlertCircle size={16} className="text-amber-500" />
                                    En evolCampus sin alumno en BD ({Array.isArray(evolEnrollments) ? evolSinBd.length : '—'})
                                </h3>
                                <button
                                    onClick={fetchEvolEnrollments}
                                    disabled={evolLoading}
                                    className="px-3 py-2 glass rounded-xl text-variable-muted hover:text-primary transition-all text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {evolLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                                    {evolLoading ? 'Cargando…' : 'Refrescar'}
                                </button>
                            </div>
                            {evolError && (
                                <p className="text-xs text-rose-500 mb-3">Error: {evolError}</p>
                            )}
                            {evolLoading && evolEnrollments === null ? (
                                <p className="text-xs text-variable-muted">Consultando evolCampus…</p>
                            ) : Array.isArray(evolEnrollments) && evolSinBd.length === 0 ? (
                                <p className="text-xs text-variable-muted">Todas las matrículas de evolCampus tienen su alumno en BD.</p>
                            ) : Array.isArray(evolEnrollments) ? (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-[10px] font-black uppercase tracking-widest text-variable-muted border-b border-variable">
                                                <th className="text-left py-2 px-3">Alumno</th>
                                                <th className="text-left py-2 px-3">DNI</th>
                                                <th className="text-left py-2 px-3">Email</th>
                                                <th className="text-left py-2 px-3">Matrículas</th>
                                                <th className="text-right py-2 px-3"></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {evolSinBd.map(e => {
                                                const p = e.person || {};
                                                const enrollmentid = p.enrollmentid ? Number(p.enrollmentid) : null;
                                                const importing = importingEnrollment === enrollmentid;
                                                const dniReal = (p.identification || '').trim();
                                                const fullName = [p.name, p.lastname].filter(Boolean).join(' ').trim();
                                                const tooltip = dniReal
                                                    ? 'Importar este alumno y sus matrículas'
                                                    : 'Importar (sin DNI: se usará un placeholder hasta que evolCampus rellene el DNI real)';
                                                return (
                                                    <tr key={`${p.userid || ''}-${enrollmentid}`} className="border-b border-variable/40">
                                                        <td className="py-3 px-3 font-bold text-variable-main">{fullName || '—'}</td>
                                                        <td className="py-3 px-3 text-variable-muted">{dniReal || '—'}</td>
                                                        <td className="py-3 px-3 text-variable-muted">{p.email || '—'}</td>
                                                        <td className="py-3 px-3">
                                                            <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-500 text-[10px] font-bold border border-blue-500/20">
                                                                {(e._matriculas || [e]).length}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 px-3 text-right">
                                                            <button
                                                                onClick={() => handleImportFromEvol(e)}
                                                                disabled={importing}
                                                                title={tooltip}
                                                                className="px-3 py-1.5 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                                                            >
                                                                {importing ? <Loader2 size={11} className="animate-spin" /> : null}
                                                                {importing ? 'Importando…' : 'Importar a BD'}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            ) : null}
                        </div>
                    </div>
                )}

                {activeTab === 'alumnos' && (
                <DataTable
                    tableId="alumnos"
                    loading={loading}
                    data={filtered}
                    rowKey="id"
                    onRowClick={(a) => navigate(`/alumnos/${a.id}`)}
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
                                        { value: 'sin_matricular', label: 'Sin matricular' },
                                        { value: 'pendientes', label: 'Pendientes de vincular a cliente' }
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
                            key: 'cliente',
                            label: 'Cliente',
                            render: (a) => {
                                const cls = getClientes(a);
                                if (cls.length === 0) {
                                    return (
                                        <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border bg-amber-500/10 text-amber-500 border-amber-500/20">
                                            Pendiente
                                        </span>
                                    );
                                }
                                return (
                                    <div className="text-xs text-variable-main">
                                        {cls[0].razon_social || '—'}
                                        {cls.length > 1 && (
                                            <span className="ml-1 text-[9px] text-variable-muted">+{cls.length - 1}</span>
                                        )}
                                    </div>
                                );
                            }
                        },
                        {
                            key: 'matriculas',
                            label: 'Matrículas',
                            render: (a) => {
                                const ms = a.matriculas || [];
                                if (ms.length === 0) {
                                    return <span className="text-variable-muted text-[10px]">—</span>;
                                }
                                const completadas = ms.filter(m => m.passed).length;
                                return (
                                    <div className="flex items-center gap-2">
                                        <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-500 text-[10px] font-bold border border-blue-500/20">
                                            {ms.length} {ms.length === 1 ? 'matrícula' : 'matrículas'}
                                        </span>
                                        {completadas > 0 && (
                                            <span className="text-[9px] text-emerald-500 font-black">✓ {completadas}</span>
                                        )}
                                    </div>
                                );
                            }
                        },
                        {
                            key: 'estado_campus',
                            label: 'Campus',
                            align: 'center',
                            render: (a) => {
                                if (a.evolcampus_userid) {
                                    return (
                                        <div className="flex justify-center">
                                            <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                                Matriculado
                                            </span>
                                        </div>
                                    );
                                }
                                return (
                                    <div className="flex justify-center">
                                        <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                            Sin matricular
                                        </span>
                                    </div>
                                );
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
                                        onClick={(e) => { e.stopPropagation(); handleAutologin(a.evolcampus_userid); }}
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
