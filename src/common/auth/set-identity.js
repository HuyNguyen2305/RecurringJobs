import { requestContext } from '#common/request-context.js';

const DEFAULT_TENANT_SCHEMA = 'public';

/**
 * Stub for the future Passport-based auth. Real strategies will populate
 * identity from the authenticated principal; for now every request is
 * pinned to a single default tenant schema.
 */
export function setIdentity(request, _reply, done) {
  requestContext.enterWith({
    identity: {
      tenantSchema: DEFAULT_TENANT_SCHEMA,
    },
  });
  done();
}
