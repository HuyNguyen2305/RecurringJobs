# Architecture & conventions
Fastify + Sequelize (PostgreSQL) + Awilix DI REST API. Layered `Router → Controller → Service → Repository → Model`, one direction only, schema-per-tenant multi-tenancy, Jest ESM tests.
**Reusable template** applies to any app built on this same track. **This application** covers what's specific to this codebase.

# Code style
This project uses ESLint + Prettier, enforced automatically via hook after every edit.
Do not mutually reformat code - the hook handles it.

## Code review workflow
When asked to check for bugs:
1. Scope to `git diff` (or `git diff main` for branched) - don't scan the whole project unless asked.
2. Skip lint/format on Claude-authored changes (the hook already enforced it); for anything else in the diff, run `npm run lint && npm run format:check` first.
3. Focus on logic/edge-case/race bugs, not style.
4. Only open files outside the diff if something flagged points there.

## Reusable template
- **Layers**: Routers (`src/routers/`, auto-loaded Fastify routes, thin) → Controllers (`src/controllers/`, HTTP orchestration only, no business logic) → Services (`src/services/`, business logic) → Repositories (`src/repositories/`, data access, extend `Baserepository`) → Models (`src/models/`, one per table). Schemas (`src/schemas/`) validate requests/response and power Swagger. Other dirs: `src/common/` (auth, shared base classes, constants), `config/` / `migrations/` / `script/` (Sequelize CLI, Umzug, ops scripts).
  - **Exception (approved 2026-08-21):** `customer_line_items` (`src/models/customer-line-item.model.js`) deliberately backs *two* concepts — customer estimate line items and customer invoice line items — behind one table, using a `parentId` (no FK constraint) + `parentType` (`'estimate' | 'invoice'`) discriminator, instead of two near-identical tables (`customer_estimate_items` / `customer_invoice_items`). Approved trade-off: minimizing DB footprint outweighs per-row FK integrity for these specific line items, since the two source tables had converged on an identical shape and callers already scope every read by parent. This is a one-off exception, not a new default — every other model still follows one-model-per-table.
- **DI**: every layer registers into Awilix (`src/containter.js`); resolve by key (`REPOSITORY_KEYS` / `SERVICE_KEYS` / `CONTROLLER_KEYS` from `#constants/singleton`), never auto-wired. Kebab-case, type-suffixed filenames (`booking.service.js`).
- **Imports**: Node subpath aliases (`#service/*`, `#repositories/*`, etc. - full map in `package.json`'s `imports`), never relative paths across layers.
- **Adding a feature**: Model → Repository → Service → Controller → Schema → Route, then tests - same order as the layers above.
- **Controllers**: success responses are `{success: true, message, data }` via `reply.send(...)`; errors throw `CustomError`/a subclass from `#configs/error`. 
- **Auth**: Passport-based (`src/common/auth/strategies/`); `setIdentity` populates `requestContext.get('identity')` for every downstream layer.
- **Multi-tenancy**: schema-per-tenant, not a `tenant_id` column - `Baserepository.setSchema()` switches Postgres schema per query from the request's identity.
- **Tests**: `test/unit/**` (no DB) vs `test/integration/**` (real Postgres, transaction rolled back per test) - one test file per source method, mirrored directory per source file. Two gotchas: mock via `jest.unstable_mockModule('#alias,...)` *before* the dynamic `import()` of the module under test (static imports load too early to mock); instantiate the class under test with `Object.create(ClassName.prototype)` rather than through Awilix, to keep the test isolated. Integration tests seed via `seedWithTransaction` (`test/helpers/seed-fixture.js`) using fixture from `test/fixtures/*.cjs`.

## This application Portal API
- Customer-facing portal (bookings, payments, account/profile).
- Auth strategies: `access-token`, `owner`, `owner-id`, `account-id`, `portal-token`.


# Requirements
Every iteration, adjustment or update code need to be confirmed by the user and need to dive into plan mode before implementation.
Every implementation neeeds to be double-checked and witnessed by the user, the adjusted code and related files need to run manually to check for issue or bug and then report back before toggling anything.