import React, { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { CheckCircle2, UserPlus, Download, ExternalLink, Clock, AlertCircle, Eye, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import DataTable from '../DataTable';
import CustomSelect from '../CustomSelect';
import VerificarFichaModal from './VerificarFichaModal';
import ConvertirAlumnoModal from './ConvertirAlumnoModal';
import DetallesFichaModal from './DetallesFichaModal';
import { useGlobalLoading } from '../../context/LoadingContext';

const ESTADOS = {
    pendiente: { label: 'Pendiente', color: 'bg-gray-500/10 text-gray-500 border-gray-500/20', icon: Clock },
    firmada: { label: 'Firmada · Pendiente verificar', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20', icon: AlertCircle },
    verificada: { label: 'Verificada · Lista para convertir', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', icon: CheckCircle2 },
    convertida: { label: 'Convertida en alumno', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', icon: UserPlus }
};

export default function FichasFundaeList({ fichas, onRefresh, onAllVerified, showNotification, tableId = 'fichas-fundae' }) {
    const { withLoading } = useGlobalLoading();
    const [verificarFicha, setVerificarFicha] = useState(null);
    const [convertirFicha, setConvertirFicha] = useState(null);
    const [detallesFicha, setDetallesFicha] = useState(null);
    const [search, setSearch] = useState('');
    const [filterEstado, setFilterEstado] = useState('todos');

    const handleVerificada = async (updatedFicha) => {
        await onRefresh?.();
        // Comprobar contra BD directamente para evitar leer la prop vieja del closure.
        // Si tras esta verificación ya no quedan fichas en estado 'firmada' en el mismo
        // expediente, notificamos al padre para que cierre/avance.
        if (!updatedFicha?.fundae_id || !onAllVerified) return;
        const { data, error } = await supabase
            .from('fundae_alumnos')
            .select('id, ficha_estado')
            .eq('fundae_id', updatedFicha.fundae_id)
            .eq('ficha_estado', 'firmada')
            .limit(1);
        if (error) return;
        if (!data || data.length === 0) {
            onAllVerified();
        }
    };

    const handleDownload = async (path) => {
        if (!path) {
            showNotification('Esta ficha no tiene PDF guardado.', 'error');
            return;
        }
        await withLoading(async () => {
            try {
                const { data, error } = await supabase.storage.from('fundae-docs').createSignedUrl(path, 60);
                if (error) throw error;
                window.open(data.signedUrl, '_blank', 'noopener');
            } catch (err) {
                showNotification('No se pudo descargar el PDF: ' + err.message, 'error');
            }
        }, 'Generando enlace al PDF...');
    };

    if (!fichas || fichas.length === 0) {
        return (
            <p className="text-variable-muted text-sm">
                Aún no hay fichas. Se rellenan en el formulario público que recibe el cliente al marcar la factura como pagada.
            </p>
        );
    }

    // Filtrado local por búsqueda y estado
    const filtered = fichas.filter(f => {
        if (filterEstado !== 'todos' && f.ficha_estado !== filterEstado) return false;
        const q = search.trim().toLowerCase();
        if (!q) return true;
        const hay = `${f.nombre || ''} ${f.apellidos || ''} ${f.dni || ''} ${f.email || ''} ${f.categoria_profesional || ''}`.toLowerCase();
        return hay.includes(q);
    });

    return (
        <>
            <DataTable
                tableId={tableId}
                data={filtered}
                rowKey="id"
                onRowClick={(f) => setDetallesFicha(f)}
                toolbarLeft={
                    <div className="flex flex-wrap items-center gap-3 w-full">
                        <div className="relative flex-1 min-w-[220px] max-w-md">
                            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-variable-muted pointer-events-none" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full bg-white/5 border border-variable rounded-2xl pl-11 pr-5 py-2.5 focus:outline-none focus:border-primary/50 text-variable-main transition-all text-sm"
                                placeholder="Buscar por nombre, DNI, email..."
                            />
                        </div>
                        <div className="w-full sm:w-56">
                            <CustomSelect
                                value={filterEstado}
                                onChange={setFilterEstado}
                                options={[
                                    { value: 'todos', label: 'Todos los estados' },
                                    { value: 'pendiente', label: 'Pendiente' },
                                    { value: 'firmada', label: 'Firmada' },
                                    { value: 'verificada', label: 'Verificada' },
                                    { value: 'convertida', label: 'Convertida' }
                                ]}
                            />
                        </div>
                    </div>
                }
                columns={[
                    {
                        key: 'alumno',
                        label: 'Alumno',
                        render: (f) => (
                            <div>
                                <p className="text-sm font-bold text-variable-main">{f.nombre} {f.apellidos}</p>
                                <p className="text-[10px] text-variable-muted">{f.email || '—'}</p>
                            </div>
                        )
                    },
                    {
                        key: 'dni',
                        label: 'DNI',
                        render: (f) => <span className="text-xs font-mono text-variable-muted">{f.dni || '—'}</span>
                    },
                    {
                        key: 'categoria',
                        label: 'Categoría',
                        render: (f) => <span className="text-xs text-variable-muted">{f.categoria_profesional || '—'}</span>
                    },
                    {
                        key: 'estado',
                        label: 'Estado',
                        render: (f) => {
                            const cfg = ESTADOS[f.ficha_estado] || ESTADOS.pendiente;
                            const Icon = cfg.icon;
                            return (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border ${cfg.color}`}>
                                    <Icon size={11} /> {cfg.label}
                                </span>
                            );
                        }
                    },
                    {
                        key: 'actions',
                        label: '',
                        align: 'right',
                        render: (f) => (
                            <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <button
                                    type="button"
                                    onClick={() => setDetallesFicha(f)}
                                    title="Ver detalles"
                                    className="p-2 glass rounded-xl text-variable-muted hover:text-primary transition-colors border border-transparent hover:border-primary/20"
                                >
                                    <Eye size={13} />
                                </button>
                                {f.ficha_pdf_path && (
                                    <button
                                        type="button"
                                        onClick={() => handleDownload(f.ficha_pdf_path)}
                                        title="Descargar PDF firmado"
                                        className="p-2 glass rounded-xl text-blue-500 hover:bg-blue-500/10 transition-colors border border-transparent hover:border-blue-500/20"
                                    >
                                        <Download size={13} />
                                    </button>
                                )}
                                {f.ficha_estado === 'firmada' && (
                                    <button type="button" onClick={() => setVerificarFicha(f)}
                                        className="px-3 py-1.5 glass rounded-xl text-amber-500 hover:bg-amber-500/10 transition-colors border border-amber-500/30 text-[10px] font-bold flex items-center gap-1">
                                        <CheckCircle2 size={12} /> Verificar
                                    </button>
                                )}
                                {f.ficha_estado === 'verificada' && (
                                    <button type="button" onClick={() => setConvertirFicha(f)}
                                        className="px-3 py-1.5 glass rounded-xl text-blue-500 hover:bg-blue-500/10 transition-colors border border-blue-500/30 text-[10px] font-bold flex items-center gap-1">
                                        <UserPlus size={12} /> Convertir
                                    </button>
                                )}
                                {f.ficha_estado === 'convertida' && f.alumno_id && (
                                    <a href={`/alumnos`}
                                        onClick={(e) => e.stopPropagation()}
                                        className="px-3 py-1.5 glass rounded-xl text-emerald-500 hover:bg-emerald-500/10 transition-colors border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
                                        Ver alumno <ExternalLink size={11} />
                                    </a>
                                )}
                            </div>
                        )
                    }
                ]}
            />

            <AnimatePresence>
                {detallesFicha && (
                    <DetallesFichaModal
                        ficha={detallesFicha}
                        onClose={() => setDetallesFicha(null)}
                        showNotification={showNotification}
                    />
                )}
                {verificarFicha && (
                    <VerificarFichaModal
                        ficha={verificarFicha}
                        onClose={() => setVerificarFicha(null)}
                        onSaved={handleVerificada}
                        showNotification={showNotification}
                    />
                )}
                {convertirFicha && (
                    <ConvertirAlumnoModal
                        ficha={convertirFicha}
                        onClose={() => setConvertirFicha(null)}
                        onSaved={onRefresh}
                        showNotification={showNotification}
                    />
                )}
            </AnimatePresence>
        </>
    );
}
