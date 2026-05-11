import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Lista cursos de evolCampus.
// - Por defecto (body vacío) solo cursos activos con sus grupos (getCoursesGroups, rápido).
// - Si body.include_inactive=true, devuelve también los inactivos vía getCourses (sin grupos).
//   Cuando se piden ambos, fusionamos: a los activos les añadimos status:'ACTIVE', y a los
//   inactivos status:'INACTIVE' sin groups (la API getCoursesGroups ya devuelve solo activos).

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

    let body: any = {};
    if (req.method === "POST") {
        try { body = await req.json(); } catch { body = {}; }
    }
    const includeInactive = !!body?.include_inactive;

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let token: string;
    try { token = await getToken(sb); }
    catch (err) { return json(502, { error: "token_failed", detail: String(err) }); }

    try {
        // 1) Activos + grupos
        const activeRes = await fetch(`${EVOL_BASE}/getCoursesGroups`, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        const activeText = await activeRes.text();
        if (!activeRes.ok) throw new Error(`getCoursesGroups ${activeRes.status}: ${activeText}`);
        const activeData = JSON.parse(activeText);

        const activeCourses = (Array.isArray(activeData?.courses) ? activeData.courses : []).map((c: any) => ({
            courseid: c.id,
            course_name: c.name,
            ngroups: c.ngroups,
            status: "ACTIVE",
            tags: Array.isArray(c.tags) ? c.tags : [],
            groups: (Array.isArray(c.groups) ? c.groups : []).map((g: any) => ({
                groupid: g.groupid,
                group_name: g.group,
                type: g.type,
            })),
        }));

        if (!includeInactive) {
            return json(200, { courses: activeCourses });
        }

        // 2) Todos (incluye INACTIVE) vía getCourses; mergeamos con los activos para conservar grupos.
        const allRes = await fetch(`${EVOL_BASE}/getCourses`, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        const allText = await allRes.text();
        if (!allRes.ok) throw new Error(`getCourses ${allRes.status}: ${allText}`);
        const allData = JSON.parse(allText);

        const activeIds = new Set(activeCourses.map(c => Number(c.courseid)));
        const inactiveCourses = (Array.isArray(allData?.courses) ? allData.courses : [])
            .filter((c: any) => !activeIds.has(Number(c.id)) && c.status !== "ACTIVE")
            .map((c: any) => ({
                courseid: c.id,
                course_name: c.name,
                ngroups: c.ngroups || 0,
                status: c.status || "INACTIVE",
                tags: Array.isArray(c.tags) ? c.tags : [],
                groups: [], // getCourses no devuelve grupos
            }));

        return json(200, { courses: [...activeCourses, ...inactiveCourses] });
    } catch (err) {
        return json(502, { error: "list_courses_failed", detail: String(err) });
    }
});
