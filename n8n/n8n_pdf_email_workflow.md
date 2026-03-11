# n8n Workflow: Enviar PDF por Email al Guardar Formulario FUNDAE

## Flujo Completo

```
[Webhook] → [Code: Preparar Email HTML] → [Send Email (SMTP)]
```

## Paso 1: Webhook Node

1. Añadir nodo **Webhook**
2. Configurar:
   - **HTTP Method**: `POST`
   - **Path**: `fundae-pdf-email`
3. Copiar la **Production URL** → Pegarla en tu `.env` como:
   ```
   VITE_WEBHOOK_PDF_EMAIL=https://tu-n8n.com/webhook/fundae-pdf-email
   ```

## Paso 2: Code Node – "Preparar Email HTML + Adjunto"

Conectar al Webhook. Pegar este código:

```javascript
const data = $input.first().json;

const empresa = data.empresa || "Cliente";
const representante = data.representante || "";
const email = data.email || "";
const cif = data.cif || "";
const pdfBase64 = data.pdf_base64 || "";
const pdfFilename = data.pdf_filename || "Expediente_FUNDAE.pdf";
const headerImg = "https://tfwnekfuqxpnezbjcbpj.supabase.co/storage/v1/object/public/public_images/afcademia_header_email.png";

const emailHtml = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background-color:#f4f4f7; font-family: 'Segoe UI', Arial, sans-serif;">
    <div style="max-width:600px; margin:0 auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        
        <!-- Header con imagen -->
        <div style="background: linear-gradient(135deg, #E65A1E 0%, #FF8A50 100%); padding:0;">
            <img src="${headerImg}" alt="AFC Academia" style="width:100%; display:block;" />
        </div>  

        <!-- Contenido -->
        <div style="padding:32px 28px;">
            <h1 style="color:#E65A1E; font-size:22px; margin:0 0 8px 0; font-weight:800;">
                📄 Expediente FUNDAE Recibido
            </h1>
            <p style="color:#888; font-size:13px; margin:0 0 24px 0;">
                Documentación pendiente de firma
            </p>

            <div style="background:#FFF7F2; border-left:4px solid #E65A1E; border-radius:8px; padding:16px 20px; margin-bottom:24px;">
                <p style="margin:0 0 4px 0; color:#333; font-size:14px;">
                    <strong>Empresa:</strong> ${empresa}
                </p>
                <p style="margin:0 0 4px 0; color:#333; font-size:14px;">
                    <strong>CIF:</strong> ${cif}
                </p>
                <p style="margin:0; color:#333; font-size:14px;">
                    <strong>Representante:</strong> ${representante}
                </p>
            </div>

            <p style="color:#333; font-size:14px; line-height:1.7; margin:0 0 16px 0;">
                Estimado/a <strong>${representante || empresa}</strong>,
            </p>
            <p style="color:#333; font-size:14px; line-height:1.7; margin:0 0 16px 0;">
                Hemos recibido correctamente los datos de su empresa para la gestión de formación bonificada a través de FUNDAE.
            </p>
            <p style="color:#333; font-size:14px; line-height:1.7; margin:0 0 16px 0;">
                Adjunto a este email encontrará el documento PDF que contiene:
            </p>
            <ul style="color:#333; font-size:14px; line-height:1.8; margin:0 0 16px 0; padding-left:20px;">
                <li><strong>Ficha de Empresa</strong> con sus datos registrados</li>
                <li><strong>Adhesión al Contrato de Encomienda de Formación</strong></li>
            </ul>

            <!-- Instrucciones destacadas -->
            <div style="background:linear-gradient(135deg, #E65A1E, #FF8A50); border-radius:12px; padding:20px 24px; margin:24px 0; text-align:center;">
                <p style="color:#fff; font-size:15px; font-weight:700; margin:0 0 8px 0;">
                    ✍️ Próximo paso
                </p>
                <p style="color:rgba(255,255,255,0.9); font-size:13px; margin:0; line-height:1.6;">
                    Por favor, <strong>imprima el documento</strong>, fírmelo y séllelo en los espacios indicados al final, y envíenoslo de vuelta a:
                </p>
                <p style="margin:10px 0 0 0;">
                    <a href="mailto:afcademia@gmail.com" style="color:#fff; font-size:15px; font-weight:800; text-decoration:none;">
                        📧 afcademia@gmail.com
                    </a>
                </p>
            </div>

            <p style="color:#666; font-size:13px; line-height:1.6; margin:24px 0 0 0;">
                Si tiene alguna duda o necesita asistencia, no dude en contactarnos. Estamos encantados de ayudarle.
            </p>
        </div>

        <!-- Footer -->
        <div style="background:#f8f8fa; padding:20px 28px; text-align:center; border-top:1px solid #eee;">
            <p style="margin:0 0 4px 0; color:#888; font-size:11px; font-weight:600; letter-spacing:1px; text-transform:uppercase;">
                AFC Academia · Formación Bonificada FUNDAE
            </p>
            <p style="margin:0; color:#aaa; font-size:10px;">
                Este email ha sido generado automáticamente. © ${new Date().getFullYear()} AFC Academia S.L.
            </p>
        </div>
    </div>
</body>
</html>
`;

return [{
    json: {
        to: email,
        subject: `📄 Expediente FUNDAE – ${empresa} – Pendiente de Firma`,
        html: emailHtml,
        pdf_base64: pdfBase64,
        pdf_filename: pdfFilename
    }
}];
```

## Paso 3: Send Email Node (SMTP)

1. Añadir nodo **Send Email**
2. Configurar:
   - **From**: `afcademia@gmail.com`
   - **To**: `{{ $json.to }}`
   - **Subject**: `{{ $json.subject }}`
   - **HTML Body**: `{{ $json.html }}`
   - **Attachments**: Añadir Binary Data
3. **IMPORTANTE – Adjunto PDF**: Antes del Send Email, añadir un nodo **Code** intermedio que convierta base64 a binary:

### Nodo Code Extra: "Base64 a Binary"

```javascript
const data = $input.first().json;
const binaryData = Buffer.from(data.pdf_base64, 'base64');

return [{
    json: {
        to: data.to,
        subject: data.subject,
        html: data.html
    },
    binary: {
        attachment: {
            data: binaryData.toString('base64'),
            mimeType: 'application/pdf',
            fileName: data.pdf_filename || 'Expediente_FUNDAE.pdf'
        }
    }
}];
```

4. En el nodo **Send Email**:
   - **Attachments**: `attachment` (el nombre del campo binary)

## Flujo Final

```
[Webhook] → [Code: Preparar HTML] → [Code: Base64→Binary] → [Send Email SMTP]
```

## Variable de Entorno

Añadir al `.env`:
```
VITE_WEBHOOK_PDF_EMAIL=https://tu-n8n-url/webhook/fundae-pdf-email
```
