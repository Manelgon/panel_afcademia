import { supabase } from './supabase';

// Refresca campos de matrículas en directo desde evolCampus para que el panel no
// muestre datos del último cron. Se llama desde las vistas de detalle (curso,
// grupo, alumno) tras leer la tabla local: la UI ya pinta lo que hay, este helper
// la actualiza encima cuando llegan los datos vivos y persiste a la BD en background.

const parseDate = (s) => {
    if (!s || typeof s !== 'string') return null;
    const t = s.trim();
    if (!t) return null;
    const d = new Date(t.replace(' ', 'T'));
    return isNaN(d.getTime()) ? null : d.toISOString();
};
const parseDateOnly = (s) => {
    if (!s || typeof s !== 'string') return null;
    const t = s.trim();
    if (!t) return null;
    const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};
const num = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
};
const int = (v) => {
    const n = num(v);
    return n === null ? null : Math.trunc(n);
};

// Llama a evolcampus-proxy/getEnrollments paginando hasta agotar resultados.
// `filterParams` admite cualquier filtro que soporte la API: studyid, groupid, document, userid…
export async function fetchLiveEnrollments(filterParams = {}) {
    const all = [];
    let page = 1;
    let totalPages = 1;
    do {
        const { data, error } = await supabase.functions.invoke('evolcampus-proxy', {
            body: {
                action: 'getEnrollments',
                method: 'POST',
                params: { ...filterParams, page, regs_per_page: 200 }
            }
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.detail || data.error);
        const items = Array.isArray(data?.data) ? data.data : [];
        all.push(...items);
        totalPages = Number(data?.pages || 1);
        page++;
    } while (page <= totalPages);

    const byEid = new Map();
    for (const item of all) {
        const eid = Number(item?.person?.enrollmentid);
        if (eid) byEid.set(eid, { person: item.person || {}, enroll: item.enroll || {} });
    }
    return byEid;
}

// Convierte el `enroll` crudo de evolCampus a las columnas que guardamos en `matriculas`.
export function enrollToMatriculaFields(enroll) {
    return {
        completedpercent: num(enroll.completedpercent),
        evaluations_percent: num(enroll.evaluationscompletedpercent),
        grade: num(enroll.grade),
        passed: enroll.passrequierements === 1 || enroll.passrequierements === '1',
        enrollmentstatus: int(enroll.enrollmentstatus),
        lastconnect: parseDate(enroll.lastconnect),
        timeconnected: int(enroll.timeconnected),
        connections: int(enroll.connections),
        url_diploma: enroll.urldiploma || null,
        fecha_inicio_curso: parseDateOnly(enroll.begin),
        fecha_fin_curso: parseDateOnly(enroll.end),
        evolcampus_synced_at: new Date().toISOString(),
    };
}

// Aplica `liveByEid` sobre la lista local sin mutarla. Las matrículas que no aparezcan
// en el response se devuelven tal cual (pueden estar archivadas en evolCampus pero
// siguen en BD; no las borramos a ciegas).
export function mergeLiveIntoMatriculas(localMatriculas, liveByEid) {
    return localMatriculas.map(m => {
        const live = liveByEid.get(Number(m.evolcampus_enrollmentid));
        if (!live) return m;
        return { ...m, ...enrollToMatriculaFields(live.enroll) };
    });
}

// Persiste los campos refrescados en la tabla matriculas. Background: errores se loguean
// pero no se lanzan — la UI ya tiene los datos vivos aunque la BD no se actualice.
export async function persistMatriculaRefresh(localMatriculas, liveByEid) {
    const ops = [];
    for (const m of localMatriculas) {
        if (!m.evolcampus_enrollmentid) continue;
        const live = liveByEid.get(Number(m.evolcampus_enrollmentid));
        if (!live) continue;
        const fields = enrollToMatriculaFields(live.enroll);
        ops.push(
            supabase.from('matriculas').update(fields).eq('id', m.id).then(({ error }) => {
                if (error) console.warn('[matricula refresh persist]', m.id, error.message);
            })
        );
    }
    await Promise.allSettled(ops);
}

// Helper de alto nivel: pide live + fusiona en estado React + persiste en background.
// `setMatriculas` es el setter del componente; `localMatriculas` la lista actual.
export async function refreshMatriculasLive({ filterParams, localMatriculas, setMatriculas }) {
    const liveByEid = await fetchLiveEnrollments(filterParams);
    if (typeof setMatriculas === 'function') {
        setMatriculas(prev => mergeLiveIntoMatriculas(prev, liveByEid));
    }
    // No await: persistir es background.
    persistMatriculaRefresh(localMatriculas, liveByEid).catch((err) => {
        console.warn('[refreshMatriculasLive] persist failed:', err);
    });
    return liveByEid;
}
