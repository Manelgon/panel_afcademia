import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Sincronización completa con evolCampus:
// - Trae TODAS las matrículas paginadas (getEnrollments)
// - Para cada una, busca alumno por DNI o email
//   - Si existe: actualiza progreso/datos
//   - Si no existe: crea el alumno con los datos de evolCampus
// - Si la matrícula corresponde a una ficha fundae_alumnos del mismo alumno + grupo, persiste el enrollmentid allí también

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVOL_BASE = "https://api.evolcampus.com/api/v1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

let cachedClientId: string | null = null;
let cachedKey: string | null = null;
let cachedToken: string | null = null;
let cachedTokenExpires = 0;

async function loadCredentials(sb: any) {
    if (cachedClientId && cachedKey) return;
    const { data, error } = await sb.rpc("get_evolcampus_credentials");
    if (error) throw new Error(`credentials rpc failed: ${error.message}`);
    cachedClientId = data?.clientid ?? null;
    cachedKey = data?.key ?? null;
    if (!cachedClientId || !cachedKey) throw new Error("evolCampus credentials missing");
}

async function getToken(sb: any): Promise<string> {
    const now = Date.now();
    if (cachedToken && cachedTokenExpires > now + 60_000) return cachedToken;
    await loadCredentials(sb);
    const res = await fetch(`${EVOL_BASE}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientid: Number(cachedClientId), key: cachedKey }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`token ${res.status}: ${text}`);
    const body = JSON.parse(text);
    if (!body?.token) throw new Error(`token missing: ${text}`);
    cachedToken = body.token;
    cachedTokenExpires = now + 50 * 60_000;
    return cachedToken;
}

async function getEnrollmentsPage(token: string, page: number) {
    const form = new URLSearchParams();
    form.set("page", String(page));
    form.set("regs_per_page", "200");
    const res = await fetch(`${EVOL_BASE}/getEnrollments`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
        },
        body: form.toString(),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`getEnrollments page ${page}: ${res.status} ${text}`);
    return JSON.parse(text);
}

function parseDate(s: any): string | null {
    if (!s || typeof s !== "string") return null;
    const t = s.trim();
    if (!t) return null;
    const d = new Date(t.replace(" ", "T"));
    return isNaN(d.getTime()) ? null : d.toISOString();
}
function num(v: any): number | null {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
}
function int(v: any): number | null {
    const n = num(v);
    return n === null ? null : Math.trunc(n);
}
function clean(s: any): string | null {
    if (s === null || s === undefined) return null;
    const t = String(s).trim();
    return t === "" ? null : t;
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let token: string;
    try { token = await getToken(sb); }
    catch (err) { return json(502, { error: "token_failed", detail: String(err) }); }

    // 1. Traer TODAS las matrículas paginadas
    const allEnrollments: any[] = [];
    try {
        let page = 1;
        let totalPages = 1;
        do {
            const resp = await getEnrollmentsPage(token, page);
            const items = Array.isArray(resp?.data) ? resp.data : [];
            allEnrollments.push(...items);
            totalPages = Number(resp?.pages || 1);
            page++;
        } while (page <= totalPages);
    } catch (err) {
        return json(502, { error: "list_enrollments_failed", detail: String(err) });
    }

    if (allEnrollments.length === 0) {
        return json(200, { synced: 0, created: 0, errors: 0, total: 0, message: "evolCampus no devolvió matrículas." });
    }

    // 2. Cargar alumnos existentes en BD (DNI + email indexados)
    const { data: existingAlumnos, error: aErr } = await sb
        .from("alumnos")
        .select("id, dni, email, evolcampus_userid");
    if (aErr) return json(500, { error: "db_alumnos_failed", detail: aErr.message });

    const byDni = new Map<string, any>();
    const byEmail = new Map<string, any>();
    const byUserid = new Map<number, any>();
    for (const a of existingAlumnos || []) {
        if (a.dni) byDni.set(String(a.dni).toUpperCase().trim(), a);
        if (a.email) byEmail.set(String(a.email).toLowerCase().trim(), a);
        if (a.evolcampus_userid) byUserid.set(Number(a.evolcampus_userid), a);
    }

    // 3. Cargar fichas fundae_alumnos para enlazar enrollment cuando coincida
    const { data: fichas, error: fErr } = await sb
        .from("fundae_alumnos")
        .select("id, alumno_id, evolcampus_groupid, evolcampus_enrollmentid");
    if (fErr) return json(500, { error: "db_fichas_failed", detail: fErr.message });

    const fichasByAlumnoId = new Map<string, any[]>();
    for (const f of fichas || []) {
        if (!f.alumno_id) continue;
        const list = fichasByAlumnoId.get(f.alumno_id) || [];
        list.push(f);
        fichasByAlumnoId.set(f.alumno_id, list);
    }

    let synced = 0;
    let created = 0;
    let errors = 0;
    let dniRecovered = 0;
    let dniMissingFromEvol = 0;
    const errorList: Array<{ enrollmentid: any; detail: string }> = [];

    for (const e of allEnrollments) {
        const person = e?.person || {};
        const enroll = e?.enroll || {};
        const enrollmentid = int(person.enrollmentid);
        const userid = int(person.userid);
        const dni = clean(person.identification);
        const email = clean(person.email);
        const nombre = clean(person.name);
        const apellidos = clean(person.lastname);
        const telefono = clean(person.phone);

        if (!enrollmentid) continue;
        if (!dni) dniMissingFromEvol++;

        try {
            // Buscar alumno: prioridad userid > dni > email
            let alumno: any = null;
            if (userid && byUserid.has(userid)) alumno = byUserid.get(userid);
            if (!alumno && dni && byDni.has(dni.toUpperCase())) alumno = byDni.get(dni.toUpperCase());
            if (!alumno && email && byEmail.has(email.toLowerCase())) alumno = byEmail.get(email.toLowerCase());

            const alumnoPayload = {
                nombre: nombre || (alumno?.nombre ?? "—"),
                apellidos: apellidos || (alumno?.apellidos ?? ""),
                email: email,
                telefono: telefono,
                evolcampus_userid: userid,
            };

            if (!alumno) {
                // Crear alumno nuevo. dni es obligatorio en BD (UNIQUE) — si no viene de evolCampus, usamos un placeholder único.
                const dniValue = dni || `EVOL-${userid || enrollmentid}`;
                const { data: ins, error: insErr } = await sb
                    .from("alumnos")
                    .insert({ ...alumnoPayload, dni: dniValue })
                    .select("id, dni, email, evolcampus_userid")
                    .single();
                if (insErr) throw new Error(`insert alumno: ${insErr.message}`);
                alumno = ins;
                created++;
                // Indexar para que matrículas posteriores del mismo alumno reusen
                if (alumno.dni) byDni.set(String(alumno.dni).toUpperCase().trim(), alumno);
                if (alumno.email) byEmail.set(String(alumno.email).toLowerCase().trim(), alumno);
                if (alumno.evolcampus_userid) byUserid.set(Number(alumno.evolcampus_userid), alumno);
            } else {
                // Actualizar datos del alumno. Solo sobrescribimos el DNI si el actual es un
                // placeholder generado por nosotros (EVOL-*) y evolCampus ahora trae uno real.
                const updPayload: any = { evolcampus_userid: userid ?? alumno.evolcampus_userid };
                if (email && email !== alumno.email) updPayload.email = email;
                if (nombre) updPayload.nombre = nombre;
                if (apellidos) updPayload.apellidos = apellidos;
                if (telefono) updPayload.telefono = telefono;
                if (dni && (!alumno.dni || String(alumno.dni).startsWith("EVOL-")) && dni !== alumno.dni) {
                    updPayload.dni = dni;
                    dniRecovered++;
                    // Reindexar para que las matrículas siguientes del mismo alumno usen el DNI real
                    if (alumno.dni) byDni.delete(String(alumno.dni).toUpperCase().trim());
                    byDni.set(dni.toUpperCase().trim(), { ...alumno, dni });
                }
                if (Object.keys(updPayload).length > 0) {
                    await sb.from("alumnos").update(updPayload).eq("id", alumno.id);
                }
            }

            // Enlazar a ficha fundae_alumnos si existe (mismo alumno + mismo groupid)
            const groupid = int(enroll.groupid);
            const fichasDelAlumno = fichasByAlumnoId.get(alumno.id) || [];
            const fichaCandidata = fichasDelAlumno.find(f =>
                groupid && Number(f.evolcampus_groupid) === groupid
            );

            const enrollUpdate = {
                evolcampus_enrollmentid: enrollmentid,
                evolcampus_groupid: groupid,
                evolcampus_completed_percent: num(enroll.completedpercent),
                evolcampus_evaluations_percent: num(enroll.evaluationscompletedpercent),
                evolcampus_grade: num(enroll.grade),
                evolcampus_passed: enroll.passrequierements === 1 || enroll.passrequierements === "1",
                evolcampus_status: int(enroll.enrollmentstatus),
                evolcampus_lastconnect: parseDate(enroll.lastconnect),
                evolcampus_time_connected: int(enroll.timeconnected),
                evolcampus_connections: int(enroll.connections),
                evolcampus_url_diploma: enroll.urldiploma || null,
                evolcampus_synced_at: new Date().toISOString(),
            };

            if (fichaCandidata) {
                await sb.from("fundae_alumnos").update(enrollUpdate).eq("id", fichaCandidata.id);
            }

            // Upsert en matriculas (fuente paralela). Si hay ficha local, tipo='fundae'; si no, 'manual'.
            // cliente_id se hereda del expediente FUNDAE de la ficha si existe.
            let clienteIdMat: number | null = null;
            if (fichaCandidata?.id) {
                const { data: fsRow } = await sb
                    .from("fundae_alumnos")
                    .select("fundae_seguimiento(cliente_id)")
                    .eq("id", fichaCandidata.id)
                    .maybeSingle();
                clienteIdMat = (fsRow as any)?.fundae_seguimiento?.cliente_id ?? null;
            }
            const matriculaPayload: Record<string, unknown> = {
                alumno_id: alumno.id,
                cliente_id: clienteIdMat,
                fundae_alumno_id: fichaCandidata?.id || null,
                tipo: fichaCandidata ? "fundae" : "manual",
                curso_nombre: clean(enroll.study),
                grupo_nombre: clean(enroll.group),
                evolcampus_userid: userid,
                evolcampus_enrollmentid: enrollmentid,
                evolcampus_groupid: groupid,
                completedpercent: num(enroll.completedpercent),
                evaluations_percent: num(enroll.evaluationscompletedpercent),
                grade: num(enroll.grade),
                passed: enroll.passrequierements === 1 || enroll.passrequierements === "1",
                enrollmentstatus: int(enroll.enrollmentstatus),
                lastconnect: parseDate(enroll.lastconnect),
                timeconnected: int(enroll.timeconnected),
                connections: int(enroll.connections),
                url_diploma: enroll.urldiploma || null,
                evolcampus_synced_at: new Date().toISOString(),
            };
            const { error: matErr } = await sb
                .from("matriculas")
                .upsert(matriculaPayload, { onConflict: "evolcampus_enrollmentid" });
            if (matErr) console.warn("[matriculas upsert]", enrollmentid, matErr.message);

            synced++;
        } catch (err) {
            errors++;
            errorList.push({ enrollmentid, detail: String(err) });
        }
    }

    return json(200, {
        synced,
        created,
        errors,
        total: allEnrollments.length,
        dniRecovered,
        dniMissingFromEvol,
        errorList: errorList.slice(0, 20),
    });
});
