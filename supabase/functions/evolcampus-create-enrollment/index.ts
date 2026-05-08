import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Crea una matrícula en evolCampus para un alumno local en un grupo concreto.
// Flujo:
//   1) Lee datos del alumno desde BD.
//   2) Llama a checkEnrollment para evitar duplicar matrícula en el mismo grupo.
//   3) Llama a newEnrollment (welcomeemail=1).
//   4) Persiste en matriculas (tipo='manual') y rellena evolcampus_userid en alumnos si faltaba.
//
// Body esperado:
//   { alumno_id, groupid, courseid, cliente_id?, fecha_inicio? (Y-m-d), curso_nombre?, grupo_nombre? }

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

function num(v: any): number | null {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
}
function int(v: any): number | null {
    const n = num(v);
    return n === null ? null : Math.trunc(n);
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

    let body: any;
    try { body = await req.json(); }
    catch { return json(400, { error: "invalid_json" }); }

    const alumnoId = body?.alumno_id;
    const groupid = int(body?.groupid);
    const courseid = int(body?.courseid);
    const clienteId = body?.cliente_id ?? null;
    const fechaInicio = typeof body?.fecha_inicio === "string" ? body.fecha_inicio : null;
    const cursoNombreReq = typeof body?.curso_nombre === "string" ? body.curso_nombre : null;
    const grupoNombreReq = typeof body?.grupo_nombre === "string" ? body.grupo_nombre : null;
    const companyid = int(body?.companyid); // empresa de evolCampus (getCompaniesClient)

    if (!alumnoId) return json(400, { error: "alumno_id_required" });
    if (!groupid) return json(400, { error: "groupid_required" });

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1) Leer datos del alumno
    const { data: alumno, error: aErr } = await sb
        .from("alumnos")
        .select("id, nombre, apellidos, email, telefono, dni, evolcampus_userid")
        .eq("id", alumnoId)
        .maybeSingle();
    if (aErr) return json(500, { error: "db_alumno_failed", detail: aErr.message });
    if (!alumno) return json(404, { error: "alumno_not_found" });

    if (!alumno.email) return json(400, { error: "alumno_sin_email", detail: "El alumno necesita email para matricularse en evolCampus." });

    let token: string;
    try { token = await getToken(sb); }
    catch (err) { return json(502, { error: "token_failed", detail: String(err) }); }

    // 2) checkEnrollment para evitar duplicar
    try {
        const form = new URLSearchParams();
        form.set("email", alumno.email);
        form.set("groupid", String(groupid));
        const res = await fetch(`${EVOL_BASE}/checkEnrollment`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/x-www-form-urlencoded",
                Accept: "application/json",
            },
            body: form.toString(),
        });
        const text = await res.text();
        if (res.ok) {
            const r = JSON.parse(text);
            if (r?.result === 1 || r?.result === "1") {
                return json(409, {
                    error: "ya_matriculado",
                    detail: "Este alumno ya está matriculado en este grupo.",
                    enrollmentid: int(r?.enrollmentid),
                    userid: int(r?.userid),
                });
            }
            if (r?.result === 2 || r?.result === "2") {
                // Matriculado en otro grupo del mismo curso (lo permitimos pero avisamos arriba)
                console.warn("[create-enrollment] Alumno ya matriculado en otro grupo del mismo curso:", r);
            }
        }
    } catch (err) {
        console.warn("[create-enrollment] checkEnrollment falló (continuamos):", String(err));
    }

    // 3) newEnrollment
    let enrollResp: any;
    try {
        const form = new URLSearchParams();
        form.set("enroll[groupid]", String(groupid));
        form.set("enroll[welcomeemail]", "1");
        if (fechaInicio) form.set("enroll[startdate]", fechaInicio);
        // external_id para identificar la matrícula desde nuestro CRM
        form.set("enroll[external_id]", `alumno:${alumno.id}`);
        form.set("person[email]", alumno.email);
        form.set("person[username]", alumno.email);
        if (alumno.nombre) form.set("person[name]", alumno.nombre);
        if (alumno.apellidos) form.set("person[lastname]", alumno.apellidos);
        if (alumno.telefono) form.set("person[phone]", alumno.telefono);
        if (alumno.dni && !String(alumno.dni).startsWith("EVOL-")) form.set("person[identification]", alumno.dni);
        if (companyid) form.set("person[companyid]", String(companyid));

        const res = await fetch(`${EVOL_BASE}/newEnrollment`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/x-www-form-urlencoded",
                Accept: "application/json",
            },
            body: form.toString(),
        });
        const text = await res.text();
        if (!res.ok) throw new Error(`newEnrollment ${res.status}: ${text}`);
        enrollResp = JSON.parse(text);
        if (enrollResp?.result !== 1 && enrollResp?.result !== "1") {
            throw new Error(`newEnrollment KO: ${text}`);
        }
    } catch (err) {
        return json(502, { error: "enrollment_failed", detail: String(err) });
    }

    const newUserid = int(enrollResp.userid);
    const newEnrollmentid = int(enrollResp.enrollmentid);

    // 4a) Actualizar alumno con evolcampus_userid si faltaba
    if (newUserid && !alumno.evolcampus_userid) {
        await sb.from("alumnos").update({ evolcampus_userid: newUserid }).eq("id", alumno.id);
    }

    // 4b) Persistir matrícula en BD
    const matriculaPayload: Record<string, unknown> = {
        alumno_id: alumno.id,
        cliente_id: clienteId,
        fundae_alumno_id: null,
        tipo: "manual",
        curso_nombre: cursoNombreReq,
        grupo_nombre: grupoNombreReq,
        evolcampus_userid: newUserid,
        evolcampus_enrollmentid: newEnrollmentid,
        evolcampus_groupid: groupid,
        fecha_matricula: fechaInicio ? new Date(fechaInicio).toISOString() : new Date().toISOString(),
        evolcampus_synced_at: new Date().toISOString(),
    };
    const { data: matIns, error: matErr } = await sb
        .from("matriculas")
        .upsert(matriculaPayload, { onConflict: "evolcampus_enrollmentid" })
        .select()
        .single();
    if (matErr) {
        console.error("[create-enrollment] persistencia local fallida:", matErr);
        return json(500, {
            error: "matricula_persist_failed",
            detail: matErr.message,
            enrollmentid: newEnrollmentid,
            userid: newUserid,
        });
    }

    return json(200, {
        ok: true,
        matricula: matIns,
        enrollmentid: newEnrollmentid,
        userid: newUserid,
        learnerid: int(enrollResp.learnerid),
    });
});
