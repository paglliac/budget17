import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { countWorkdays, isWorkday, workdayOnOrBefore } from '../src/workdays.ts';

describe('production calendar', () => {
  it('has 247 working days in 2025 and 2026, as the official calendars do', () => {
    assert.equal(countWorkdays('2025-01-01', '2025-12-31'), 247);
    assert.equal(countWorkdays('2026-01-01', '2026-12-31'), 247);
  });

  it('counts working days of a month and of its first half', () => {
    assert.equal(countWorkdays('2026-10-01', '2026-10-31'), 22);
    assert.equal(countWorkdays('2026-10-01', '2026-10-15'), 11);
    assert.equal(countWorkdays('2026-11-01', '2026-11-30'), 20, '4 November is a holiday');
    assert.equal(countWorkdays('2026-01-01', '2026-01-31'), 15);
  });

  it('moves a holiday off a weekend to the next working day, and follows the decree', () => {
    assert.equal(isWorkday('2025-02-24'), false, '23 February 2025 is a Sunday');
    assert.equal(isWorkday('2025-03-10'), false, '8 March 2025 is a Saturday');
    assert.equal(isWorkday('2026-05-11'), false, '9 May 2026 is a Saturday');
    assert.equal(isWorkday('2025-11-01'), true, 'a working Saturday');
    assert.equal(isWorkday('2026-01-09'), false);
    assert.equal(isWorkday('2026-12-31'), false);
    assert.equal(isWorkday('2026-10-05'), true);
  });

  it('finds the last working day on or before a date', () => {
    assert.equal(workdayOnOrBefore('2026-10-20'), '2026-10-20');
    assert.equal(workdayOnOrBefore('2026-12-20'), '2026-12-18');
    assert.equal(workdayOnOrBefore('2027-01-05'), '2026-12-30', 'past the New Year holidays and 31 December');
  });
});
