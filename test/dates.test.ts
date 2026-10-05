import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addDays, dateOf, daysBetween, daysInMonth, localDate, shiftMonth, weekday } from '../src/dates.ts';

describe('dates', () => {
  it('shifts months across years', () => {
    assert.equal(shiftMonth('2026-01', -1), '2025-12');
    assert.equal(shiftMonth('2026-12', 1), '2027-01');
    assert.equal(shiftMonth('2026-10', -10), '2025-12');
  });

  it('knows month lengths, including leap February', () => {
    assert.equal(daysInMonth('2026-02'), 28);
    assert.equal(daysInMonth('2028-02'), 29);
    assert.equal(daysInMonth('2026-10'), 31);
  });

  it('adds days across months and counts days between dates', () => {
    assert.equal(addDays('2026-10-30', 3), '2026-11-02');
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
    assert.equal(daysBetween('2026-10-05', '2026-10-12'), 7);
    assert.equal(daysBetween('2026-10-05', '2026-10-01'), -4);
  });

  it('numbers weekdays from Monday', () => {
    assert.equal(weekday('2026-10-05'), 0);
    assert.equal(weekday('2026-10-04'), 6);
  });

  it('formats dates', () => {
    assert.equal(dateOf('2026-10', 5), '2026-10-05');
    assert.equal(localDate(new Date(2026, 0, 9, 23, 30)), '2026-01-09');
  });
});
