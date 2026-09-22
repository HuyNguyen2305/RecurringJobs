import { sequelize } from '#common/database.js';
import { requestContext } from '#common/request-context.js';

/**
 * Runs `run` inside a real Postgres transaction that is always rolled back
 * afterwards, so integration tests can hit the real DB without leaving data
 * behind. `run` receives `{ transaction }` — pass it through as the
 * `transaction` option on every repository call made in the test.
 */
export async function seedWithTransaction(run) {
  const transaction = await sequelize.transaction();
  requestContext.enterWith({ identity: { tenantSchema: 'public' } });

  try {
    await run({ transaction });
  } finally {
    await transaction.rollback();
  }
}
