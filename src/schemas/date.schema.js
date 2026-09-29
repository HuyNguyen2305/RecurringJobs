import { DATE_RANGE_PATTERN } from '#constants/validation.js';

// Every date accepted from a client (YYYY-MM-DD, 1900-01-01 to 2099-12-31). Postgres rejects
// year 0000, so without the range such dates reached the DB and surfaced as a 500.
export const requestDateSchema = {
  type: 'string',
  format: 'date',
  pattern: DATE_RANGE_PATTERN,
};
