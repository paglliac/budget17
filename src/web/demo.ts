// Demo data for the web UI when there is no local ZenMoney copy yet: four months of operations up to today,
// budgets and planned payments, shaped exactly like API entities so they go through the same code as real data.

import { addDays, shiftMonth, weekday } from '../dates.ts';
import type { Account, Budget, EntityCollections, ReminderMarker, Tag, Transaction } from '../zenmoney/types.ts';

const USER = 1;
const USD = 1;
const RUB = 2;

interface Spec {
  amount: number;
  payee: string;
  tag?: string;
  account?: string;
  /** Destination account; makes the operation a transfer. */
  to?: string;
  income?: boolean;
  instrument?: number;
  comment?: string;
  mcc?: number;
}

/** Monthly payments: [day, spec]. */
const RECURRING: Array<[number, Spec]> = [
  [1, { amount: 58_000, payee: 'Аренда квартиры', tag: 'home', comment: 'Перевод хозяйке' }],
  [3, { amount: 3_640, payee: 'Мосэнергосбыт', tag: 'utilities', mcc: 4900 }],
  [5, { amount: 142_000, payee: 'ООО «Северный ветер»', tag: 'salary', income: true, comment: 'Зарплата' }],
  [6, { amount: 30_000, payee: 'Накопительный счёт', to: 'savings', comment: 'Откладываю' }],
  [7, { amount: 650, payee: 'Т-Мобайл', tag: 'phone', mcc: 4814 }],
  [9, { amount: 890, payee: 'МГТС', tag: 'phone', mcc: 4814, comment: 'Домашний интернет' }],
  [12, { amount: 449, payee: 'Яндекс Плюс', tag: 'subs', mcc: 5815 }],
  [14, { amount: 12.99, payee: 'Steam', tag: 'fun', account: 'usd', instrument: USD, mcc: 5816 }],
  [18, { amount: 299, payee: 'Telegram Premium', tag: 'subs', mcc: 5815 }],
  [20, { amount: 68_000, payee: 'ООО «Северный ветер»', tag: 'salary', income: true, comment: 'Аванс' }],
  [22, { amount: 149, payee: 'iCloud+', tag: 'subs', account: 'platinum', mcc: 5815 }],
  [25, { amount: 20_000, payee: 'Погашение кредитки', to: 'platinum' }],
];

export function demoCollections(today: string): EntityCollections {
  const random = mulberry32(17);
  const between = (min: number, max: number) => min + (max - min) * random();
  const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)]!;

  const transactions: Transaction[] = [];
  const add = (date: string, spec: Spec) => {
    const account = spec.account ?? 'black';
    const instrument = spec.instrument ?? RUB;
    const amount = Math.round(spec.amount * 100) / 100;
    const created = Date.parse(`${date}T00:00:00Z`) / 1000 + Math.floor(between(8, 22) * 3600);
    transactions.push({
      id: `demo-${transactions.length + 1}`,
      changed: created,
      created,
      user: USER,
      deleted: false,
      hold: date === today && random() < 0.5,
      incomeInstrument: instrument,
      incomeAccount: spec.to ?? account,
      income: spec.income || spec.to ? amount : 0,
      outcomeInstrument: instrument,
      outcomeAccount: account,
      outcome: spec.income ? 0 : amount,
      tag: spec.tag ? [spec.tag] : null,
      merchant: null,
      payee: spec.payee,
      originalPayee: spec.payee.toUpperCase(),
      comment: spec.comment ?? null,
      date,
      mcc: spec.mcc ?? null,
      reminderMarker: null,
      opIncome: null,
      opIncomeInstrument: null,
      opOutcome: null,
      opOutcomeInstrument: null,
      latitude: null,
      longitude: null,
    });
  };

  const month = today.slice(0, 7);
  for (let date = `${shiftMonth(month, -4)}-01`; date <= today; date = addDays(date, 1)) {
    const day = Number(date.slice(8, 10));
    const weekend = weekday(date) >= 5;
    for (const [d, spec] of RECURRING) {
      if (d === day) add(date, spec);
    }
    if (random() < 0.6) {
      const payee = pick(['Пятёрочка', 'Перекрёсток', 'ВкусВилл', 'Лента', 'Самокат', 'Магнит']);
      add(date, { amount: between(380, weekend ? 4_200 : 2_400), payee, tag: 'food', mcc: 5411, account: random() < 0.8 ? 'black' : 'platinum' });
    }
    if (random() < (weekend ? 0.55 : 0.35)) {
      const payee = pick(['Кофемания', 'Surf Coffee', 'Шоколадница', 'Вкусно — и точка', 'Додо Пицца', 'Теремок', 'Якитория']);
      add(date, { amount: between(260, 2_600), payee, tag: 'cafe', mcc: 5812 });
    }
    if (!weekend && random() < 0.85) {
      add(date, { amount: 152, payee: 'Московский метрополитен', tag: 'transport', mcc: 4111 });
    }
    if (random() < 0.28) {
      add(date, { amount: between(280, 1_200), payee: 'Яндекс Go', tag: 'taxi', mcc: 4121 });
    }
    if (random() < 0.11) {
      const payee = pick(['Ozon', 'Wildberries', 'Lamoda', 'Леруа Мерлен', 'DNS']);
      add(date, { amount: between(600, 8_900), payee, tag: 'shop', mcc: 5399, account: random() < 0.5 ? 'platinum' : 'black' });
    }
    if (random() < 0.07) {
      const payee = pick(['Аптека Ригла', 'Горздрав', 'Инвитро', 'СберЗдоровье']);
      add(date, { amount: between(300, 3_200), payee, tag: 'health', mcc: 5912 });
    }
    if (random() < 0.07) {
      const payee = pick(['Кинопоиск', 'Каро Фильм', 'Яндекс Афиша', 'Музей «Гараж»']);
      add(date, { amount: between(400, 2_800), payee, tag: 'fun', mcc: 7832 });
    }
    if (random() < 0.03) {
      add(date, { amount: between(900, 5_000), payee: pick(['Цветы 24', 'Подружка', 'Читай-город']), tag: 'gifts' });
    }
    if (random() < 0.04) {
      add(date, { amount: between(200, 1_500), payee: 'Рынок на Тишинке', tag: 'food', account: 'cash' });
    }
  }

  const markers: ReminderMarker[] = [];
  const plan = (date: string, spec: Spec) => {
    const account = spec.account ?? 'black';
    const instrument = spec.instrument ?? RUB;
    markers.push({
      id: `demo-marker-${markers.length + 1}`,
      changed: 0,
      user: USER,
      incomeInstrument: instrument,
      incomeAccount: spec.to ?? account,
      income: spec.income || spec.to ? spec.amount : 0,
      outcomeInstrument: instrument,
      outcomeAccount: account,
      outcome: spec.income ? 0 : spec.amount,
      tag: spec.tag ? [spec.tag] : null,
      merchant: null,
      payee: spec.payee,
      comment: spec.comment ?? null,
      date,
      reminder: `demo-reminder-${spec.payee}`,
      state: 'planned',
      notify: true,
    });
  };
  for (let date = addDays(today, 1); date <= addDays(today, 45); date = addDays(date, 1)) {
    const day = Number(date.slice(8, 10));
    for (const [d, spec] of RECURRING) {
      if (d === day) plan(date, spec);
    }
  }
  plan(addDays(today, 17), { amount: 8_900, payee: 'ОСАГО', tag: 'transport', comment: 'Продлить страховку' });

  const budgets: Budget[] = [];
  for (const m of [month, shiftMonth(month, -1)]) {
    for (const [tag, outcome] of Object.entries(BUDGETS)) {
      budgets.push({ changed: 0, user: USER, tag, date: `${m}-01`, income: 0, incomeLock: false, outcome, outcomeLock: true });
    }
  }

  return {
    instrument: [
      { id: USD, changed: 0, title: 'Доллар США', shortTitle: 'USD', symbol: '$', rate: 96.4 },
      { id: RUB, changed: 0, title: 'Российский рубль', shortTitle: 'RUB', symbol: '₽', rate: 1 },
    ],
    user: [{ id: USER, changed: 0, login: 'demo', currency: RUB, parent: null }],
    account: [
      account('black', 'Т-Банк Black', 'ccard', 86_412.4),
      account('platinum', 'Т-Банк Platinum', 'ccard', -18_740, { creditLimit: 150_000 }),
      account('savings', 'Накопительный счёт', 'checking', 412_000, { savings: true }),
      account('cash', 'Наличные', 'cash', 6_300),
      account('usd', 'Доллары', 'cash', 1_250, { instrument: USD }),
      account('invest', 'Т-Инвестиции', 'checking', 238_500, { inBalance: false }),
    ],
    tag: [
      tag('food', 'Продукты', 0x4fae7f),
      tag('cafe', 'Кафе и рестораны', 0xf09a4a),
      tag('transport', 'Транспорт', 0x5b84f0),
      tag('taxi', 'Такси', null, 'transport'),
      tag('home', 'Жильё', 0x9479e6),
      tag('utilities', 'Коммунальные платежи', null, 'home'),
      tag('phone', 'Связь и интернет', 0x39b5c9),
      tag('subs', 'Подписки', 0xe2678b),
      tag('health', 'Здоровье', 0xef7e6e),
      tag('shop', 'Покупки', 0xc58ad0),
      tag('fun', 'Развлечения', 0xf2c14e),
      tag('gifts', 'Подарки', 0x8fa35b),
      tag('salary', 'Зарплата', 0x3fa46a, null, { showIncome: true, showOutcome: false }),
    ],
    budget: budgets,
    reminderMarker: markers,
    transaction: transactions,
  };
}

const BUDGETS: Record<string, number> = {
  food: 32_000,
  cafe: 14_000,
  transport: 9_000,
  home: 62_000,
  shop: 12_000,
  fun: 5_000,
  subs: 1_200,
};

function account(id: string, title: string, type: Account['type'], balance: number, extra: Partial<Account> = {}): Account {
  return {
    id,
    changed: 0,
    user: USER,
    role: null,
    instrument: RUB,
    company: null,
    type,
    title,
    syncID: null,
    balance,
    startBalance: 0,
    creditLimit: 0,
    inBalance: true,
    savings: false,
    enableCorrection: false,
    enableSMS: false,
    archive: false,
    ...extra,
  };
}

function tag(id: string, title: string, rgb: number | null, parent: string | null = null, extra: Partial<Tag> = {}): Tag {
  return {
    id,
    changed: 0,
    user: USER,
    title,
    parent,
    icon: null,
    picture: null,
    color: rgb === null ? null : 0xff000000 + rgb,
    showIncome: false,
    showOutcome: true,
    budgetIncome: false,
    budgetOutcome: true,
    required: null,
    ...extra,
  };
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
