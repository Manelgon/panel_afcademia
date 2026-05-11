import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Prueba la conexión con evolCampus usando las credenciales del Vault.
// Devuelve { ok, clientid, message }.

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

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1) Leer credenciales del Vault.
    let clientid: string | null = null;
    let key: string | null = null;
    try {
        const { data, error } = await sb.rpc("get_evolcampus_credentials");
        if (error) {
            return json(200, { ok: false, configured: false, message: "No hay credenciales configuradas." });
        }
        clientid = data?.clientid ?? null;
        key = data?.key ?? null;
    } catch (err) {
        return json(200, { ok: false, configured: false, message: "No hay credenciales configuradas." });
    }
    if (!clientid || !key) {
        return json(200, { ok: false, configured: false, message: "No hay credenciales configuradas." });
    }

    // 2) Pedir token con esas credenciales.
    try {
        const res = await fetch(`${EVOL_BASE}/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientid: Number(clientid), key }),
        });
        const text = await res.text();
        if (!res.ok) {
            return json(200, {
                ok: false,
                configured: true,
                clientid,
                message: `evolCampus rechazó las credenciales (${res.status}).`,
                detail: text.slice(0, 300)
            });
        }
        const body = JSON.parse(text);
        if (!body?.token) {
            return json(200, {
                ok: false,
                configured: true,
                clientid,
                message: "Respuesta de evolCampus inesperada.",
                detail: text.slice(0, 300)
            });
        }
        return json(200, {
            ok: true,
            configured: true,
            clientid,
            message: "Conectado correctamente con evolCampus."
        });
    } catch (err) {
        return json(200, {
            ok: false,
            configured: true,
            clientid,
            message: "No se pudo contactar con evolCampus.",
            detail: String(err)
        });
    }
});
