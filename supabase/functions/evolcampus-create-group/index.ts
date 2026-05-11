import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Crea un grupo en evolCampus (newGroup) asociado a un curso existente.
// Body esperado:
//   {
//     courseid (req), name (req), type (A|S, req),
//     days_duration? (asincr), start_date? end_date? (sincr),
//     class_hours?, hide_remaining_time?, sequential? (0|1),
//     min_grade?, min_off?, access_after_finish? (0|1|2), rating? (0|1),
//     criteria: { min_grade?, percent_total?, videoconference_hours?, percent_videoconference_hours?, percent_hours_conected?, percent_assesables? },
//     communication: { msg_teacher?, msg_learners?, forums?, open_new_forums?, chat? },
//     coordinator: { email?, name?, surname? },
//     teacher: { email?, name?, surname? }   // 1 profesor por simplicidad
//   }

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

function setIf(form: URLSearchParams, key: string, val: any) {
    if (val === null || val === undefined || val === "") return;
    form.set(key, String(val));
}
function setBool(form: URLSearchParams, key: string, val: any) {
    if (val === null || val === undefined) return;
    form.set(key, val ? "1" : "0");
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

    let body: any;
    try { body = await req.json(); }
    catch { return json(400, { error: "invalid_json" }); }

    const courseid = Number(body?.courseid);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const type = typeof body?.type === "string" ? body.type.toUpperCase() : "";

    if (!courseid) return json(400, { error: "courseid_required" });
    if (!name) return json(400, { error: "name_required" });
    if (type !== "A" && type !== "S") return json(400, { error: "type_invalid", detail: "type debe ser 'A' (asíncrono) o 'S' (síncrono)" });

    if (type === "A" && !body?.days_duration) return json(400, { error: "days_duration_required_for_async" });
    if (type === "S" && (!body?.start_date || !body?.end_date)) return json(400, { error: "dates_required_for_sync" });

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let token: string;
    try { token = await getToken(sb); }
    catch (err) { return json(502, { error: "token_failed", detail: String(err) }); }

    const form = new URLSearchParams();
    form.set("courseid", String(courseid));
    form.set("name", name);
    form.set("type", type);

    if (type === "A") setIf(form, "days_duration", body.days_duration);
    if (type === "S") {
        setIf(form, "start_date", body.start_date);
        setIf(form, "end_date", body.end_date);
    }

    setIf(form, "class_hours", body.class_hours);
    setBool(form, "hide_remaining_time", body.hide_remaining_time);
    setIf(form, "sequential", body.sequential);
    setIf(form, "min_grade", body.min_grade);
    setIf(form, "min_off", body.min_off);
    setIf(form, "access_after_finish", body.access_after_finish);
    setIf(form, "rating", body.rating);

    const cr = body?.criteria || {};
    setIf(form, "criteria[min_grade]", cr.min_grade);
    setIf(form, "criteria[percent_total]", cr.percent_total);
    setIf(form, "criteria[videoconference_hours]", cr.videoconference_hours);
    setIf(form, "criteria[percent_videoconference_hours]", cr.percent_videoconference_hours);
    setIf(form, "criteria[percent_hours_conected]", cr.percent_hours_conected);
    setIf(form, "criteria[percent_assesables]", cr.percent_assesables);

    const co = body?.communication || {};
    setBool(form, "communication[msg_teacher]", co.msg_teacher);
    setBool(form, "communication[msg_learners]", co.msg_learners);
    setBool(form, "communication[forums]", co.forums);
    setBool(form, "communication[open_new_forums]", co.open_new_forums);
    setBool(form, "communication[chat]", co.chat);

    const coord = body?.coordinator || {};
    if (coord.email && coord.name && coord.surname) {
        setIf(form, "coordinator[email]", coord.email);
        setIf(form, "coordinator[name]", coord.name);
        setIf(form, "coordinator[surname]", coord.surname);
    }

    const teacher = body?.teacher || {};
    if (teacher.email && teacher.name && teacher.surname) {
        setIf(form, "teacher[0][email]", teacher.email);
        setIf(form, "teacher[0][name]", teacher.name);
        setIf(form, "teacher[0][surname]", teacher.surname);
    }

    try {
        const res = await fetch(`${EVOL_BASE}/newGroup`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/x-www-form-urlencoded",
                Accept: "application/json",
            },
            body: form.toString(),
        });
        const text = await res.text();
        if (!res.ok) throw new Error(`newGroup ${res.status}: ${text}`);
        const data = JSON.parse(text);
        if (data?.result !== 1 && data?.result !== "1") {
            return json(502, { error: "newGroup_failed", detail: data?.message || text });
        }
        return json(200, { ok: true, groupid: data.groupid, teacher: data.teacher });
    } catch (err) {
        return json(502, { error: "newGroup_failed", detail: String(err) });
    }
});
