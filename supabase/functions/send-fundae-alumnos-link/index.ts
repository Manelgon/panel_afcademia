import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type LinkPayload = {
  email: string;
  empresa?: string;
  public_url: string;
  num_alumnos?: number;
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FUNCTION_SECRET = Deno.env.get("SEND_FUNDAE_ALUMNOS_SECRET");

const FROM = "AFCademIA <fundae@documentos.afcademia.com>";
const REPLY_TO = "cursos@afcademia.com";
const HEADER_IMAGE =
  "https://tfwnekfuqxpnezbjcbpj.supabase.co/storage/v1/object/public/public_images/afcademia_header_email.png";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-function-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHtml(p: LinkPayload) {
  const empresa = escapeHtml(p.empresa && p.empresa.trim() !== "" ? p.empresa : "Administrador");
  const url = encodeURI(p.public_url);
  const alumnos = p.num_alumnos && p.num_alumnos > 0
    ? `<strong>${p.num_alumnos}</strong> ficha${p.num_alumnos === 1 ? "" : "s"} de inscripción`
    : "las fichas de inscripción";
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, sans-serif; line-height: 1.6; color: #333333; background-color: #f4f7f9; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    .header { background-color: #ffffff; text-align: center; overflow: hidden; }
    .header img { width: 100%; max-width: 600px; height: auto; display: block; border: 0; }
    .content { padding: 40px 30px; }
    .cta-box { text-align: center; margin: 30px 0; }
    .cta { display: inline-block; background-color: #003865; color: #ffffff !important; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 700; font-size: 16px; }
    .info-box { background-color: #f0f9ff; border-left: 4px solid #003865; padding: 20px; margin: 25px 0; border-radius: 0 8px 8px 0; font-size: 14px; color: #555; }
    .footer { padding: 30px; text-align: center; background-color: #f9fafb; font-size: 14px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <a href="https://afcademia.com" style="text-decoration: none;">
        <img src="${HEADER_IMAGE}" alt="Logo AFCademIA" border="0" />
      </a>
    </div>
    <div class="content">
      <h2 style="color: #003865; margin-top: 0;">Hola ${empresa},</h2>
      <p>Hemos recibido el pago de tu factura. ¡Gracias!</p>
      <p>El siguiente paso es completar ${alumnos} de los trabajadores que participarán en la formación bonificada por <strong>FUNDAE</strong>.</p>
      <div class="cta-box">
        <a class="cta" href="${url}">Rellenar fichas de alumnos</a>
      </div>
      <p style="font-size: 14px; color: #666;">Si el botón no funciona, abre este enlace en tu navegador:<br><a href="${url}" style="color: #003865; word-break: break-all;">${url}</a></p>
      <div class="info-box">
        🔒 Por seguridad, al abrir el enlace recibirás un código de verificación por email para iniciar la sesión. El código es válido durante toda la sesión de rellenado.
      </div>
      <p style="margin-top: 30px;">Un saludo,<br><strong>El equipo de AFCademIA</strong></p>
    </div>
    <div class="footer">
      <p>&copy; 2026 AFCademIA. Todos los derechos reservados.</p>
      <p>Formación Bonificada FUNDAE · Gestión Profesional</p>
    </div>
  </div>
</body>
</html>`;
}

function renderText(p: LinkPayload) {
  const empresa = p.empresa && p.empresa.trim() !== "" ? p.empresa : "Administrador";
  const alumnos = p.num_alumnos && p.num_alumnos > 0
    ? `${p.num_alumnos} ficha${p.num_alumnos === 1 ? "" : "s"} de inscripción`
    : "las fichas de inscripción";
  return [
    `Hola ${empresa},`,
    "",
    "Hemos recibido el pago de tu factura. ¡Gracias!",
    `El siguiente paso es completar ${alumnos} de los trabajadores que participarán en la formación bonificada por FUNDAE.`,
    "",
    `Accede aquí: ${p.public_url}`,
    "",
    "Por seguridad, al abrir el enlace recibirás un código de verificación por email.",
    "",
    "Un saludo,",
    "El equipo de AFCademIA",
  ].filter(Boolean).join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  if (!RESEND_API_KEY) return json(500, { error: "missing_resend_api_key" });

  if (FUNCTION_SECRET) {
    const provided = req.headers.get("x-function-secret");
    if (provided !== FUNCTION_SECRET) return json(401, { error: "unauthorized" });
  }

  let body: Partial<LinkPayload>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const email = (body.email ?? "").trim();
  const public_url = (body.public_url ?? "").trim();
  if (!email || !public_url) return json(400, { error: "missing_email_or_url" });

  const payload: LinkPayload = {
    email,
    public_url,
    empresa: body.empresa,
    num_alumnos: body.num_alumnos,
  };

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [email],
      reply_to: REPLY_TO,
      subject: "Fichas de inscripción de alumnos · FUNDAE",
      html: renderHtml(payload),
      text: renderText(payload),
    }),
  });

  const resendBody = await resendRes.text();
  if (!resendRes.ok) {
    return json(502, { error: "resend_failed", status: resendRes.status, detail: resendBody });
  }

  return json(200, { success: true, provider_response: safeJson(resendBody) });
});

function safeJson(s: string) {
  try { return JSON.parse(s); } catch { return s; }
}
