import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Devuelve los grupos de un curso concreto, con detalle (status, numstudents, fechas, type, duration).
// Body: { idCourse, status?, include_from_enrollments? }
//   - status: por defecto "ACTIVE". La API solo conoce ACTIVE/INACTIVE para grupos.
//   - include_from_enrollments: si true, complementa los grupos faltantes a partir de
//     getEnrollments?studyid=idCourse (útil para grupos archivados que la API no devuelve
//     por status, pero que sí siguen referenciados desde las matrículas).

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
    const includeFromEnrollments = !!body?.include_from_enrollments;
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

        // Complementar con grupos extraídos de las matrículas (para grupos archivados que la
        // API de getCourseGroups no devuelve sea cual sea el status).
        if (includeFromEnrollments) {
            const existingIds = new Set(groups.map(g => Number(g.id)));
            const aggregated = new Map<number, { id: number; name: string; status: string; numstudents: number; type: string | null; startdate: string | null; enddate: string | null; duration: number | null }>();
            let page = 1;
            let totalPages = 1;
            while (page <= totalPages && page <= 20) {
                const eForm = new URLSearchParams();
                eForm.set("studyid", String(idCourse));
                eForm.set("page", String(page));
                eForm.set("regs_per_page", "1000");
                const eRes = await fetch(`${EVOL_BASE}/getEnrollments`, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/x-www-form-urlencoded",
                        Accept: "application/json",
                    },
                    body: eForm.toString(),
                });
                const eText = await eRes.text();
                if (!eRes.ok) break;
                const eData = JSON.parse(eText);
                totalPages = Number(eData?.pages) || 1;
                const rows = Array.isArray(eData?.data) ? eData.data : [];
                for (const row of rows) {
                    const en = row?.enroll || {};
                    const gid = Number(en.groupid);
                    if (!gid || existingIds.has(gid)) continue;
                    const prev = aggregated.get(gid);
                    if (prev) {
                        prev.numstudents += 1;
                    } else {
                        aggregated.set(gid, {
                            id: gid,
                            name: en.group || `Grupo ${gid}`,
                            status: "ARCHIVED",
                            numstudents: 1,
                            type: null,
                            startdate: en.begin || null,
                            enddate: en.end || null,
                            duration: null,
                        });
                    }
                }
                page += 1;
            }
            for (const g of aggregated.values()) groups.push(g);
        }

        return json(200, { groups });
    } catch (err) {
        return json(502, { error: "list_groups_failed", detail: String(err) });
    }
});
