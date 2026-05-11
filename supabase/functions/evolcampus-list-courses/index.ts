import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Devuelve cursos activos con sus grupos (getCoursesGroups de evolCampus).
// Usado por el modal de "Nueva matrícula" para poblar los selectores.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVOL_BASE = "https://api.evolcampus.com/api/v1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
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

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let token: string;
    try { token = await getToken(sb); }
    catch (err) { return json(502, { error: "token_failed", detail: String(err) }); }

    try {
        const res = await fetch(`${EVOL_BASE}/getCoursesGroups`, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        const text = await res.text();
        if (!res.ok) throw new Error(`getCoursesGroups ${res.status}: ${text}`);
        const data = JSON.parse(text);

        // Normalizar a estructura limpia para el frontend.
        const courses = (Array.isArray(data?.courses) ? data.courses : []).map((c: any) => ({
            courseid: c.id,
            course_name: c.name,
            ngroups: c.ngroups,
            groups: (Array.isArray(c.groups) ? c.groups : []).map((g: any) => ({
                groupid: g.groupid,
                group_name: g.group,
                type: g.type,
            })),
        }));

        return json(200, { courses });
    } catch (err) {
        return json(502, { error: "list_courses_failed", detail: String(err) });
    }
});
