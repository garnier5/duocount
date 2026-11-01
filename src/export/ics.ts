import { lastDayOf, monthKey } from '../lib/dates';

/**
 * A recurring calendar event on the last day of every month at 8:00 PM.
 * Web apps on iPhone can't schedule notifications without a server, so the
 * phone's own calendar does the reminding.
 */
export function monthEndReminder(appUrl: string): File {
  const first = lastDayOf(monthKey()).replace(/-/g, '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DuoCount//Month-end reminder//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    'UID:duocount-month-end-' + stamp + '@duocount',
    'DTSTAMP:' + stamp,
    'DTSTART:' + first + 'T200000',
    'DURATION:PT15M',
    'RRULE:FREQ=MONTHLY;BYMONTHDAY=-1',
    'SUMMARY:Enter the month in DuoCount',
    'DESCRIPTION:Get your receipts and bank statement\\, then enter the month\\, close it and share it with the household.',
    'URL:' + appUrl,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Enter the month in DuoCount',
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ];
  return new File([lines.join('\r\n') + '\r\n'], 'duocount-month-end-reminder.ics', { type: 'text/calendar' });
}
