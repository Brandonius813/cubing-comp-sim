import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { ApiError } from './errors.js';
import type { VerifyAccount, VerifiedAccount } from './auth.js';
import { MAX_SAVE_BYTES, SaveService, uploadHeaders } from './saves.js';

declare module 'fastify' {
  interface FastifyRequest { account: VerifiedAccount | null; uploadSlot: boolean }
}

export async function createApi(options: {
  saves: SaveService; verifyAccount: VerifyAccount; origins: string[];
  release?: string; logLevel?: string; logging?: boolean;
}) {
  const app = Fastify({
    bodyLimit: MAX_SAVE_BYTES, requestTimeout: 120_000, connectionTimeout: 10_000,
    disableRequestLogging: true,
    logger: options.logging === false ? false : {
      level: options.logLevel ?? 'info', base: { release: options.release ?? 'development' },
      serializers: { req: req => ({ id: req.id, method: req.method }), res: res => ({ statusCode: res.statusCode }) },
      redact: ['req.headers.authorization', 'req.headers.cookie', 'body', 'password', 'email', 'access_token', 'refresh_token'],
    },
  });
  app.decorateRequest('account', null);
  app.decorateRequest('uploadSlot', false);
  await app.register(cors, { origin: options.origins, credentials: false, methods: ['GET', 'PUT', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'If-Match', 'Idempotency-Key'], exposedHeaders: ['ETag'], maxAge: 600 });
  await app.register(rateLimit, { max: 60, timeWindow: '1 minute' });
  let inFlightUploads = 0;
  const releaseSlot = (request: { uploadSlot: boolean }) => {
    if (request.uploadSlot) { request.uploadSlot = false; inFlightUploads--; }
  };

  app.addHook('onRequest', async request => {
    if (request.routeOptions.url === '/health' || request.method === 'OPTIONS') return;
    request.account = await options.verifyAccount(request.headers.authorization);
    if (!request.account.emailVerified) throw new ApiError(403, 'email_unverified');
    if (request.method === 'PUT' && request.routeOptions.url === '/v1/save') {
      if (inFlightUploads >= 2) throw new ApiError(429, 'upload_capacity');
      request.uploadSlot = true;
      inFlightUploads++;
    }
  });
  app.addHook('onRequestAbort', async request => { releaseSlot(request); });
  app.addHook('onResponse', async (request, reply) => {
    releaseSlot(request);
    request.log.info({ route: request.routeOptions.url ?? 'unknown', method: request.method, status: reply.statusCode, latencyMs: Math.round(reply.elapsedTime) }, 'request_completed');
  });
  app.addHook('onSend', async (_request, reply, payload) => { reply.header('Cache-Control', 'no-store'); reply.header('X-Content-Type-Options', 'nosniff'); return payload; });
  app.setErrorHandler((error, request, reply) => {
    const status = error instanceof ApiError ? error.status : error.statusCode === 413 ? 413 : error.statusCode === 429 ? 429 : error.statusCode === 400 ? 400 : 500;
    const code = error instanceof ApiError ? error.code : status === 413 ? 'too_large' : status === 429 ? 'rate_limited' : status === 400 ? 'invalid_request' : 'server_error';
    // Provider errors and body-parser errors can contain private data. Emit only
    // a stable code, request ID and route, never the raw exception or URL.
    if (status >= 500) request.log.error({ code, route: request.routeOptions.url ?? 'unknown' }, 'request_failed');
    void reply.status(status).send({ error: { code }, requestId: request.id });
  });

  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/v1/save/metadata', async request => ({ save: await options.saves.metadata(request.account!.id) }));
  app.get('/v1/save', async (request, reply) => {
    const result = await options.saves.download(request.account!.id);
    reply.header('ETag', `"${result.save.revision}"`);
    return result;
  });
  app.put('/v1/save', async (request, reply) => {
    const headers = uploadHeaders(typeof request.headers['if-match'] === 'string' ? request.headers['if-match'] : undefined, typeof request.headers['idempotency-key'] === 'string' ? request.headers['idempotency-key'] : undefined);
    const save = await options.saves.upload(request.account!.id, request.body, headers.expectedRevision, headers.operationId);
    reply.header('ETag', `"${save.revision}"`);
    return { save };
  });
  return app;
}
