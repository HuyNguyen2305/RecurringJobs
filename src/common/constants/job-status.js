export const JOB_STATUSES = [
  'unconfirmed',
  'confirmed',
  'in_progress',
  'completed',
  'canceled',
  'terminate_service',
  'rescheduled',
];

// A job cannot be created already rescheduled: that status needs a new date, which only an
// occurrence carries.
export const JOB_CREATE_STATUSES = JOB_STATUSES.filter((status) => status !== 'rescheduled');

// A later occurrence without a row of its own starts as the job's status when that is one of these.
export const INHERITED_OCCURRENCE_STATUSES = ['unconfirmed', 'confirmed'];

// An occurrence in one of these statuses is settled: the next occurrence of the series becomes
// available. `terminate_service` also settles it but ends the series, so nothing follows it.
export const RESOLVED_OCCURRENCE_STATUSES = ['completed', 'canceled', 'rescheduled'];

// Statuses an occurrence can no longer leave.
export const FINAL_OCCURRENCE_STATUSES = [...RESOLVED_OCCURRENCE_STATUSES, 'terminate_service'];

// Target status -> the statuses it may come from. Open statuses only move forward
// (unconfirmed -> confirmed -> in_progress); any open status can move to a final one.
// `unconfirmed` is the starting state, so it is never a target.
const OPEN_OCCURRENCE_STATUSES = ['unconfirmed', 'confirmed', 'in_progress'];
export const OCCURRENCE_ALLOWED_FROM = {
  confirmed: ['unconfirmed'],
  in_progress: ['unconfirmed', 'confirmed'],
  ...Object.fromEntries(
    FINAL_OCCURRENCE_STATUSES.map((status) => [status, OPEN_OCCURRENCE_STATUSES]),
  ),
};

export const OCCURRENCE_TARGET_STATUSES = Object.keys(OCCURRENCE_ALLOWED_FROM);
