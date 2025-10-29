import { Event, EventInstance } from '../types';

// Helper to format a Date object to a "YYYY-MM-DD" string in UTC.
const formatDate = (date: Date): string => {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
};

export const generateRecurringEvents = (
  masterEvents: Event[],
  viewStart: Date,
  viewEnd: Date
): EventInstance[] => {
  const allInstances: EventInstance[] = [];

  const recurringEvents = masterEvents.filter(
    (event) => event.seriesId && event.repeat.type !== 'none'
  );

  const viewStartDate = new Date(viewStart);
  viewStartDate.setUTCHours(0, 0, 0, 0);

  const viewEndDate = new Date(viewEnd);
  viewEndDate.setUTCHours(23, 59, 59, 999);

  for (const event of recurringEvents) {
    // Type guard for seriesId, which is checked in the filter but TypeScript likes it explicit.
    if (!event.seriesId) {
      continue;
    }

    const originalStartDate = new Date(`${event.date}T00:00:00.000Z`);
    const originalDay = originalStartDate.getUTCDate();
    const originalMonth = originalStartDate.getUTCMonth();

    // The series ends at the specified endDate or the view's end, whichever is earlier.
    const overallEndDate = event.repeat.endDate
      ? new Date(`${event.repeat.endDate}T23:59:59.999Z`)
      : viewEndDate;

    const loopEndDate = overallEndDate < viewEndDate ? overallEndDate : viewEndDate;

    let n = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const nextDate = new Date(originalStartDate);

      switch (event.repeat.type) {
        case 'daily':
          nextDate.setUTCDate(originalStartDate.getUTCDate() + n * event.repeat.interval);
          break;
        case 'weekly':
          nextDate.setUTCDate(originalStartDate.getUTCDate() + n * 7 * event.repeat.interval);
          break;
        case 'monthly':
          nextDate.setUTCMonth(originalStartDate.getUTCMonth() + n * event.repeat.interval);
          // Skip if the day does not exist in the target month (e.g., Feb 31).
          if (nextDate.getUTCDate() !== originalDay) {
            n++;
            continue;
          }
          break;
        case 'yearly':
          nextDate.setUTCFullYear(originalStartDate.getUTCFullYear() + n * event.repeat.interval);
          // Skip if the date is invalid (e.g., Feb 29 in a non-leap year).
          if (nextDate.getUTCMonth() !== originalMonth || nextDate.getUTCDate() !== originalDay) {
            n++;
            continue;
          }
          break;
      }

      // Exit loop if we've passed the effective end date for generation.
      if (nextDate > loopEndDate) {
        break;
      }

      // Generate an instance only if it falls within the visible date range.
      if (nextDate >= viewStartDate) {
        const dateStr = formatDate(nextDate);

        // Exclude dates that are specifically marked as exceptions.
        if (!event.exceptionDates?.includes(dateStr)) {
          const instance: EventInstance = {
            ...event,
            id: `${event.seriesId}-${dateStr.replace(/-/g, '')}`,
            date: dateStr,
            originalDate: event.date,
          };
          allInstances.push(instance);
        }
      }

      n++;
    }
  }

  return allInstances;
};