import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type FormLinkPayload = {
  email: string;
  public_url: string;
  empresa?: string;
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FUNCTION_SECRET = Deno.env.get("SEND_FUNDAE_FORM_LINK_SECRET");

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

function renderHtml(p: FormLinkPayload) {
  const empresa = escapeHtml(p.empresa && p.empresa.trim() !== "" ? p.empresa : "Administrador");
  const url = encodeURI(p.public_url);
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
    .highlight-box { background-color: #ffffff; border: 1px solid #e5e7eb; padding: 30px; margin: 25px 0; border-radius: 12px; text-align: center; }
    .btn { display: inline-block; background-color: #f97316; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 18px; font-weight: 700; letter-spacing: 0.5px; }
    .info-box { background-color: #f0f9ff; border-left: 4px solid #003865; padding: 20px; margin: 25px 0; border-radius: 0 8px 8px 0; }
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
      <p>Desde <strong>AFCademIA</strong> estamos gestionando tu expediente de formación bonificada <strong>FUNDAE</strong>. Para continuar, necesitamos que completes un breve formulario con los datos de tu empresa.</p>
      <div class="info-box">
        <p style="margin: 0; font-size: 14px;"><strong>¿Qué necesitarás?</strong></p>
        <ul style="margin: 10px 0 0 0; padding-left: 20px; font-size: 14px; color: #555;">
          <li>Nombre de la empresa y CIF</li>
          <li>Teléfono y email de contacto</li>
          <li>Número de trabajadores/alumnos</li>
        </ul>
      </div>
      <div class="highlight-box">
        <p style="color: #003865; font-size: 16px; margin: 0 0 20px 0; font-weight: 600;">Accede al formulario de forma segura:</p>
        <a href="${url}" class="btn" style="color: #ffffff;">Completar Formulario FUNDAE</a>
        <p style="color: #6b7280; font-size: 12px; margin: 20px 0 0 0;">Se te pedirá verificar tu identidad con un código por email</p>
      </div>
      <p style="font-size: 14px; color: #666;"><strong>¿Cómo funciona?</strong></p>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 12px 8px 0; vertical-align: top;">
            <span style="background-color: #f97316; color: white; width: 24px; height: 24px; border-radius: 50%; display: inline-block; text-align: center; line-height: 24px; font-weight: 700; font-size: 13px;">1</span>
          </td>
          <td style="padding: 8px 0; font-size: 14px;">Haz clic en el botón y solicita tu código de verificación</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px 8px 0; vertical-align: top;">
            <span style="background-color: #f97316; color: white; width: 24px; height: 24px; border-radius: 50%; display: inline-block; text-align: center; line-height: 24px; font-weight: 700; font-size: 13px;">2</span>
          </td>
          <td style="padding: 8px 0; font-size: 14px;">Introduce el código de 6 dígitos que recibirás en este email</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px 8px 0; vertical-align: top;">
            <span style="background-color: #f97316; color: white; width: 24px; height: 24px; border-radius: 50%; display: inline-block; text-align: center; line-height: 24px; font-weight: 700; font-size: 13px;">3</span>
          </td>
          <td style="padding: 8px 0; font-size: 14px;">Completa los datos del formulario y envía</td>
        </tr>
      </table>
      <p style="margin-top: 25px; font-size: 13px; color: #999;">⏰ Este enlace tiene una validez de <strong>48 horas</strong>. Si expira, solicita uno nuevo a tu gestor.</p>
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

function renderText(p: FormLinkPayload) {
  const empresa = p.empresa && p.empresa.trim() !== "" ? p.empresa : "Administrador";
  return [
    `Hola ${empresa},`,
    "",
    "Desde AFCademIA estamos gestionando tu expediente de formación bonificada FUNDAE.",
    "Para continuar, necesitamos que completes un breve formulario con los datos de tu empresa.",
    "",
    `Acceder al formulario: ${p.public_url}`,
    "",
    "Te pediremos verificar tu identidad con un código de 6 dígitos enviado a este email.",
    "",
    "Este enlace tiene una validez de 48 horas. Si expira, solicita uno nuevo a tu gestor.",
    "",
    "Un saludo,",
    "El equipo de AFCademIA",
  ].join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  if (!RESEND_API_KEY) return json(500, { error: "missing_resend_api_key" });

  if (FUNCTION_SECRET) {
    const provided = req.headers.get("x-function-secret");
    if (provided !== FUNCTION_SECRET) return json(401, { error: "unauthorized" });
  }

  let body: Partial<FormLinkPayload>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const email = (body.email ?? "").trim();
  const publicUrl = (body.public_url ?? "").trim();
  if (!email || !publicUrl) return json(400, { error: "missing_email_or_public_url" });

  const payload: FormLinkPayload = {
    email,
    public_url: publicUrl,
    empresa: body.empresa,
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
      subject: "Tu formulario FUNDAE — AFCademIA",
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
