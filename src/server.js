import 'dotenv/config';
import { buildApp } from './app.js';

const port = Number(process.env.PORT) || 3000;

async function start() {
  const app = await buildApp();
  try {
    await app.listen({ port, host: '0.0.0.0' });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

start();
