import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Busca un alumno en evolCampus por DNI usando getEnrollments?document=DNI.
// Devuelve { userid, enrollments } o { userid: null, enrollments: [] } si no hay match.
// Si evolCampus tiene más de una matrícula con ese DNI, las devuelve todas para que
// el caller (ConvertirAlumnoModal) pueda enlazar la(s) ficha(s) FUNDAE locales que
// coincidan por groupid.

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
function parseDate(s: any): string | null {
    if (!s || typeof s !== "string") return null;
    const t = s.trim();
    if (!t) return null;
    const d = new Date(t.replace(" ", "T"));
    return isNaN(d.getTime()) ? null : d.toISOString();
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

    let body: any;
    try { body = await req.json(); }
    catch { return json(400, { error: "invalid_json" }); }

    const dni = typeof body?.dni === "string" ? body.dni.trim().toUpperCase().replace(/\s+/g, "") : "";
    if (!dni) return json(400, { error: "dni_required" });

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let token: string;
    try { token = await getToken(sb); }
    catch (err) { return json(502, { error: "token_failed", detail: String(err) }); }

    // getEnrollments paginado filtrado por document=DNI.
    const allEnrollments: any[] = [];
    try {
        let page = 1;
        let totalPages = 1;
        do {
            const form = new URLSearchParams();
            form.set("document", dni);
            form.set("page", String(page));
            form.set("regs_per_page", "100");
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
            if (!res.ok) throw new Error(`getEnrollments ${res.status}: ${text}`);
            const resp = JSON.parse(text);
            const items = Array.isArray(resp?.data) ? resp.data : [];
            allEnrollments.push(...items);
            totalPages = Number(resp?.pages || 1);
            page++;
        } while (page <= totalPages && page <= 10); // tope defensivo
    } catch (err) {
        return json(502, { error: "search_failed", detail: String(err) });
    }

    if (allEnrollments.length === 0) {
        return json(200, { userid: null, enrollments: [] });
    }

    // Tomamos el userid del primer registro (todos deben pertenecer al mismo alumno por DNI único).
    const firstPerson = allEnrollments[0]?.person || {};
    const userid = int(firstPerson.userid);

    // Devolvemos las matrículas en formato simplificado para que el caller las consuma.
    const enrollments = allEnrollments.map((e: any) => {
        const enroll = e?.enroll || {};
        return {
            enrollmentid: int(e?.person?.enrollmentid),
            groupid: int(enroll.groupid),
            study: enroll.study || null,
            group: enroll.group || null,
            completedpercent: num(enroll.completedpercent),
            evaluationscompletedpercent: num(enroll.evaluationscompletedpercent),
            grade: num(enroll.grade),
            passrequierements: enroll.passrequierements === 1 || enroll.passrequierements === "1",
            enrollmentstatus: int(enroll.enrollmentstatus),
            lastconnect: parseDate(enroll.lastconnect),
            timeconnected: int(enroll.timeconnected),
            connections: int(enroll.connections),
            urldiploma: enroll.urldiploma || null,
        };
    });

    return json(200, {
        userid,
        person: {
            name: firstPerson.name || null,
            lastname: firstPerson.lastname || null,
            email: firstPerson.email || null,
            phone: firstPerson.phone || null,
            identification: firstPerson.identification || null,
        },
        enrollments,
    });
});
