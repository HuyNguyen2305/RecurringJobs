// Matches Sequelize DataTypes.STRING, which maps to VARCHAR(255) in Postgres.
export const MAX_STRING_LENGTH = 255;

// At least one non-whitespace character, so values like "   " are rejected.
export const NON_BLANK_PATTERN = '\\S';

// A job is a single-day visit: at most 24 hours long.
export const MAX_LENGTH_MINUTES = 1440;

// Keeps every generated date well within the JS Date range.
export const MAX_RECURRENCE_INTERVAL = 99;

// Largest value that fits DECIMAL(10,2).
export const MAX_INVOICE_AMOUNT = 99999999.99;

// Invoices can be generated for past occurrences and at most this many days ahead.
export const INVOICE_MAX_DAYS_AHEAD = 14;
