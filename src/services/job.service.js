import { NotFoundError, ValidationError } from '#common/error.js';
import { sequelize } from '#common/database.js';
import { generateOccurrences } from '#common/recurrence-engine.js';

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

    if (jobData.soldByTechnicianId) {
      await this.assertExists(this.technicianRepository, jobData.soldByTechnicianId, 'Technician');
    }

    for (const assignee of assignees) {
      await this.assertExists(this.technicianRepository, assignee.technicianId, 'Technician');
    }

    if (assignees.filter((assignee) => assignee.isPrimary).length > 1) {
      throw new ValidationError('Only one assignee can be marked as primary');
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

    if (!job.recurrence) {
      return [job.date];
    }

    let excludeDates;
    if (job.recurrence.exceptType === 'frequency') {
      const exceptJob = await this.getById(job.recurrence.exceptJobId);
      excludeDates = exceptJob.recurrence
        ? generateOccurrences(exceptJob.recurrence, exceptJob.date, { from, to, limit })
        : [exceptJob.date];
    }

    return generateOccurrences(job.recurrence, job.date, { from, to, limit, excludeDates });
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
