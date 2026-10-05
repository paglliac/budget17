import type { AccountBalance, BalanceSummary } from './balances.ts';
import type { AppliedChanges } from './store.ts';
import type { Instrument } from './zenmoney/types.ts';

const amountFormat = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'negative',
});

export function formatMoney(amount: number, instrument: Instrument): string {
  return `${amountFormat.format(amount)} ${instrument.symbol}`;
}

export function renderBalances(summary: BalanceSummary): string {
  const { accounts, mainInstrument } = summary;
  const titleWidth = Math.max(0, ...accounts.map((a) => a.title.length));
  const amountWidth = Math.max(0, ...accounts.map((a) => formatMoney(a.balance, a.instrument).length));

  const row = (a: AccountBalance) => {
    let line = `  ${a.title.padEnd(titleWidth)}  ${formatMoney(a.balance, a.instrument).padStart(amountWidth)}`;
    if (a.instrument.id !== mainInstrument.id) {
      line += `  ≈ ${formatMoney(a.balanceInMain, mainInstrument)}`;
    }
    return line;
  };

  const counted = accounts.filter((a) => a.inBalance);
  const excluded = accounts.filter((a) => !a.inBalance);

  const lines = ['Счета:', ...counted.map(row)];
  if (excluded.length > 0) {
    lines.push('', 'Не учитываются в балансе:', ...excluded.map(row));
  }
  lines.push('', `Итого: ${formatMoney(summary.total, mainInstrument)}`);
  return lines.join('\n');
}

const entityLabels: Record<string, string> = {
  instrument: 'валюты',
  country: 'страны',
  company: 'банки и компании',
  user: 'пользователи',
  account: 'счета',
  tag: 'категории',
  budget: 'бюджеты',
  merchant: 'получатели',
  reminder: 'напоминания',
  reminderMarker: 'плановые операции',
  transaction: 'операции',
};

export function renderSyncResult(changes: AppliedChanges): string {
  const parts = Object.entries(changes.updated).map(([type, count]) => `${entityLabels[type] ?? type} ${count}`);
  if (changes.deleted > 0) {
    parts.push(`удалено ${changes.deleted}`);
  }
  if (parts.length === 0) {
    return 'Изменений нет.';
  }
  return `${changes.initial ? 'Первая синхронизация' : 'Изменения'}: ${parts.join(', ')}.`;
}
