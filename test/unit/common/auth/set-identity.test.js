import { setTimeout as delay } from 'node:timers/promises';
import Fastify from 'fastify';
import { setIdentity } from '#common/auth/set-identity.js';
import { requestContext } from '#common/request-context.js';

describe('setIdentity', () => {
  it('makes the identity available to an async route handler', async () => {
    const app = Fastify();
    app.addHook('onRequest', setIdentity);
    app.get('/identity', async () => {
      await delay(5);
      return requestContext.get('identity');
    });

    const response = await app.inject({ method: 'GET', url: '/identity' });
    await app.close();

    expect(response.json()).toEqual({ tenantSchema: 'public' });
  });

  it('scopes the identity to the request and does not leak it into the caller’s context', () => {
    let insideRequest;

    setIdentity({}, {}, () => {
      insideRequest = requestContext.get('identity');
    });

    expect(insideRequest).toEqual({ tenantSchema: 'public' });
    expect(requestContext.get('identity')).toBeUndefined();
  });
});
