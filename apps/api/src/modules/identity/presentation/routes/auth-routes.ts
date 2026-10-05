import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { auditFromRequest } from '../../../../core/audit/audit.js';
import type { JwtService } from '../../../../core/auth/jwt.js';
import { requireAuth } from '../../../../core/auth/middleware.js';
import { isAppError } from '../../../../core/errors/app-error.js';
import { successResponse } from '../../../../core/http/envelope.js';
import { validate } from '../../../../core/validation/validate.js';
import {
  changePassword,
  forgotPassword,
  getProfile,
  login,
  logout,
  refresh,
  register,
  resetPassword,
  resendVerification,
  verifyEmail,
} from '../../application/auth-service.js';
import {
  changePasswordBodySchema,
  forgotPasswordBodySchema,
  loginBodySchema,
  refreshBodySchema,
  registerBodySchema,
  resetPasswordBodySchema,
  resendVerificationBodySchema,
  verifyEmailBodySchema,
} from '../validators/auth-validators.js';

export interface AuthRouterDeps {
  readonly jwt: JwtService;
  readonly accessTokenTtl: number;
  readonly refreshTokenTtl: number;
  readonly isSessionActive: (sessionId: string, userId: string) => Promise<boolean>;
  /** Estado del tenant (inyectado desde tenancy; ver AuthDeps). */
  readonly isTenantActive: (tenantId: string) => Promise<boolean>;
}

export function createAuthRouter(deps: AuthRouterDeps): Router {
  const router = Router();
  const authDeps = {
    jwt: deps.jwt,
    accessTokenTtl: deps.accessTokenTtl,
    refreshTokenTtl: deps.refreshTokenTtl,
    isTenantActive: deps.isTenantActive,
  };
  const auth: RequestHandler = requireAuth(deps.jwt, deps.isSessionActive);

  router.post(
    '/forgot-password',
    validate({ body: forgotPasswordBodySchema }),
    async (req, res) => {
      const body = req.body as z.infer<typeof forgotPasswordBodySchema>;
      await forgotPassword(body.email);
      res.status(200).json(
        successResponse(req.requestId, {
          message: 'If an account exists for this email, password reset instructions will be sent.',
        }),
      );
    },
  );

  router.post('/reset-password', validate({ body: resetPasswordBodySchema }), async (req, res) => {
    const body = req.body as z.infer<typeof resetPasswordBodySchema>;
    await resetPassword(body.token, body.newPassword);
    res.status(200).json(successResponse(req.requestId, { passwordReset: true }));
  });

  router.post('/register', validate({ body: registerBodySchema }), async (req, res) => {
    const body = req.body as z.infer<typeof registerBodySchema>;
    const result = await register({
      displayName: body.displayName,
      email: body.email,
      password: body.password,
    });
    await auditFromRequest(req, {
      action: 'auth.register',
      entityType: 'user',
      entityId: result.user.id,
      newValue: { email: result.user.email, roles: result.user.roles, status: result.user.status },
    });
    res.status(201).json(
      successResponse(req.requestId, {
        user: result.user,
        emailVerificationRequired: result.emailVerificationRequired,
      }),
    );
  });

  router.post('/verify-email', validate({ body: verifyEmailBodySchema }), async (req, res) => {
    const body = req.body as z.infer<typeof verifyEmailBodySchema>;
    const user = await verifyEmail(body.token);
    await auditFromRequest(req, {
      action: 'auth.verify_email',
      entityType: 'user',
      entityId: user.id,
      newValue: { email: user.email, status: user.status },
    });
    res.status(200).json(successResponse(req.requestId, { verified: true, user }));
  });

  router.post(
    '/resend-verification',
    validate({ body: resendVerificationBodySchema }),
    async (req, res) => {
      const body = req.body as z.infer<typeof resendVerificationBodySchema>;
      const result = await resendVerification(body.email);
      res.status(200).json(successResponse(req.requestId, result));
    },
  );

  router.post('/login', validate({ body: loginBodySchema }), async (req, res) => {
    const body = req.body as z.infer<typeof loginBodySchema>;
    // Los intentos fallidos auditan dentro de login() con su razón
    // (invalid_credentials, rate_limited, account_disabled, tenant_suspended).
    const tokens = await login(authDeps, {
      email: body.email,
      password: body.password,
      requestId: req.requestId,
      ...(body.tenantId !== undefined ? { tenantId: body.tenantId } : {}),
      ...(req.ip !== undefined ? { ip: req.ip } : {}),
      ...(req.header('user-agent') !== undefined
        ? { userAgent: req.header('user-agent') as string }
        : {}),
    });
    res.status(200).json(successResponse(req.requestId, tokens));
  });

  router.post('/refresh', validate({ body: refreshBodySchema }), async (req, res) => {
    const body = req.body as z.infer<typeof refreshBodySchema>;
    const tokens = await refresh(authDeps, body.refreshToken, {
      requestId: req.requestId,
      ...(req.ip !== undefined ? { ip: req.ip } : {}),
      ...(req.header('user-agent') !== undefined
        ? { userAgent: req.header('user-agent') as string }
        : {}),
    });
    res.status(200).json(successResponse(req.requestId, tokens));
  });

  router.post('/logout', auth, async (req, res) => {
    const user = req.user;
    if (user === undefined) {
      throw new Error('requireAuth should populate request.user');
    }
    await logout(user.sessionId);
    await auditFromRequest(req, {
      action: 'auth.logout',
      entityType: 'session',
      entityId: user.sessionId,
    });
    res.status(200).json(successResponse(req.requestId, { loggedOut: true }));
  });

  router.post(
    '/change-password',
    auth,
    validate({ body: changePasswordBodySchema }),
    async (req, res) => {
      const user = req.user;
      if (user === undefined) {
        throw new Error('requireAuth should populate request.user');
      }
      const body = req.body as z.infer<typeof changePasswordBodySchema>;
      try {
        await changePassword(user.userId, user.sessionId, body.currentPassword, body.newPassword);
      } catch (error) {
        await auditFromRequest(req, {
          action: 'auth.change_password.failed',
          entityType: 'user',
          entityId: user.userId,
          reason: isAppError(error) ? error.code : 'INTERNAL_ERROR',
        });
        throw error;
      }
      await auditFromRequest(req, {
        action: 'auth.change_password',
        entityType: 'user',
        entityId: user.userId,
      });
      res.status(200).json(successResponse(req.requestId, { passwordChanged: true }));
    },
  );

  router.get('/me', auth, async (req, res) => {
    const user = req.user;
    if (user === undefined) {
      throw new Error('requireAuth should populate request.user');
    }
    const profile = await getProfile(user.userId);
    res.status(200).json(successResponse(req.requestId, profile));
  });

  return router;
}
