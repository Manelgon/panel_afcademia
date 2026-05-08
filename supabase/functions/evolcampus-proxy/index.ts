import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Proxy genérico para la API de evolCampus.
// El frontend autentica vía Supabase JWT (verify_jwt:true).
// Las credenciales (clientid, key) viven en Vault y nunca se exponen al cliente.

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

// Cache de credenciales y token JWT entre invocaciones del mismo worker.
let cachedClientId: string | null = null;
let cachedKey: string | null = null;
let cachedToken: string | null = null;
let cachedTokenExpires = 0; // epoch ms

async function loadCredentials() {
    if (cachedClientId && cachedKey) return;
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await sb.rpc("get_evolcampus_credentials");
    if (error) throw new Error(`credentials rpc failed: ${error.message}`);
    cachedClientId = data?.clientid ?? null;
    cachedKey = data?.key ?? null;
    if (!cachedClientId || !cachedKey) {
        throw new Error("evolCampus credentials missing in vault");
    }
}

async function getToken(): Promise<string> {
    const now = Date.now();
    if (cachedToken && cachedTokenExpires > now + 60_000) {
        return cachedToken;
    }
    await loadCredentials();
    const res = await fetch(`${EVOL_BASE}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientid: Number(cachedClientId), key: cachedKey }),
    });
    const text = await res.text();
    if (!res.ok) {
        throw new Error(`evolCampus /token ${res.status}: ${text}`);
    }
    let body: any;
    try { body = JSON.parse(text); } catch { body = null; }
    const token = body?.token;
    if (!token) throw new Error(`evolCampus /token: token missing in response: ${text}`);
    cachedToken = token;
    // JWT vida útil no documentada — refresco cada 50min para ir sobrados
    cachedTokenExpires = now + 50 * 60_000;
    return cachedToken;
}

async function callEvol(action: string, method: "GET" | "POST", params: Record<string, unknown> | undefined) {
    const token = await getToken();
    const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
    };

    let url = `${EVOL_BASE}/${action}`;
    let body: BodyInit | undefined;

    if (method === "POST") {
        // evolCampus espera form-urlencoded para los parámetros con notación array (enroll[groupid], etc.)
        const form = new URLSearchParams();
        flatten(params || {}, (k, v) => form.append(k, v));
        body = form.toString();
        headers["Content-Type"] = "application/x-www-form-urlencoded";
    }

    const res = await fetch(url, { method, headers, body });
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, ok: res.ok, data };
}

// Flatten { enroll: { groupid: 1 } } → enroll[groupid] = 1
function flatten(obj: any, push: (key: string, value: string) => void, prefix = "") {
    if (obj === null || obj === undefined) return;
    if (typeof obj !== "object") {
        push(prefix, String(obj));
        return;
    }
    for (const [k, v] of Object.entries(obj)) {
        const nextKey = prefix ? `${prefix}[${k}]` : k;
        if (v !== null && typeof v === "object" && !Array.isArray(v)) {
            flatten(v, push, nextKey);
        } else if (Array.isArray(v)) {
            v.forEach((item, i) => {
                if (item !== null && typeof item === "object") {
                    flatten(item, push, `${nextKey}[${i}]`);
                } else {
                    push(`${nextKey}[${i}]`, String(item));
                }
            });
        } else {
            push(nextKey, v === null || v === undefined ? "" : String(v));
        }
    }
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

    let body: { action?: string; method?: "GET" | "POST"; params?: Record<string, unknown> };
    try {
        body = await req.json();
    } catch {
        return json(400, { error: "invalid_json" });
    }

    const action = (body.action || "").trim();
    if (!action || action.includes("/") || action.includes("?")) {
        return json(400, { error: "invalid_action" });
    }
    const method = body.method === "GET" ? "GET" : "POST";

    try {
        const result = await callEvol(action, method, body.params);
        return new Response(JSON.stringify(result.data), {
            status: result.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (err) {
        return json(502, { error: "evolcampus_error", detail: String(err) });
    }
});
