import type { CalendarEventItem } from '../types/kestrel';

function formatIcsDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function downloadIcsEvent(event: CalendarEventItem): void {
  const uid = `${event.id}@kestrel.secure`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kestrel Secure Workspace//Calendar Sync//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatIcsDate(new Date().toISOString())}`,
    `DTSTART:${formatIcsDate(event.startIso)}`,
    `DTEND:${formatIcsDate(event.endIso)}`,
    `SUMMARY:${event.title.replace(/\n/g, ' ')}`,
    `LOCATION:${event.location.replace(/\n/g, ' ')}`,
    `DESCRIPTION:${event.notes.replace(/\n/g, '\\n')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${event.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function buildGoogleCalendarUrl(event: CalendarEventItem): string {
  const start = formatIcsDate(event.startIso);
  const end = formatIcsDate(event.endIso);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${start}/${end}`,
    details: event.notes,
    location: event.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
