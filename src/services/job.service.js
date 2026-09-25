import { NotFoundError, ValidationError } from '#common/error.js';
import { sequelize } from '#common/database.js';
import { generateOccurrences } from '#common/recurrence-engine.js';

// Upper bound on candidate dates scanned when backfilling a `limit` past Except->Frequency exclusions.
const MAX_EXCEPT_CANDIDATES = 5000;

// Normalizes 'HH:MM' to 'HH:MM:SS' so time strings compare correctly as text.
function toFullTime(time) {
  return time.length === 5 ? `${time}:00` : time;
}

export class JobService {
  constructor({
    jobRepository,
    jobAssigneeRepository,
    customerRepository,
    locationRepository,
    serviceTypeRepository,
    technicianRepository,
  }) {
    this.jobRepository = jobRepository;
    this.jobAssigneeRepository = jobAssigneeRepository;
    this.customerRepository = customerRepository;
    this.locationRepository = locationRepository;
    this.serviceTypeRepository = serviceTypeRepository;
    this.technicianRepository = technicianRepository;
  }

  async assertExists(repository, id, label) {
    const record = await repository.findById(id);
    if (!record) {
      throw new NotFoundError(`${label} ${id} not found`);
    }
    return record;
  }

  validateRecurrence(recurrence, jobDate) {
    const {
      frequency,
      weeklyPeriod,
      weeklyDaysOfWeek,
      monthlyRepeatBy,
      yearlyRepeatBy,
      endsType = 'never',
      endsAfterCount,
      endsOnDate,
      exceptType = 'off',
      exceptMonths,
      exceptConditionEvery,
      exceptConditionPeriod,
      exceptConditionDayOfWeek,
      exceptJobId,
    } = recurrence;

    if (frequency === 'weekly' && (!weeklyDaysOfWeek || weeklyDaysOfWeek.length === 0)) {
      throw new ValidationError('Weekly recurrence requires at least one day of the week');
    }
    if (
      frequency === 'weekly' &&
      weeklyDaysOfWeek &&
      new Set(weeklyDaysOfWeek).size !== weeklyDaysOfWeek.length
    ) {
      throw new ValidationError('weeklyDaysOfWeek cannot contain duplicate days');
    }
    if (frequency === 'weekly' && !weeklyPeriod) {
      throw new ValidationError('Weekly recurrence requires a period');
    }
    if (frequency === 'monthly' && !monthlyRepeatBy) {
      throw new ValidationError('Monthly recurrence requires repeatBy');
    }
    if (frequency === 'yearly' && !yearlyRepeatBy) {
      throw new ValidationError('Yearly recurrence requires repeatBy');
    }
    if (endsType === 'after' && !(endsAfterCount >= 1)) {
      throw new ValidationError('endsType "after" requires endsAfterCount >= 1');
    }
    if (endsType === 'on_date') {
      if (!endsOnDate) {
        throw new ValidationError('endsType "on_date" requires endsOnDate');
      }
      if (endsOnDate < jobDate) {
        throw new ValidationError('endsOnDate cannot be before the job date');
      }
    }

    if (exceptType === 'month' && (!exceptMonths || exceptMonths.length === 0)) {
      throw new ValidationError('Except "month" requires at least one month');
    }
    if (exceptType === 'condition') {
      if (exceptConditionDayOfWeek == null) {
        throw new ValidationError('Except "condition" requires exceptConditionDayOfWeek');
      }
      if (!exceptConditionEvery) {
        throw new ValidationError('Except "condition" requires exceptConditionEvery');
      }
      if (exceptConditionEvery === 'month' && !exceptConditionPeriod) {
        throw new ValidationError(
          'Except "condition" with exceptConditionEvery "month" requires exceptConditionPeriod',
        );
      }
    }
    if (exceptType === 'frequency' && !exceptJobId) {
      throw new ValidationError('Except "frequency" requires exceptJobId');
    }
  }

  async create(data) {
    const { assignees = [], recurrence, ...jobData } = data;

    await this.assertExists(this.customerRepository, jobData.customerId, 'Customer');
    const location = await this.assertExists(
      this.locationRepository,
      jobData.locationId,
      'Location',
    );
    await this.assertExists(this.serviceTypeRepository, jobData.serviceTypeId, 'Service type');

    if (location.customerId !== jobData.customerId) {
      throw new ValidationError('Location does not belong to the given customer');
    }

    if (
      jobData.timeWindowStart &&
      jobData.timeWindowEnd &&
      toFullTime(jobData.timeWindowStart) >= toFullTime(jobData.timeWindowEnd)
    ) {
      throw new ValidationError('timeWindowStart must be before timeWindowEnd');
    }

    if (jobData.soldByTechnicianId) {
      await this.assertExists(this.technicianRepository, jobData.soldByTechnicianId, 'Technician');
    }

    for (const assignee of assignees) {
      await this.assertExists(this.technicianRepository, assignee.technicianId, 'Technician');
    }

    if (assignees.filter((assignee) => assignee.isPrimary).length > 1) {
      throw new ValidationError('Only one assignee can be marked as primary');
    }

    const technicianIds = assignees.map((assignee) => assignee.technicianId);
    if (new Set(technicianIds).size !== technicianIds.length) {
      throw new ValidationError('A technician cannot be assigned to the same job twice');
    }

    if (recurrence) {
      this.validateRecurrence(recurrence, jobData.date);
      if (recurrence.exceptType === 'frequency') {
        await this.assertExists(this.jobRepository, recurrence.exceptJobId, 'Except job');
      }
      jobData.recurrence = {
        ...recurrence,
        endsType: recurrence.endsType ?? 'never',
        interval: recurrence.interval ?? 1,
      };
    }

    const job = await sequelize.transaction(async (transaction) => {
      const created = await this.jobRepository.create(jobData, { transaction });

      if (assignees.length > 0) {
        await this.jobAssigneeRepository.bulkCreate(
          assignees.map((assignee) => ({
            jobId: created.id,
            technicianId: assignee.technicianId,
            isPrimary: Boolean(assignee.isPrimary),
          })),
          { transaction },
        );
      }

      return created;
    });

    return this.jobRepository.findById(job.id);
  }

  async getById(id) {
    const job = await this.jobRepository.findById(id);
    if (!job) {
      throw new NotFoundError(`Job ${id} not found`);
    }
    return job;
  }

  async getOccurrences(id, { from, to, limit } = {}) {
    const job = await this.getById(id);
    return this.resolveOccurrences(job, { from, to, limit }, new Set());
  }

  /**
   * Resolves a job's occurrences, recursing through Except->Frequency chains so a
   * referenced job's own exceptions are applied too. `visited` holds the ancestors on
   * the current path and guards against a circular chain (A excepts B, B excepts A).
   */
  async resolveOccurrences(job, { from, to, limit }, visited) {
    if (!job.recurrence) {
      const inWindow = (!from || job.date >= from) && (!to || job.date <= to);
      return inWindow ? [job.date] : [];
    }

    const { exceptType, exceptJobId } = job.recurrence;
    if (exceptType !== 'frequency' || visited.has(exceptJobId)) {
      return generateOccurrences(job.recurrence, job.date, { from, to, limit });
    }

    const path = new Set(visited).add(job.id);
    const exceptJob = await this.getById(exceptJobId);
    let rawLimit = limit;

    while (true) {
      // Without excludeDates the engine skips frequency exclusions, so these are the
      // candidates after month/condition exceptions and endsType are applied.
      const candidates = generateOccurrences(job.recurrence, job.date, {
        from,
        to,
        limit: rawLimit,
      });
      if (candidates.length === 0) {
        return [];
      }

      // The referenced job is resolved over the candidates' own window, never the
      // caller's limit, so its skip-list covers every candidate and is always bounded.
      const excluded = new Set(
        await this.resolveOccurrences(
          exceptJob,
          { from: candidates[0], to: candidates.at(-1), limit: Infinity },
          path,
        ),
      );
      const dates = candidates.filter((date) => !excluded.has(date));

      const exhausted = limit == null || candidates.length < rawLimit;
      if (exhausted || dates.length >= limit || rawLimit >= MAX_EXCEPT_CANDIDATES) {
        return limit == null ? dates : dates.slice(0, limit);
      }
      rawLimit = Math.min(rawLimit * 2, MAX_EXCEPT_CANDIDATES);
    }
  }

  async list({ page = 1, pageSize = 20 } = {}) {
    const limit = pageSize;
    const offset = (page - 1) * pageSize;

    const { rows, count } = await this.jobRepository.findAndCountAll({
      limit,
      offset,
      order: [
        ['date', 'ASC'],
        ['startTime', 'ASC'],
      ],
    });

    return {
      data: rows,
      pagination: {
        page,
        pageSize,
        total: count,
      },
    };
  }
}
