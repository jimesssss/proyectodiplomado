import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { z } from 'zod';
import type { JwtService } from '../../../../core/auth/jwt.js';
import { requireAuth } from '../../../../core/auth/middleware.js';
import { successResponse } from '../../../../core/http/envelope.js';
import { validate } from '../../../../core/validation/validate.js';
import {
  changePassword,
  getProfile,
  login,
  logout,
  refresh,
} from '../../application/auth-service.js';
import {
  changePasswordBodySchema,
  loginBodySchema,
  refreshBodySchema,
} from '../validators/auth-validators.js';

export interface AuthRouterDeps {
  readonly jwt: JwtService;
  readonly accessTokenTtl: number;
  readonly refreshTokenTtl: number;
  readonly isSessionActive: (sessionId: string, userId: string) => Promise<boolean>;
}

export function createAuthRouter(deps: AuthRouterDeps): Router {
  const router = Router();
  const authDeps = {
    jwt: deps.jwt,
    accessTokenTtl: deps.accessTokenTtl,
    refreshTokenTtl: deps.refreshTokenTtl,
  };
  const auth: RequestHandler = requireAuth(deps.jwt, deps.isSessionActive);

  router.post('/login', validate({ body: loginBodySchema }), async (req, res) => {
    const body = req.body as z.infer<typeof loginBodySchema>;
    const tokens = await login(authDeps, {
      email: body.email,
      password: body.password,
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
    const tokens = await refresh(authDeps, body.refreshToken);
    res.status(200).json(successResponse(req.requestId, tokens));
  });

  router.post('/logout', auth, async (req, res) => {
    const user = req.user;
    if (user === undefined) {
      throw new Error('requireAuth should populate request.user');
    }
    await logout(user.sessionId);
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
      const { getProfile: loadProfile } = await import('../../application/auth-service.js');
      const profile = await loadProfile(user.userId);
      const fullUser = { ...profile, createdAt: new Date(), updatedAt: new Date() };
      await changePassword(fullUser, user.sessionId, body.currentPassword, body.newPassword);
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
