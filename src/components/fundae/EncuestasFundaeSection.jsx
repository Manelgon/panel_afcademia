import React, { useEffect, useState } from 'react';
import { ClipboardList, RefreshCw, Loader2, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';

// Encuestas finales del grupo FUNDAE (getSurveysByGroup).
// Solo se carga al pulsar "Cargar encuestas" para no encarecer la apertura del modal.
export default function EncuestasFundaeSection({ groupid, fbid }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [data, setData] = useState(null); // group object o null

    const fetch = async () => {
        if (!groupid) return;
        setLoading(true);
        setError(null);
        try {
            const params = { groupid };
            if (fbid) params.fbid = fbid;
            const { data: resp, error } = await supabase.functions.invoke('evolcampus-proxy', {
                body: { action: 'getSurveysByGroup', method: 'POST', params }
            });
            if (error) throw error;
            if (resp?.error) throw new Error(resp.detail || resp.error);
            setData(resp?.group || resp || null);
        } catch (err) {
            console.error('[encuestas]', err);
            setError(err.message || String(err));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Reset cuando cambia de grupo
        setData(null);
        setError(null);
    }, [groupid, fbid]);

    if (!groupid) return null;

    const surveys = Array.isArray(data?.surveys) ? data.surveys : [];

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] flex items-center gap-2">
                    <ClipboardList size={12} /> Encuestas FUNDAE
                </p>
                <button
                    type="button"
                    onClick={fetch}
                    disabled={loading}
                    className="px-3 py-1.5 glass rounded-xl text-variable-muted hover:text-primary text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-50"
                >
                    {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                    {data === null ? 'Cargar encuestas' : 'Refrescar'}
                </button>
            </div>

            {error && <p className="text-xs text-rose-500">Error: {error}</p>}

            {data === null && !loading && !error && (
                <p className="text-xs text-variable-muted">
                    Carga las encuestas finales que los alumnos han contestado en este grupo.
                </p>
            )}

            {data && surveys.length === 0 && !loading && (
                <p className="text-xs text-variable-muted">
                    No hay encuestas finales registradas para este grupo todavía.
                </p>
            )}

            {data && surveys.length > 0 && (
                <div className="space-y-2">
                    {surveys.map((s, i) => {
                        const records = Array.isArray(s.records) ? s.records : [];
                        return (
                            <details key={i} className="group rounded-2xl border border-variable bg-white/5 overflow-hidden">
                                <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between hover:bg-white/5">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-variable-main text-sm truncate">{s.name || 'Encuesta'}</p>
                                        <p className="text-[10px] text-variable-muted uppercase tracking-widest mt-0.5">
                                            {s.type || '—'} · {records.length} respuesta{records.length === 1 ? '' : 's'}
                                            {s.subject ? ` · ${s.subject}` : ''}
                                        </p>
                                    </div>
                                    <ChevronRight size={16} className="text-variable-muted group-open:rotate-90 transition-transform flex-shrink-0" />
                                </summary>
                                <div className="px-4 py-3 border-t border-variable space-y-3 max-h-96 overflow-y-auto">
                                    {records.length === 0 && (
                                        <p className="text-xs text-variable-muted">Aún sin respuestas.</p>
                                    )}
                                    {records.map((r, j) => (
                                        <div key={j} className="rounded-xl bg-white/5 p-3 border border-variable">
                                            <div className="flex items-center justify-between gap-3 mb-2">
                                                <p className="text-xs font-bold text-variable-main">{r.name || 'Anónimo'}</p>
                                                {r.date && <p className="text-[10px] text-variable-muted">{r.date}</p>}
                                            </div>
                                            {Array.isArray(r.questions) && r.questions.length > 0 && (
                                                <div className="space-y-2">
                                                    {r.questions.map((q, k) => (
                                                        <div key={k} className="text-[11px]">
                                                            <p className="text-variable-muted">{q.question}</p>
                                                            <p className="text-variable-main font-medium">
                                                                {renderAnswer(q)}
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </details>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// Renderiza la respuesta según el tipo de pregunta documentado.
function renderAnswer(q) {
    const a = q.learner_answer || {};
    const t = Number(q.type);
    if (t === 0) return a.value_answer ?? '—'; // numérico en rango
    if (t === 1) return a.text_answer || '—'; // texto libre
    if (t === 2) {
        if (a.value_answer === 1 || a.value_answer === '1') return 'Sí';
        if (a.value_answer === 0 || a.value_answer === '0') return 'No';
        return '—';
    }
    if (t === 3) {
        // Selección única: id_answer apunta a una respuesta del array answers
        const ans = (q.answers || []).find(x => Number(x.idRespuesta) === Number(a.id_answer));
        return ans?.sRespuesta || '—';
    }
    if (t === 4) {
        // Selección múltiple
        const ids = Array.isArray(a.id_answers) ? a.id_answers : [];
        const labels = ids.map(id => (q.answers || []).find(x => Number(x.idRespuesta) === Number(id))?.sRespuesta).filter(Boolean);
        return labels.length > 0 ? labels.join(', ') : '—';
    }
    return '—';
}
