import { requestContext } from '#common/request-context.js';

const DEFAULT_TENANT_SCHEMA = 'public';

/**
 * Stub for the future Passport-based auth. Real strategies will populate
 * identity from the authenticated principal; for now every request is
 * pinned to a single default tenant schema.
 *
 * `run` (not `enterWith`) scopes the store to this request: Fastify continues the
 * request lifecycle from `done`, so every later hook and the handler see this identity,
 * while nothing leaks into the caller's async context or other requests.
 */
export function setIdentity(request, _reply, done) {
  requestContext.run(
    {
      identity: {
        tenantSchema: DEFAULT_TENANT_SCHEMA,
      },
    },
    done,
  );
}
