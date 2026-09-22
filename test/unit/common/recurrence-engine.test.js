import { generateOccurrences } from '#common/recurrence-engine.js';
import { ValidationError } from '#common/error.js';

const ANCHOR = '2026-09-21'; // Monday, 3rd Monday of September 2026

describe('generateOccurrences', () => {
  describe('daily', () => {
    it('steps by the given interval in days', () => {
      const rule = { frequency: 'daily', interval: 3, endsType: 'never' };
      const dates = generateOccurrences(rule, ANCHOR, { limit: 4 });
      expect(dates).toEqual(['2026-09-21', '2026-09-24', '2026-09-27', '2026-09-30']);
    });
  });

  describe('weekly', () => {
    it('period=every repeats on the selected weekdays every N weeks', () => {
      const rule = {
        frequency: 'weekly',
        interval: 2,
        weeklyPeriod: 'every',
        weeklyDaysOfWeek: [1, 3], // Monday, Wednesday
        endsType: 'never',
      };
      const dates = generateOccurrences(rule, ANCHOR, { limit: 5 });
      expect(dates).toEqual([
        '2026-09-21', // Mon (anchor week)
        '2026-09-23', // Wed (anchor week)
        '2026-10-05', // Mon (+2 weeks)
        '2026-10-07', // Wed (+2 weeks)
        '2026-10-19', // Mon (+4 weeks)
      ]);
    });

    it('period=first_third fires on the 1st and 3rd weekday occurrence each month', () => {
      const rule = {
        frequency: 'weekly',
        interval: 1,
        weeklyPeriod: 'first_third',
        weeklyDaysOfWeek: [1], // Monday
        endsType: 'never',
      };
      const dates = generateOccurrences(rule, ANCHOR, { limit: 3 });
      // Sept 2026 Mondays: 7, 14, 21, 28 -> 1st=7, 3rd=21; anchor filters out the 7th
      expect(dates).toEqual(['2026-09-21', '2026-10-05', '2026-10-19']);
    });

    it('period=second_fourth fires on the 2nd and 4th weekday occurrence each month', () => {
      const rule = {
        frequency: 'weekly',
        interval: 1,
        weeklyPeriod: 'second_fourth',
        weeklyDaysOfWeek: [1],
        endsType: 'never',
      };
      const dates = generateOccurrences(rule, ANCHOR, { limit: 2 });
      // Sept 2026 Mondays: 7, 14, 21, 28 -> 2nd=14, 4th=28; anchor (9/21) filters out the 14th
      expect(dates).toEqual(['2026-09-28', '2026-10-12']);
    });
  });

  describe('monthly', () => {
    it('day_of_month repeats on the same day-of-month, clamping short months', () => {
      const rule = {
        frequency: 'monthly',
        interval: 1,
        monthlyRepeatBy: 'day_of_month',
        endsType: 'never',
      };
      const dates = generateOccurrences({ ...rule }, '2026-01-31', { limit: 4 });
      expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    });

    it('day_of_week repeats on the same nth weekday of the month', () => {
      const rule = {
        frequency: 'monthly',
        interval: 1,
        monthlyRepeatBy: 'day_of_week',
        endsType: 'never',
      };
      const dates = generateOccurrences(rule, ANCHOR, { limit: 3 });
      // 3rd Monday of Sep/Oct/Nov 2026
      expect(dates).toEqual(['2026-09-21', '2026-10-19', '2026-11-16']);
    });
  });

  describe('yearly', () => {
    it('day_of_year repeats on the same month+day, clamping Feb 29', () => {
      const rule = {
        frequency: 'yearly',
        interval: 1,
        yearlyRepeatBy: 'day_of_year',
        endsType: 'never',
      };
      const dates = generateOccurrences(rule, '2024-02-29', { limit: 3 });
      expect(dates).toEqual(['2024-02-29', '2025-02-28', '2026-02-28']);
    });

    it('day_of_week repeats the same nth weekday within the anchor month, every N years', () => {
      const rule = {
        frequency: 'yearly',
        interval: 1,
        yearlyRepeatBy: 'day_of_week',
        endsType: 'never',
      };
      const dates = generateOccurrences(rule, ANCHOR, { limit: 2 });
      expect(dates).toEqual(['2026-09-21', '2027-09-20']);
    });
  });

  describe('ends conditions', () => {
    it('endsType=after stops at the Nth occurrence, counting the anchor as #1', () => {
      const rule = { frequency: 'daily', interval: 1, endsType: 'after', endsAfterCount: 3 };
      const dates = generateOccurrences(rule, ANCHOR);
      expect(dates).toEqual(['2026-09-21', '2026-09-22', '2026-09-23']);
    });

    it('endsType=on_date stops after the given date, inclusive', () => {
      const rule = {
        frequency: 'daily',
        interval: 1,
        endsType: 'on_date',
        endsOnDate: '2026-09-23',
      };
      const dates = generateOccurrences(rule, ANCHOR);
      expect(dates).toEqual(['2026-09-21', '2026-09-22', '2026-09-23']);
    });

    it('respects an explicit from/to range', () => {
      const rule = { frequency: 'daily', interval: 1, endsType: 'never' };
      const dates = generateOccurrences(rule, ANCHOR, { from: '2026-09-23', to: '2026-09-25' });
      expect(dates).toEqual(['2026-09-23', '2026-09-24', '2026-09-25']);
    });

    it('throws when endsType=never and neither to nor limit is given', () => {
      const rule = { frequency: 'daily', interval: 1, endsType: 'never' };
      expect(() => generateOccurrences(rule, ANCHOR)).toThrow(ValidationError);
    });
  });

  describe('except', () => {
    it('month mode drops occurrences in the excepted months', () => {
      const rule = {
        frequency: 'daily',
        interval: 1,
        endsType: 'never',
        exceptType: 'month',
        exceptMonths: [10],
      };
      const dates = generateOccurrences(rule, '2026-09-29', { to: '2026-10-03' });
      expect(dates).toEqual(['2026-09-29', '2026-09-30']);
    });

    it('condition mode + every=week drops every occurrence on the selected weekday', () => {
      const rule = {
        frequency: 'daily',
        interval: 1,
        endsType: 'never',
        exceptType: 'condition',
        exceptConditionEvery: 'week',
        exceptConditionDayOfWeek: 0, // Sunday
      };
      const dates = generateOccurrences(rule, ANCHOR, { to: '2026-09-27' });
      expect(dates).toEqual([
        '2026-09-21',
        '2026-09-22',
        '2026-09-23',
        '2026-09-24',
        '2026-09-25',
        '2026-09-26',
      ]);
    });

    it('condition mode + every=month drops the Nth weekday occurrence of the month', () => {
      const rule = {
        frequency: 'daily',
        interval: 1,
        endsType: 'never',
        exceptType: 'condition',
        exceptConditionEvery: 'month',
        exceptConditionPeriod: '1st',
        exceptConditionDayOfWeek: 0, // Sunday
      };
      // 1st Sunday of Sept 2026 is the 6th
      const dates = generateOccurrences(rule, '2026-09-01', { to: '2026-09-08' });
      expect(dates).toEqual([
        '2026-09-01',
        '2026-09-02',
        '2026-09-03',
        '2026-09-04',
        '2026-09-05',
        '2026-09-07',
        '2026-09-08',
      ]);
    });

    it('condition mode period=last drops the last weekday occurrence of the month', () => {
      const rule = {
        frequency: 'weekly',
        interval: 1,
        weeklyPeriod: 'every',
        weeklyDaysOfWeek: [5], // Friday
        endsType: 'never',
        exceptType: 'condition',
        exceptConditionEvery: 'month',
        exceptConditionPeriod: 'last',
        exceptConditionDayOfWeek: 5,
      };
      // Sept 2026 Fridays: 4, 11, 18, 25 (last) -> 25 excluded, backfilled by Oct 2
      const dates = generateOccurrences(rule, '2026-09-04', { limit: 4 });
      expect(dates).toEqual(['2026-09-04', '2026-09-11', '2026-09-18', '2026-10-02']);
    });

    it('frequency mode drops dates present in excludeDates', () => {
      const rule = { frequency: 'daily', interval: 1, endsType: 'never', exceptType: 'frequency' };
      const dates = generateOccurrences(rule, ANCHOR, {
        to: '2026-09-24',
        excludeDates: ['2026-09-23'],
      });
      expect(dates).toEqual(['2026-09-21', '2026-09-22', '2026-09-24']);
    });

    it('an excepted date still consumes an endsAfterCount slot', () => {
      const rule = {
        frequency: 'daily',
        interval: 1,
        endsType: 'after',
        endsAfterCount: 3,
        exceptType: 'month',
        exceptMonths: [10],
      };
      // ordinal 1=9/29, 2=9/30, 3=10/1 (excepted, still counts), stop before ordinal 4
      const dates = generateOccurrences(rule, '2026-09-29');
      expect(dates).toEqual(['2026-09-29', '2026-09-30']);
    });
  });
});
