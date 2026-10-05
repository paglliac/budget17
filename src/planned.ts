import { mainCurrencyConverter } from './balances.ts';
import { addDays } from './dates.ts';
import { operationAmount, operationKind, topCategory, type OperationKind } from './operations.ts';
import type { DateString, EntityCollections } from './zenmoney/types.ts';

/** An operation planned in ZenMoney that has not happened yet. */
export interface PlannedOperation {
  id: string;
  date: DateString;
  kind: OperationKind;
  /** In the main currency, always positive. */
  amount: number;
  title: string;
}

const UNTITLED: Record<OperationKind, string> = { expense: 'Платёж', income: 'Доход', transfer: 'Перевод' };

/** Planned operations from today through the next `days` days, soonest first. */
export function upcomingOperations(
  data: Pick<EntityCollections, 'instrument' | 'user' | 'tag' | 'merchant' | 'reminderMarker'>,
  options: { today: DateString; days?: number },
): PlannedOperation[] {
  const { today, days = 45 } = options;
  const until = addDays(today, days);
  const toMain = mainCurrencyConverter(data);
  const tags = new Map((data.tag ?? []).map((t) => [t.id, t]));
  const merchants = new Map((data.merchant ?? []).map((m) => [m.id, m.title]));

  const planned: PlannedOperation[] = [];
  for (const marker of data.reminderMarker ?? []) {
    if (marker.state !== 'planned' || marker.date < today || marker.date > until) continue;
    const kind = operationKind(marker);
    if (kind === null) continue;
    const { amount, instrument } = operationAmount(marker, kind);
    planned.push({
      id: marker.id,
      date: marker.date,
      kind,
      amount: toMain(amount, instrument),
      title:
        marker.payee?.trim() ||
        (marker.merchant ? merchants.get(marker.merchant) : undefined) ||
        marker.comment?.trim() ||
        topCategory(tags, marker.tag)?.title ||
        UNTITLED[kind],
    });
  }
  return planned.sort(soonestFirst);
}

/** Orders planned operations by date, then by title. */
export function soonestFirst(a: PlannedOperation, b: PlannedOperation): number {
  return a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'ru');
}
