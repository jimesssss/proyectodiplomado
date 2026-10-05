import { createHash } from 'node:crypto';
import { ServiceUnavailableError } from '../errors/app-error.js';

export interface ResendEmailConfig {
  readonly apiKey?: string;
  readonly fromEmail?: string;
  readonly fromName?: string;
  readonly appBaseUrl?: string;
}

export interface SendEmailParams {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

export function getResendConfig(): ResendEmailConfig {
  return {
    apiKey: process.env.RESEND_API_KEY,
    fromEmail: process.env.RESEND_FROM_EMAIL,
    fromName: process.env.RESEND_FROM_NAME ?? 'ERP-SC',
    appBaseUrl: process.env.APP_BASE_URL,
  };
}

export function buildVerificationUrl(token: string, baseUrl = process.env.APP_BASE_URL): string {
  const url = new URL('/verify-email', baseUrl ?? 'https://localhost');
  url.searchParams.set('token', token);
  return url.toString();
}

export function buildVerificationEmailHtml(name: string, verifyUrl: string): string {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #18212f;">
      <h2 style="color: #0f172a;">Bienvenido a ERP-SC</h2>
      <p>Hola <strong>${name}</strong>,</p>
      <p>Gracias por registrarte en ERP-SC, el sistema integral para la gestión de productos informáticos.</p>
      <p>Para verificar tu cuenta y activar tu acceso, pulsa el siguiente botón:</p>
      <p>
        <a href="${verifyUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: bold;">
          Verificar cuenta
        </a>
      </p>
      <p>Este enlace expirará en 24 horas.</p>
      <p>Si no has solicitado este registro, puedes ignorar este mensaje.</p>
    </div>
  `;
}

export function buildWelcomeEmailHtml(name: string): string {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #18212f;">
      <h2 style="color: #0f172a;">¡Tu cuenta ya está activa!</h2>
      <p>Hola <strong>${name}</strong>,</p>
      <p>Tu cuenta de ERP-SC ya ha sido verificada con éxito.</p>
      <p>Ahora puedes acceder al sistema integral para la gestión de productos informáticos.</p>
      <p>Gracias por formar parte de ERP-SC.</p>
    </div>
  `;
}

export function buildVerificationEmailText(name: string, verifyUrl: string): string {
  return `ERP-SC\n\nBienvenido ${name}.\n\nVerifica tu cuenta aquí: ${verifyUrl}\n\nEste enlace vence en 24 horas.\n\nSi no solicitaste esta cuenta, ignora este correo.`;
}

export function buildWelcomeEmailText(name: string): string {
  return `ERP-SC\n\nHola ${name}.\n\nTu cuenta ya ha sido verificada y activada.\n\nPuedes empezar a usar ERP-SC, el sistema integral para la gestión de productos informáticos.`;
}

export function hashVerificationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function sendResendEmail(
  params: SendEmailParams,
  config: ResendEmailConfig = getResendConfig(),
): Promise<void> {
  if (!config.apiKey || !config.fromEmail) {
    return;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${config.fromName ?? 'ERP-SC'} <${config.fromEmail}>`,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
    }),
  });

  if (!response.ok) {
    throw new ServiceUnavailableError('Email delivery failed');
  }
}
