import { useEffect, useState } from 'react';

type VerificationState = 'loading' | 'success' | 'invalid' | 'expired' | 'error';

const DEFAULT_API_BASE_URL = 'https://erp-sc-api.onrender.com/api/v1';
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? DEFAULT_API_BASE_URL;

export async function verifyEmail(token: string, apiBaseUrl = API_BASE_URL): Promise<{ ok: boolean; status: VerificationState; message: string }> {
  const response = await fetch(`${apiBaseUrl}/auth/verify-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token }),
  });

  const body = await response.json().catch(() => null);

  if (!response.ok || body?.success !== true || body?.data?.verified !== true) {
    const msg = typeof body?.error?.message === 'string' ? body.error.message : '';
    const lower = msg.toLowerCase();
    if (response.status >= 500 || response.status === 429 || response.status === 403) {
      return { ok: false, status: 'error', message: response.status === 403 ? 'Esta cuenta no puede activarse mediante este enlace. Contacta con tu administrador.' : 'El servicio no está disponible. Inténtalo nuevamente.' };
    }
    if (lower.includes('expir') && !lower.includes('invalid')) {
      return {
        ok: false,
        status: 'expired',
        message: 'El enlace de verificación expiró.',
      };
    }

    return {
      ok: false,
      status: 'invalid',
      message: 'No se pudo verificar la cuenta',
    };
  }

  return {
    ok: true,
    status: 'success',
    message: 'Cuenta verificada correctamente',
  };
}

export async function resendVerification(email: string, apiBaseUrl = API_BASE_URL): Promise<{ ok: boolean; alreadyVerified: boolean; message: string }> {
  const response = await fetch(`${apiBaseUrl}/auth/resend-verification`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });

  const body = await response.json().catch(() => null);

  if (!response.ok || body?.success !== true) {
    const msg = typeof body?.error?.message === 'string' ? body.error.message : 'No se pudo reenviar el correo.';
    return { ok: false, alreadyVerified: false, message: msg };
  }

  const alreadyVerified = body?.data?.alreadyVerified === true;
  if (alreadyVerified) {
    return { ok: true, alreadyVerified: true, message: 'Esta cuenta ya estaba verificada. Puedes iniciar sesión en ERP-SC.' };
  }

  return { ok: true, alreadyVerified: false, message: 'Se ha reenviado el correo de verificación.' };
}

export default function App() {
  const [state, setState] = useState<VerificationState>('loading');
  const [message, setMessage] = useState('Verificando tu cuenta...');
  const [email, setEmail] = useState('');
  const [resendMessage, setResendMessage] = useState('');
  const [resendError, setResendError] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (!token || token.trim().length === 0) {
      setState('invalid');
      setMessage('No se pudo verificar la cuenta');
      return;
    }

    let mounted = true;

    void (async () => {
      try {
        const result = await verifyEmail(token);
        if (!mounted) return;
        setState(result.status);
        setMessage(result.message);
      } catch {
        if (!mounted) return;
        setState('error');
        setMessage('No se pudo conectar con ERP-SC. Inténtalo nuevamente.');
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const submitResend = async () => {
    if (!email.trim()) {
      setResendError(true);
      setResendMessage('Introduce tu correo para reenviar la verificación.');
      return;
    }

    try {
      const result = await resendVerification(email.trim());
      if (result.alreadyVerified) {
        setState('success');
        setMessage(result.message);
        setResendError(false);
        setResendMessage('');
        return;
      }
      setResendError(!result.ok);
      setResendMessage(result.message);
    } catch {
      setResendError(true);
      setResendMessage('No se pudo conectar con ERP-SC. Inténtalo nuevamente.');
    }
  };

  const titleMap: Record<VerificationState, string> = {
    loading: 'Verificando tu cuenta...',
    success: 'Cuenta verificada correctamente',
    invalid: 'No se pudo verificar la cuenta',
    expired: 'El enlace de verificación expiró',
    error: 'No se pudo completar la verificación',
  };

  return (
    <main className="page-shell">
      <section className="verification-card">
        <div className="brand-row">
          <div className="brand-badge">ERP-SC</div>
        </div>

        <h1>{titleMap[state]}</h1>
        <p className="message">{message}</p>

        {state === 'success' && (
          <>
            <p className="helper">
              Tu correo ya está verificado. Ahora puedes iniciar sesión en ERP-SC.
            </p>
            <button className="primary-button" onClick={() => (window.location.href = 'erp-sc:///login')}>
              Iniciar sesión
            </button>
          </>
        )}

        {state === 'invalid' && (
          <>
            <p className="helper">El enlace de verificación no es válido.</p>
            <div className="resend-box">
              <label htmlFor="email">Correo electrónico</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="tucorreo@empresa.com"
              />
              <button className="secondary-button" onClick={submitResend}>
                Reenviar correo de verificación
              </button>
              {resendMessage && (
                <p className={resendError ? 'resend-message error' : 'resend-message success'}>{resendMessage}</p>
              )}
            </div>
          </>
        )}

        {state === 'expired' && (
          <>
            <p className="helper">El enlace de verificación ya no es válido. Puedes solicitar uno nuevo.</p>
            <div className="resend-box">
              <label htmlFor="email-expired">Correo electrónico</label>
              <input
                id="email-expired"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="tucorreo@empresa.com"
              />
              <button className="secondary-button" onClick={submitResend}>
                Reenviar correo de verificación
              </button>
              {resendMessage && (
                <p className={resendError ? 'resend-message error' : 'resend-message success'}>{resendMessage}</p>
              )}
            </div>
          </>
        )}

        {(state === 'invalid' || state === 'expired') && (
          <>
            <p className="helper">Si tu cuenta ya está verificada, puedes iniciar sesión en la aplicación ERP-SC.</p>
            <button className="primary-button" onClick={() => (window.location.href = 'erp-sc:///login')}>
              Iniciar sesión
            </button>
          </>
        )}

        {state === 'error' && (
          <>
            <p className="helper">Revisa el mensaje e inténtalo nuevamente.</p>
            <button className="primary-button" onClick={() => window.location.reload()}>
              Reintentar
            </button>
          </>
        )}
      </section>
    </main>
  );
}
