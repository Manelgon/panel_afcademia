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
const normDni = (s) => s ? String(s).toUpperCase().trim() : '';

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

    // Indexamos por enrollmentid (match principal) y por userid+groupid / dni+groupid
    // (fallback) para matrículas locales sin evolcampus_enrollmentid guardado todavía.
    const byEid = new Map();
    const byUseridGroupid = new Map();
    const byDniGroupid = new Map();
    for (const item of all) {
        const person = item?.person || {};
        const enroll = item?.enroll || {};
        const eid = Number(person.enrollmentid);
        const uid = Number(person.userid) || null;
        const gid = Number(enroll.groupid) || null;
        const dni = normDni(person.identification);
        const entry = { person, enroll };
        if (eid) byEid.set(eid, entry);
        if (uid && gid) byUseridGroupid.set(`${uid}|${gid}`, entry);
        if (dni && gid) byDniGroupid.set(`${dni}|${gid}`, entry);
    }
    return { byEid, byUseridGroupid, byDniGroupid };
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

// Busca la entrada live correspondiente a una matrícula local. Match en cascada:
// 1) por evolcampus_enrollmentid (camino feliz)
// 2) por evolcampus_userid + evolcampus_groupid (matrícula sin enrollmentid guardado)
// 3) por DNI del alumno + evolcampus_groupid (último recurso cuando ni userid hay)
function findLiveMatch(m, indices) {
    const eid = Number(m.evolcampus_enrollmentid) || null;
    if (eid) {
        const hit = indices.byEid.get(eid);
        if (hit) return hit;
    }
    const gid = Number(m.evolcampus_groupid) || null;
    if (!gid) return null;
    const uid = Number(m.evolcampus_userid || m.alumnos?.evolcampus_userid) || null;
    if (uid) {
        const hit = indices.byUseridGroupid.get(`${uid}|${gid}`);
        if (hit) return hit;
    }
    const dni = normDni(m.alumnos?.dni);
    if (dni) {
        const hit = indices.byDniGroupid.get(`${dni}|${gid}`);
        if (hit) return hit;
    }
    return null;
}

// Aplica `indices` sobre la lista local sin mutarla. Las matrículas que no aparezcan
// en el response se devuelven tal cual (pueden estar archivadas en evolCampus pero
// siguen en BD; no las borramos a ciegas).
export function mergeLiveIntoMatriculas(localMatriculas, indices) {
    return localMatriculas.map(m => {
        const live = findLiveMatch(m, indices);
        if (!live) return m;
        const fields = enrollToMatriculaFields(live.enroll);
        // Si conseguimos el match por fallback, también recuperamos el enrollmentid real
        // para que la UI/persist lo tenga ya cuadrado.
        const extra = {};
        const liveEid = Number(live.person?.enrollmentid) || null;
        if (liveEid && !m.evolcampus_enrollmentid) extra.evolcampus_enrollmentid = liveEid;
        const liveUid = Number(live.person?.userid) || null;
        if (liveUid && !m.evolcampus_userid) extra.evolcampus_userid = liveUid;
        return { ...m, ...fields, ...extra };
    });
}

// Persiste los campos refrescados en la tabla matriculas. Background: errores se loguean
// pero no se lanzan — la UI ya tiene los datos vivos aunque la BD no se actualice.
export async function persistMatriculaRefresh(localMatriculas, indices) {
    const ops = [];
    for (const m of localMatriculas) {
        const live = findLiveMatch(m, indices);
        if (!live) continue;
        const fields = enrollToMatriculaFields(live.enroll);
        const liveEid = Number(live.person?.enrollmentid) || null;
        if (liveEid && !m.evolcampus_enrollmentid) fields.evolcampus_enrollmentid = liveEid;
        const liveUid = Number(live.person?.userid) || null;
        if (liveUid && !m.evolcampus_userid) fields.evolcampus_userid = liveUid;
        ops.push(
            supabase.from('matriculas').update(fields).eq('id', m.id).then(({ error }) => {
                if (error) console.warn('[matricula refresh persist]', m.id, error.message);
            })
        );
    }
    await Promise.allSettled(ops);
}

// Helper de alto nivel: pide live + fusiona en estado React + persiste en background.
// `setMatriculas` es el setter del componente; `localMatriculas` la lista actual ya
// enriquecida con todo lo que el match en cascada pueda necesitar (alumnos, userid…).
export async function refreshMatriculasLive({ filterParams, localMatriculas, setMatriculas }) {
    const indices = await fetchLiveEnrollments(filterParams);
    const merged = mergeLiveIntoMatriculas(localMatriculas, indices);
    if (typeof setMatriculas === 'function') {
        // Conservamos los campos joinados que el caller pueda haber pasado en
        // `localMatriculas` pero que el estado React quizá no tiene todavía:
        // hacemos merge por id contra el prev por si el estado tiene rows extra.
        setMatriculas(prev => {
            const mergedById = new Map(merged.map(r => [r.id, r]));
            const seen = new Set();
            const out = prev.map(p => {
                const m = mergedById.get(p.id);
                if (!m) return p;
                seen.add(p.id);
                // No pisamos los joins (alumnos, clientes, fundae_alumnos) que vienen
                // del select original — solo aplicamos los campos vivos.
                return { ...p, ...stripJoinFields(m) };
            });
            // Filas presentes en merged pero no en prev (raro) se añaden tal cual.
            for (const m of merged) {
                if (!seen.has(m.id)) out.push(m);
            }
            return out;
        });
    }
    // No await: persistir es background.
    persistMatriculaRefresh(localMatriculas, indices).catch((err) => {
        console.warn('[refreshMatriculasLive] persist failed:', err);
    });
    return indices;
}

// Quita los campos de relaciones inyectados manualmente (alumnos sintético, etc.)
// para no sobrescribir los joins reales del estado React.
function stripJoinFields(row) {
    const { alumnos, clientes, fundae_alumnos, ...rest } = row;
    return rest;
}
