import React from 'react';
import { motion } from 'framer-motion';
import { FileText, X, Download } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useGlobalLoading } from '../../context/LoadingContext';
import Portal from '../Portal';

const ESTADO_LABEL = {
    pendiente: 'Pendiente',
    firmada: 'Firmada · Pendiente verificar',
    verificada: 'Verificada · Lista para convertir',
    convertida: 'Convertida en alumno'
};

const formatDate = (s) => {
    if (!s) return '—';
    try { return new Date(s).toLocaleDateString('es-ES'); } catch { return s; }
};

const formatDateTime = (s) => {
    if (!s) return '—';
    try { return new Date(s).toLocaleString('es-ES'); } catch { return s; }
};

export default function DetallesFichaModal({ ficha, onClose, showNotification }) {
    const { withLoading } = useGlobalLoading();

    const handleDownload = async () => {
        if (!ficha?.ficha_pdf_path) {
            showNotification('Esta ficha no tiene PDF guardado.', 'error');
            return;
        }
        await withLoading(async () => {
            try {
                const { data, error } = await supabase.storage.from('fundae-docs').createSignedUrl(ficha.ficha_pdf_path, 60);
                if (error) throw error;
                window.open(data.signedUrl, '_blank', 'noopener');
            } catch (err) {
                showNotification('No se pudo descargar el PDF: ' + err.message, 'error');
            }
        }, 'Generando enlace al PDF...');
    };

    if (!ficha) return null;

    return (
        <Portal>
        <div className="fixed inset-0 z-[110] flex items-start sm:items-center justify-center p-4 pb-24 sm:pb-4 overflow-y-auto">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={onClose} className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="relative w-full max-w-3xl glass rounded-[2rem] p-8 shadow-2xl my-auto">
                <button onClick={onClose} className="absolute top-5 right-5 p-2 rounded-xl text-variable-muted hover:text-rose-500 hover:bg-rose-500/10 transition-all">
                    <X size={20} />
                </button>

                <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                        <FileText size={24} />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-xl font-bold text-variable-main">Detalles de la ficha</h3>
                        <p className="text-xs text-variable-muted">{ficha.nombre} {ficha.apellidos}</p>
                    </div>
                    {ficha.ficha_pdf_path && (
                        <button onClick={handleDownload}
                            className="px-3 py-2 glass rounded-xl text-blue-500 hover:bg-blue-500/10 text-xs font-bold flex items-center gap-2 border border-blue-500/20">
                            <Download size={14} /> Descargar PDF
                        </button>
                    )}
                </div>

                <Section title="Datos personales">
                    <Row label="Nombre" value={ficha.nombre} />
                    <Row label="Apellidos" value={ficha.apellidos} />
                    <Row label="DNI / NIE" value={ficha.dni} mono />
                    <Row label="Email" value={ficha.email} />
                    <Row label="Teléfono" value={ficha.telefono} />
                    <Row label="Fecha nacimiento" value={formatDate(ficha.fecha_nacimiento)} />
                </Section>

                <Section title="Datos profesionales">
                    <Row label="Empresa" value={ficha.empresa} />
                    <Row label="Categoría profesional" value={ficha.categoria_profesional} />
                    <Row label="Nivel de estudios" value={ficha.nivel_estudios} />
                    <Row label="NASS" value={ficha.nass} mono />
                    <Row label="Discapacidad ≥ 33%" value={ficha.discapacidad_33 ? 'Sí' : 'No'} highlight={ficha.discapacidad_33} />
                    <Row label="Coste salarial bruto/hora" value={ficha.coste_salarial_hora ? `${Number(ficha.coste_salarial_hora).toFixed(2)} €` : '—'} />
                </Section>

                <Section title="Solape de horario">
                    <Row label="Solapa con horario habitual" value={ficha.solapa_horario ? 'Sí' : 'No'} highlight={ficha.solapa_horario} />
                    {ficha.solapa_horario && (
                        <Row label="Horas solapadas" value={ficha.horas_solapadas != null ? `${ficha.horas_solapadas} h` : '—'} />
                    )}
                </Section>

                <Section title="Estado y trazabilidad">
                    <Row label="Estado de la ficha" value={ESTADO_LABEL[ficha.ficha_estado] || ficha.ficha_estado || '—'} />
                    <Row label="Firmada el" value={formatDateTime(ficha.firmada_at)} />
                    <Row label="Verificada el" value={formatDateTime(ficha.verificada_at)} />
                    <Row label="Convertida el" value={formatDateTime(ficha.convertida_at)} />
                    <Row label="Alumno consolidado" value={ficha.alumno_id ? `ID ${ficha.alumno_id}` : '—'} mono />
                </Section>

                {(ficha.evolcampus_enrollmentid || ficha.evolcampus_groupid) && (
                    <Section title="Campus virtual">
                        <Row label="Enrollment ID" value={ficha.evolcampus_enrollmentid} mono />
                        <Row label="Group ID" value={ficha.evolcampus_groupid} mono />
                        <Row label="Matriculado el" value={formatDateTime(ficha.matriculado_at)} />
                        {ficha.evolcampus_completed_percent != null && (
                            <Row label="Progreso" value={`${Number(ficha.evolcampus_completed_percent).toFixed(0)}%`} />
                        )}
                        {ficha.evolcampus_grade != null && (
                            <Row label="Nota" value={Number(ficha.evolcampus_grade).toFixed(1)} />
                        )}
                        <Row label="Última conexión" value={formatDateTime(ficha.evolcampus_lastconnect)} />
                    </Section>
                )}
            </motion.div>
        </div>
        </Portal>
    );
}

function Section({ title, children }) {
    return (
        <div className="mb-5">
            <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] border-b border-primary/20 pb-2 mb-3">{title}</p>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                {children}
            </dl>
        </div>
    );
}

function Row({ label, value, mono = false, highlight = false }) {
    return (
        <div className="flex items-baseline gap-3 py-1.5 border-b border-variable/30 last:border-b-0">
            <dt className="text-[10px] font-bold uppercase tracking-widest text-variable-muted shrink-0 w-44">{label}</dt>
            <dd className={`text-sm flex-1 ${mono ? 'font-mono' : ''} ${highlight ? 'text-primary font-bold' : 'text-variable-main'}`}>
                {value === null || value === undefined || value === '' ? '—' : value}
            </dd>
        </div>
    );
}
