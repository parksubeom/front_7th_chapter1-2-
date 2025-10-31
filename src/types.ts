import { Event, EventInstance } from '../types';

// UTC functions are crucial for avoiding timezone-related errors,
// ensuring that date calculations are consistent regardless of the execution environment.
const parseDateUTC = (dateStr: string): Date => {
  const [year, month, day] = dateStr.split('-').map(Number);
  // Months are 0-indexed in JavaScript's Date object.
  return new Date(Date.UTC(year, month - 1, day));
};

const toYYYYMMDD_UTC = (date: Date): string => {
  // .toISOString() returns a string in the format 'YYYY-MM-DDTHH:mm:ss.sssZ'.
  // We only need the date part.
  return date.toISOString().slice(0, 10);
};

export const generateRecurringEvents = (
  events: Event[],
  viewStartDate: Date,
  viewEndDate: Date
): EventInstance[] => {
  const instances: EventInstance[] = [];
  const viewStart = parseDateUTC(toYYYYMMDD_UTC(viewStartDate));
  const viewEnd = parseDateUTC(toYYYYMMDD_UTC(viewEndDate));

  for (const event of events) {
    // According to tests, this function should only generate instances for actual recurring events.
    // Events with `seriesId: null` or `type: 'none'` are handled as single events elsewhere.
    if (!event.seriesId || event.repeat.type === 'none') {
      continue;
    }

    const { type, interval, endDate: repeatEndDateStr } = event.repeat;
    const seriesId = event.seriesId;
    const exceptionDates = new Set(event.exceptionDates || []);
    const startDate = parseDateUTC(event.date);

    const repeatEndDate = repeatEndDateStr ? parseDateUTC(repeatEndDateStr) : null;

    // Determine the final date for the loop. It's the earlier of the view's end or the series' own end date.
    const loopEndDate = repeatEndDate && repeatEndDate < viewEnd ? repeatEndDate : viewEnd;

    // Skip this event entirely if its repetition starts after our loop's effective end date.
    if (startDate > loopEndDate) {
      continue;
    }

    // Use a simple, direct iteration for daily and weekly recurrences.
    if (type === 'daily' || type === 'weekly') {
      let currentDate = new Date(startDate.getTime());
      while (currentDate <= loopEndDate) {
        if (currentDate >= viewStart) {
          const currentDateStr = toYYYYMMDD_UTC(currentDate);
          if (!exceptionDates.has(currentDateStr)) {
            const { id, date, ...rest } = event;
            instances.push({
              ...rest,
              instanceId: `${seriesId}-${currentDateStr.replace(/-/g, '')}`,
              date: currentDateStr,
              seriesId,
            });
          }
        }
        if (type === 'daily') {
          currentDate.setUTCDate(currentDate.getUTCDate() + interval);
        } else {
          // 'weekly'
          currentDate.setUTCDate(currentDate.getUTCDate() + interval * 7);
        }
      }
    }
    // For monthly and yearly, calculating each occurrence from the start date is more robust
    // and correctly handles edge cases like the 31st of a month or leap years.
    else if (type === 'monthly' || type === 'yearly') {
      const startYear = startDate.getUTCFullYear();
      const startMonth = startDate.getUTCMonth();
      const startDay = startDate.getUTCDate();

      for (let i = 0; ; i++) {
        let nextDate: Date;

        if (type === 'monthly') {
          const totalMonths = startMonth + i * interval;
          const targetYear = startYear + Math.floor(totalMonths / 12);
          const targetMonth = totalMonths % 12;

          nextDate = new Date(Date.UTC(targetYear, targetMonth, startDay));

          // If the resulting date's month doesn't match the target month, it means the
          // original day doesn't exist in the target month (e.g., April 31). Skip it.
          if (nextDate.getUTCMonth() !== targetMonth) {
            continue;
          }
        } else {
          // 'yearly'
          const targetYear = startYear + i * interval;
          nextDate = new Date(Date.UTC(targetYear, startMonth, startDay));

          // If the resulting date's month isn't the original month, it means it was a leap day
          // in a non-leap year (e.g., Feb 29, 2025 -> Mar 1, 2025). Skip it.
          if (nextDate.getUTCMonth() !== startMonth) {
            continue;
          }
        }

        // If the calculated next date is beyond our loop's boundary, we are done with this series.
        if (nextDate > loopEndDate) {
          break;
        }

        // If the date is within the current view, add it to our results.
        if (nextDate >= viewStart) {
          const currentDateStr = toYYYYMMDD_UTC(nextDate);
          if (!exceptionDates.has(currentDateStr)) {
            const { id, date, ...rest } = event;
            instances.push({
              ...rest,
              instanceId: `${seriesId}-${currentDateStr.replace(/-/g, '')}`,
              date: currentDateStr,
              seriesId,
            });
          }
        }
      }
    }
  }

  return instances;
};