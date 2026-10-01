import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import autoload from '@fastify/autoload';
import AjvCompiler from '@fastify/ajv-compiler';

import { buildContainer } from './containter.js';
import { setIdentity } from '#common/auth/set-identity.js';
import { CustomError } from '#common/error.js';
import { normalizeBody } from '#common/normalize-body.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function buildApp() {
  const app = Fastify({ logger: true });

  const container = buildContainer();
  app.decorate('container', container);

  app.addHook('onRequest', setIdentity);

  // JSON bodies already carry real types, so they are validated strictly ("123" stays a
  // string, null stays null). Query strings and URL params arrive as text and keep
  // Fastify's default coercion (?page=2 -> 2). Unknown body fields are stripped, not rejected
  // (Ajv's removeAdditional default), so `additionalProperties: false` means "drop them".
  const buildValidatorCompiler = AjvCompiler();
  const bodyCompiler = buildValidatorCompiler({}, { customOptions: { coerceTypes: false } });
  const defaultCompiler = buildValidatorCompiler({}, { customOptions: {} });
  app.setValidatorCompiler((routeSchema) =>
    (routeSchema.httpPart === 'body' ? bodyCompiler : defaultCompiler)(routeSchema),
  );

  // Runs before validation: every body string is trimmed ("  Alice  " -> "Alice"), and blank
  // optional text becomes null, while a blank required field is still rejected as blank.
  app.addHook('preValidation', async (request) => {
    request.body = normalizeBody(request.body, request.routeOptions.schema?.body);
  });

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

    if (error.statusCode >= 400 && error.statusCode < 500) {
      reply.code(error.statusCode).send({
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
