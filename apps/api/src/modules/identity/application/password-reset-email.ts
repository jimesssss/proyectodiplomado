import { sendResendEmail } from '../../../core/email/resend.js';

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export function buildPasswordResetUrl(
  token: string,
  baseUrl = process.env.APP_BASE_URL,
): string {
  const url = new URL('/reset-password', baseUrl ?? 'https://localhost');
  url.searchParams.set('token', token);
  return url.toString();
}

export function buildPasswordResetEmailHtml(resetUrl: string): string {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #18212f;">
      <h2 style="color: #0f172a;">Restablece tu contraseña de ERP-SC</h2>
      <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>
      <p>ERP-SC es el sistema integral para la gestión de productos informáticos.</p>
      <p>
        <a href="${resetUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: bold;">
          Restablecer contraseña
        </a>
      </p>
      <p>Este enlace expirará en una hora y solo puede utilizarse una vez.</p>
      <p>Si no solicitaste este cambio, ignora este mensaje. Tu contraseña no cambiará sin completar el proceso.</p>
    </div>
  `;
}

export function buildPasswordResetEmailText(resetUrl: string): string {
  return [
    'ERP-SC — sistema integral para la gestión de productos informáticos',
    '',
    'Recibimos una solicitud para restablecer la contraseña de tu cuenta.',
    `Restablece tu contraseña: ${resetUrl}`,
    'Este enlace expirará en una hora y solo puede utilizarse una vez.',
    'Si no solicitaste este cambio, ignora este mensaje. Tu contraseña no cambiará sin completar el proceso.',
  ].join('\n\n');
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const resetUrl = buildPasswordResetUrl(token);
  await sendResendEmail({
    to,
    subject: 'Restablece tu contraseña de ERP-SC',
    html: buildPasswordResetEmailHtml(resetUrl),
    text: buildPasswordResetEmailText(resetUrl),
  });
}
