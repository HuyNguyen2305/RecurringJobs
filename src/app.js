import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import autoload from '@fastify/autoload';

import { buildContainer } from './containter.js';
import { setIdentity } from '#common/auth/set-identity.js';
import { CustomError } from '#common/error.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function buildApp() {
  const app = Fastify({ logger: true });

  const container = buildContainer();
  app.decorate('container', container);

  app.addHook('onRequest', setIdentity);

  app.register(autoload, {
    dir: path.join(__dirname, 'routers'),
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof CustomError) {
      reply.code(error.statusCode).send({
        success: false,
        message: error.message,
        details: error.details,
      });
      return;
    }

    if (error.validation) {
      reply.code(400).send({
        success: false,
        message: error.message,
      });
      return;
    }

    if (error.name === 'SequelizeUniqueConstraintError') {
      reply.code(409).send({
        success: false,
        message: 'A record with those values already exists',
      });
      return;
    }

    if (error.name === 'SequelizeForeignKeyConstraintError') {
      reply.code(400).send({
        success: false,
        message: 'Referenced record does not exist',
      });
      return;
    }

    request.log.error(error);
    reply.code(500).send({
      success: false,
      message: 'Internal server error',
    });
  });

  return app;
}
