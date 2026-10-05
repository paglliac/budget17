import type { AccountId, AccountType, EntityCollections, Instrument, InstrumentId } from './zenmoney/types.ts';

export interface AccountBalance {
  id: AccountId;
  title: string;
  type: AccountType;
  balance: number;
  instrument: Instrument;
  /** Balance converted to the user's main currency. */
  balanceInMain: number;
  inBalance: boolean;
}

export interface BalanceSummary {
  mainInstrument: Instrument;
  /** Active accounts: those counted in the total first, then by balance descending. */
  accounts: AccountBalance[];
  /** Sum of accounts counted in the total, in the main currency. */
  total: number;
}

export function convert(amount: number, from: Instrument, to: Instrument): number {
  return from.id === to.id ? amount : (amount * from.rate) / to.rate;
}

/** Converts amounts in any of the user's currencies into the main currency. */
export function mainCurrencyConverter(
  data: Pick<EntityCollections, 'instrument' | 'user'>,
): (amount: number, instrument: InstrumentId) => number {
  const main = mainCurrency(data);
  const instruments = new Map((data.instrument ?? []).map((i) => [i.id, i]));
  return (amount, id) => {
    const instrument = instruments.get(id);
    if (!instrument) {
      throw new Error(`Неизвестная валюта: ${id}`);
    }
    return convert(amount, instrument, main);
  };
}

/** The family administrator's currency, which totals are shown in. */
export function mainCurrency(data: Pick<EntityCollections, 'instrument' | 'user'>): Instrument {
  const users = data.user ?? [];
  const mainUser = users.find((u) => u.parent === null) ?? users[0];
  if (!mainUser) {
    throw new Error('В данных ZenMoney нет пользователя');
  }
  const instrument = (data.instrument ?? []).find((i) => i.id === mainUser.currency);
  if (!instrument) {
    throw new Error(`Неизвестная основная валюта пользователя: ${mainUser.currency}`);
  }
  return instrument;
}

export function summarizeBalances(data: Pick<EntityCollections, 'account' | 'instrument' | 'user'>): BalanceSummary {
  const instruments = new Map((data.instrument ?? []).map((i) => [i.id, i]));
  const mainInstrument = mainCurrency(data);

  const accounts = (data.account ?? [])
    // 'debt' is ZenMoney's technical account for loans to/from people.
    .filter((a) => !a.archive && a.type !== 'debt')
    .map((a): AccountBalance => {
      const instrumentId = a.instrument ?? mainInstrument.id;
      const instrument = instruments.get(instrumentId);
      if (!instrument) {
        throw new Error(`Неизвестная валюта ${instrumentId} у счёта «${a.title}»`);
      }
      const balance = a.balance ?? 0;
      return {
        id: a.id,
        title: a.title,
        type: a.type,
        balance,
        instrument,
        balanceInMain: convert(balance, instrument, mainInstrument),
        inBalance: a.inBalance,
      };
    })
    .sort((a, b) => Number(b.inBalance) - Number(a.inBalance) || b.balanceInMain - a.balanceInMain);

  const total = accounts.filter((a) => a.inBalance).reduce((sum, a) => sum + a.balanceInMain, 0);

  return { mainInstrument, accounts, total };
}
