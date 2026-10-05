import type { AccountId, AccountType, EntityCollections, Instrument } from './zenmoney/types.ts';

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

export function summarizeBalances(data: Pick<EntityCollections, 'account' | 'instrument' | 'user'>): BalanceSummary {
  const instruments = new Map((data.instrument ?? []).map((i) => [i.id, i]));
  const users = data.user ?? [];
  const mainUser = users.find((u) => u.parent === null) ?? users[0];
  if (!mainUser) {
    throw new Error('В данных ZenMoney нет пользователя');
  }
  const mainInstrument = instruments.get(mainUser.currency);
  if (!mainInstrument) {
    throw new Error(`Неизвестная основная валюта пользователя: ${mainUser.currency}`);
  }

  const accounts = (data.account ?? [])
    // 'debt' is ZenMoney's technical account for loans to/from people.
    .filter((a) => !a.archive && a.type !== 'debt')
    .map((a): AccountBalance => {
      const instrumentId = a.instrument ?? mainUser.currency;
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
