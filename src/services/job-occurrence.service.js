import { ConflictError, ValidationError } from '#common/error.js';
import { sequelize } from '#common/database.js';
import { assertValidOccurrenceDate } from '#common/occurrence-validation.js';
import { todayUtc } from '#common/dates.js';
import {
  FINAL_OCCURRENCE_STATUSES,
  INHERITED_OCCURRENCE_STATUSES,
  OCCURRENCE_ALLOWED_FROM,
  RESOLVED_OCCURRENCE_STATUSES,
} from '#constants/job-status.js';

const DEFAULT_SCHEDULE_LIMIT = 100;
// Request dates stop at 2099-12-31, so a schedule never needs to look past it.
const MAX_SCHEDULE_DATE = '2099-12-31';
const MS_PER_DAY = 86400000;

function addDays(date, days) {
  return new Date(Date.parse(date) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

export class JobOccurrenceService {
  constructor({ jobOccurrenceRepository, jobService }) {
    this.jobOccurrenceRepository = jobOccurrenceRepository;
    this.jobService = jobService;
  }

  // An occurrence without a row takes its status from the job: the first occurrence always,
  // later ones only while the job is unconfirmed or confirmed (anything else is a one-off state).
  effectiveStatus(job, date, row) {
    if (row) {
      return row.status;
    }
    if (date === job.date) {
      return job.status;
    }
    return INHERITED_OCCURRENCE_STATUSES.includes(job.status) ? job.status : 'unconfirmed';
  }

  /**
   * The series as a calendar shows it. Walking the occurrences in order:
   * - the first occurrence, and any whose predecessor is settled (completed / canceled /
   *   rescheduled), is `real` (available);
   * - occurrences after one that is still open are `hollow` (projected);
   * - an open occurrence whose day has passed is `overdue`, and everything after it is dropped;
   * - `terminate_service` is shown and ends the series.
   * The walk always starts at the series start so the gate is right; `from` and `limit` only
   * trim what is returned. Without `to`, the date window it walks widens until `limit` items
   * at or after `from` are found, the series ends, or 2099-12-31 is reached.
   */
  async getSchedule(jobId, { from, to, limit = DEFAULT_SCHEDULE_LIMIT } = {}) {
    const job = await this.jobService.getById(jobId);
    // Every row, not just those up to `to`: a moved visit past `to` still gates the dates before it.
    const rows = await this.jobOccurrenceRepository.findAllForJob(jobId);
    const rowsByDate = new Map(rows.map((row) => [row.occurrenceDate, row]));

    let span = limit * 2;
    let windowEnd = to ?? this.clampDate(addDays(from && from > job.date ? from : job.date, span));

    while (true) {
      // An explicit Infinity limit: without one the recurrence engine stops at 1000 dates.
      const dates = await this.jobService.resolveOccurrences(
        job,
        { from: job.date, to: windowEnd, limit: Infinity },
        new Set(),
      );
      const { items, ended } = this.walkSeries(job, dates, rowsByDate);
      const visible = items.filter(
        (item) => (!from || item.date >= from) && (!to || item.date <= to),
      );

      const seriesExhausted =
        !job.recurrence ||
        (job.recurrence.endsType !== 'never' && (dates.at(-1) ?? '') < windowEnd);
      if (
        to ||
        ended ||
        seriesExhausted ||
        visible.length >= limit ||
        windowEnd >= MAX_SCHEDULE_DATE
      ) {
        return visible.slice(0, limit);
      }

      span *= 2;
      windowEnd = this.clampDate(addDays(windowEnd, span));
    }
  }

  clampDate(date) {
    return date > MAX_SCHEDULE_DATE ? MAX_SCHEDULE_DATE : date;
  }

  /**
   * `ended` is true when the walk stopped at an overdue or terminated occurrence. A rescheduled
   * occurrence hands its slot to the visit it moved to, which is shown right after it and keeps
   * the next occurrence gated until it is settled (a moved visit can itself be rescheduled).
   */
  walkSeries(job, dates, rowsByDate) {
    const today = todayUtc();
    const items = [];
    let available = true;

    for (const slotDate of dates) {
      let date = slotDate;

      while (true) {
        const row = rowsByDate.get(date);
        const status = this.effectiveStatus(job, date, row);
        const item = {
          date,
          state: available ? 'real' : 'hollow',
          status,
          rescheduledTo: row?.rescheduledTo ?? null,
          rescheduledFrom: row?.rescheduledFrom ?? null,
          completedAt: row?.completedAt ?? null,
        };

        if (status === 'terminate_service') {
          items.push(item);
          return { items, ended: true };
        }
        if (status === 'rescheduled') {
          items.push(item);
          available = true;
          // Rows from before moved visits existed have none: the slot is simply settled.
          if (!row?.rescheduledTo || !rowsByDate.has(row.rescheduledTo)) {
            break;
          }
          date = row.rescheduledTo;
          continue;
        }
        if (RESOLVED_OCCURRENCE_STATUSES.includes(status)) {
          items.push(item);
          available = true;
          break;
        }
        if (available && date < today) {
          items.push({ ...item, state: 'overdue' });
          return { items, ended: true };
        }
        items.push(item);
        available = false;
        break;
      }
    }

    return { items, ended: false };
  }

  async updateStatus(jobId, date, { status, rescheduledTo }) {
    const job = await this.jobService.getById(jobId);
    await assertValidOccurrenceDate(job, date, this.jobService, this.jobOccurrenceRepository);

    if (status === 'rescheduled') {
      if (!rescheduledTo) {
        throw new ValidationError('rescheduledTo is required when status is rescheduled');
      }
      await this.assertValidRescheduleTarget(job, date, rescheduledTo);
    } else if (rescheduledTo) {
      throw new ValidationError('rescheduledTo is only allowed when status is rescheduled');
    }

    if (status === 'completed' && date > todayUtc()) {
      throw new ValidationError('Cannot complete an occurrence before its date');
    }

    await this.assertAvailable(job, date);

    const row = await this.jobOccurrenceRepository.findByJobAndDate(jobId, date);
    const current = this.effectiveStatus(job, date, row);
    if (FINAL_OCCURRENCE_STATUSES.includes(current)) {
      throw new ConflictError(`Occurrence ${date} is already ${current} and cannot be changed`);
    }

    const allowedFrom = OCCURRENCE_ALLOWED_FROM[status] ?? [];
    if (!allowedFrom.includes(current)) {
      throw new ConflictError(`Cannot change occurrence status from ${current} to ${status}`);
    }

    const fields = {
      status,
      rescheduledTo: rescheduledTo ?? null,
      completedAt: status === 'completed' ? new Date() : null,
    };
    const write = { jobId, date, row, allowedFrom, fields };
    if (status === 'rescheduled') {
      // The original and the visit it moves to are written together or not at all.
      await sequelize.transaction(async (transaction) => {
        await this.writeOccurrence({ ...write, transaction });
        try {
          await this.jobOccurrenceRepository.create(
            { jobId, occurrenceDate: rescheduledTo, rescheduledFrom: date },
            { transaction },
          );
        } catch (error) {
          if (error.name === 'SequelizeUniqueConstraintError') {
            throw new ConflictError(`${rescheduledTo} already has an occurrence of this job`);
          }
          throw error;
        }
      });
    } else {
      await this.writeOccurrence(write);
    }

    return {
      jobId,
      date,
      status,
      rescheduledTo: fields.rescheduledTo,
      completedAt: fields.completedAt,
    };
  }

  // Updates the occurrence's row, or creates it on the first status change.
  async writeOccurrence({ jobId, date, row, allowedFrom, fields, transaction }) {
    const options = transaction ? [{ transaction }] : [];
    const raceMessage = `Occurrence ${date} was changed by another request; reload and retry`;

    if (row) {
      const changed = await this.jobOccurrenceRepository.transitionStatus(
        row.id,
        allowedFrom,
        fields,
        ...options,
      );
      if (changed === 0) {
        throw new ConflictError(raceMessage);
      }
      return;
    }

    try {
      await this.jobOccurrenceRepository.create(
        { jobId, occurrenceDate: date, ...fields },
        ...options,
      );
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        throw new ConflictError(raceMessage);
      }
      throw error;
    }
  }

  /**
   * Where a rescheduled occurrence may move to: after its own date, not in the past, not past
   * the end of a finite series (400), and not on a date the series or another reschedule
   * already uses (409).
   */
  async assertValidRescheduleTarget(job, date, rescheduledTo) {
    if (rescheduledTo <= date) {
      throw new ValidationError('rescheduledTo must be after the occurrence date');
    }
    if (rescheduledTo < todayUtc()) {
      throw new ValidationError('rescheduledTo cannot be in the past');
    }

    const seriesEnd = await this.seriesEndDate(job);
    if (seriesEnd && rescheduledTo > seriesEnd) {
      throw new ValidationError(
        `rescheduledTo cannot be after the end of the series (${seriesEnd})`,
      );
    }

    const seriesDates = await this.jobService.resolveOccurrences(
      job,
      { from: rescheduledTo, to: rescheduledTo, limit: Infinity },
      new Set(),
    );
    if (seriesDates.includes(rescheduledTo)) {
      throw new ConflictError(`${rescheduledTo} is already an occurrence of this job`);
    }
    const existing = await this.jobOccurrenceRepository.findByJobAndDate(job.id, rescheduledTo);
    if (existing) {
      throw new ConflictError(`${rescheduledTo} already has an occurrence of this job`);
    }
  }

  // The last date of a finite series, or null when it never ends (or the job is a one-off).
  async seriesEndDate(job) {
    const rule = job.recurrence;
    if (rule?.endsType === 'on_date') {
      return rule.endsOnDate;
    }
    if (rule?.endsType === 'after') {
      const dates = await this.jobService.resolveOccurrences(
        job,
        { from: job.date, to: MAX_SCHEDULE_DATE, limit: Infinity },
        new Set(),
      );
      return dates.at(-1) ?? job.date;
    }
    return null;
  }

  /**
   * Whether work or billing may attach to an occurrence (used by work orders and invoices).
   * Refused (400) when the occurrence is canceled, rescheduled or terminated, and when it is
   * completed unless `allowCompleted` (an invoice is raised after completion; a new work order
   * is not). Refused (409) while it is still hollow: its predecessor has to be settled first.
   * An overdue occurrence is still the current one and is allowed.
   */
  async assertAvailableFor(job, date, { action, allowCompleted = false }) {
    const row = await this.jobOccurrenceRepository.findByJobAndDate(job.id, date);
    const status = this.effectiveStatus(job, date, row);

    const blocked = allowCompleted
      ? FINAL_OCCURRENCE_STATUSES.filter((blockedStatus) => blockedStatus !== 'completed')
      : FINAL_OCCURRENCE_STATUSES;
    if (blocked.includes(status)) {
      throw new ValidationError(`Cannot ${action} for a ${status} occurrence (${date})`);
    }

    await this.assertAvailable(job, date);
  }

  // An occurrence can only change once the one before it is settled (it is `real`, not `hollow`).
  // A moved visit is available as soon as it exists: it takes the place of the occurrence it
  // came from, which is already settled.
  async assertAvailable(job, date) {
    const row = await this.jobOccurrenceRepository.findByJobAndDate(job.id, date);
    if (row?.rescheduledFrom) {
      return;
    }

    const dates = await this.jobService.resolveOccurrences(
      job,
      { from: job.date, to: date, limit: Infinity },
      new Set(),
    );
    const index = dates.indexOf(date);
    if (index <= 0) {
      return;
    }

    const { date: previousDate, status: previous } = await this.lastVisitOfSlot(
      job,
      dates[index - 1],
    );

    if (previous === 'terminate_service') {
      throw new ConflictError(`The series was terminated at ${previousDate}`);
    }
    if (!RESOLVED_OCCURRENCE_STATUSES.includes(previous)) {
      throw new ConflictError(
        `Occurrence ${date} is not available yet: complete, cancel or reschedule ${previousDate} first`,
      );
    }
  }

  // The visit that currently stands in a slot: the occurrence itself, or, when it was
  // rescheduled, the last visit of its chain of moves.
  async lastVisitOfSlot(job, slotDate) {
    let date = slotDate;
    let row = await this.jobOccurrenceRepository.findByJobAndDate(job.id, date);

    while (row?.status === 'rescheduled' && row.rescheduledTo) {
      const moved = await this.jobOccurrenceRepository.findByJobAndDate(job.id, row.rescheduledTo);
      if (!moved) {
        break;
      }
      date = row.rescheduledTo;
      row = moved;
    }

    return { date, status: this.effectiveStatus(job, date, row) };
  }
}
