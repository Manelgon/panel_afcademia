import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Modifica un grupo existente en evolCampus (updateGroup).
// Body esperado:
//   {
//     groupid (req),
//     name?, days_duration?, start_date?, end_date?,
//     class_hours?, hide_remaining_time?, sequential? (0|1),
//     min_grade?, min_off?, access_after_finish? (0|1|2), rating? (0|1),
//     criteria: { min_grade?, percent_total?, videoconference_hours?, percent_videoconference_hours?, percent_hours_conected?, percent_assesables? },
//     communication: { msg_teacher?, msg_learners?, forums?, open_new_forums?, chat? },
//     coordinator: { email?, name?, surname? },
//     teacher: { email?, name?, surname? }
//   }
// Solo se envían a evolCampus los campos presentes en el body (omitidos = sin cambio).

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

    const groupid = Number(body?.groupid);
    if (!groupid) return json(400, { error: "groupid_required" });

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let token: string;
    try { token = await getToken(sb); }
    catch (err) { return json(502, { error: "token_failed", detail: String(err) }); }

    const form = new URLSearchParams();
    form.set("groupid", String(groupid));

    setIf(form, "name", body.name);
    setIf(form, "days_duration", body.days_duration);
    setIf(form, "start_date", body.start_date);
    setIf(form, "end_date", body.end_date);
    setIf(form, "class_hours", body.class_hours);
    setBool(form, "hide_remaining_time", body.hide_remaining_time);
    setIf(form, "sequential", body.sequential);
    setIf(form, "min_grade", body.min_grade);
    setIf(form, "min_off", body.min_off);
    setIf(form, "access_after_finish", body.access_after_finish);
    setIf(form, "rating", body.rating);

    const c = body.criteria || {};
    setIf(form, "criteria[min_grade]", c.min_grade);
    setIf(form, "criteria[percent_total]", c.percent_total);
    setIf(form, "criteria[videoconference_hours]", c.videoconference_hours);
    setIf(form, "criteria[percent_videoconference_hours]", c.percent_videoconference_hours);
    setIf(form, "criteria[percent_hours_conected]", c.percent_hours_conected);
    setIf(form, "criteria[percent_assesables]", c.percent_assesables);

    const cm = body.communication || {};
    setBool(form, "communication[msg_teacher]", cm.msg_teacher);
    setBool(form, "communication[msg_learners]", cm.msg_learners);
    setBool(form, "communication[forums]", cm.forums);
    setBool(form, "communication[open_new_forums]", cm.open_new_forums);
    setBool(form, "communication[chat]", cm.chat);

    const coord = body.coordinator || {};
    setIf(form, "coordinator[email]", coord.email);
    setIf(form, "coordinator[name]", coord.name);
    setIf(form, "coordinator[surname]", coord.surname);

    const teach = body.teacher || {};
    setIf(form, "teacher[0][email]", teach.email);
    setIf(form, "teacher[0][name]", teach.name);
    setIf(form, "teacher[0][surname]", teach.surname);

    try {
        const res = await fetch(`${EVOL_BASE}/updateGroup`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/x-www-form-urlencoded",
                Accept: "application/json",
            },
            body: form.toString(),
        });
        const text = await res.text();
        if (!res.ok) throw new Error(`updateGroup ${res.status}: ${text}`);
        const data = JSON.parse(text);
        if (data?.result === 0 || data?.result === "0") {
            return json(502, { error: "update_failed", detail: data?.message || text });
        }
        return json(200, { ok: true, ...data });
    } catch (err) {
        return json(502, { error: "update_failed", detail: String(err) });
    }
});
