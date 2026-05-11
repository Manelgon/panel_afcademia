import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Devuelve los grupos de un curso concreto, con detalle (status, numstudents, fechas, type, duration).
// Body: { idCourse, status? }  status por defecto "ACTIVE".

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

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

    let body: any;
    try { body = await req.json(); }
    catch { return json(400, { error: "invalid_json" }); }

    const idCourse = Number(body?.idCourse);
    const statusFilter = typeof body?.status === "string" ? body.status : "ACTIVE";
    if (!idCourse) return json(400, { error: "idCourse_required" });

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let token: string;
    try { token = await getToken(sb); }
    catch (err) { return json(502, { error: "token_failed", detail: String(err) }); }

    try {
        const form = new URLSearchParams();
        form.set("idCourse", String(idCourse));
        form.set("status", statusFilter);
        const res = await fetch(`${EVOL_BASE}/getCourseGroups`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/x-www-form-urlencoded",
                Accept: "application/json",
            },
            body: form.toString(),
        });
        const text = await res.text();
        if (!res.ok) throw new Error(`getCourseGroups ${res.status}: ${text}`);
        const data = JSON.parse(text);

        const groups = (Array.isArray(data?.groups) ? data.groups : []).map((g: any) => ({
            id: g.id,
            name: g.name,
            status: g.status,
            numstudents: Number(g.numstudents) || 0,
            type: g.type,
            startdate: g.startdate || null,
            enddate: g.enddate || null,
            duration: g.duration ?? null,
        }));

        return json(200, { groups });
    } catch (err) {
        return json(502, { error: "list_groups_failed", detail: String(err) });
    }
});
