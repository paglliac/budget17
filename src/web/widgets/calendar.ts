import { dateOf, dayOfMonth, daysInMonth, monthOf, shiftMonth, weekday, type MonthString } from '../../dates.ts';
import type { DateString } from '../../zenmoney/types.ts';
import { WEEKDAYS } from '../format.ts';
import { html, type Html } from '../html.ts';
import { toneColor, type Tone } from '../tones.ts';

export interface CalendarDay {
  /** Something happened that day; the day gets a filled circle. */
  marked?: boolean;
  /** Small dots under the number, one per kind of event. */
  dots?: Tone[];
  /** Tooltip, such as the day's spending. */
  title?: string;
}

/** A month as weeks from Monday, with days of the neighbouring months greyed out. `days[0]` is the 1st. */
export function monthCalendar(options: {
  month: MonthString;
  today?: DateString;
  days: CalendarDay[];
  legend?: Array<{ tone: Tone; label: string }>;
}): Html {
  const { month } = options;
  const total = daysInMonth(month);
  const offset = weekday(dateOf(month, 1));
  const previousDays = daysInMonth(shiftMonth(month, -1));
  const todayDay = options.today && monthOf(options.today) === month ? dayOfMonth(options.today) : null;
  const trailing = (7 - ((offset + total) % 7)) % 7;

  const leading = Array.from({ length: offset }, (_, i) => html`<span class="calendar-day outside">${previousDays - offset + 1 + i}</span>`);
  const days = Array.from({ length: total }, (_, i) => {
    const day = i + 1;
    const info = options.days[i] ?? {};
    const classes = [
      'calendar-day',
      info.marked ? 'marked' : '',
      day === todayDay ? 'today' : '',
      todayDay !== null && day > todayDay ? 'future' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return html`<span class="${classes}"${info.title ? html` title="${info.title}"` : null}>${day}<span class="calendar-dots">${(info.dots ?? []).map(
      (tone) => html`<i style="background:${toneColor(tone)}"></i>`,
    )}</span></span>`;
  });
  const after = Array.from({ length: trailing }, (_, i) => html`<span class="calendar-day outside">${i + 1}</span>`);

  return html`
    <div class="calendar">
      <div class="calendar-grid">
        ${WEEKDAYS.map((w) => html`<span class="calendar-weekday">${w}</span>`)}${leading}${days}${after}
      </div>
      ${
        options.legend?.length
          ? html`<div class="calendar-legend">${options.legend.map(
              (item) => html`<span><i style="background:${toneColor(item.tone)}"></i>${item.label}</span>`,
            )}</div>`
          : null
      }
    </div>`;
}
