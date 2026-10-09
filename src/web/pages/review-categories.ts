// PROTOTYPE, throwaway (branch prototype/review-categories): what the categories should become and how to fix them
// on the month review — subcategories and hints. Three variants on /review, switched by ?variant=A|B|C and the
// floating bar:
// A «Раскрыть в карточке»: a category unfolds into its subcategories in the card (?open=), hints are listed beside it.
// B «Карта недель»: what the weeks were made of as tiles, the unsorted ones hatched; a tile opens on the side (?tile=).
// C «По получателям»: a category opens on /review/categories?cat=, where each payee is put into a subcategory in one
//   click; the side lists the whole set of categories.
// A subcategory goes by payee: a payee put into one takes all its spends of that category along, in every month.
// The hints marked «Claude» were written by Claude in a session from the September data (a wizard behind the
// curtain); «по прошлым тратам» and «правило» are worked out by rules. Everything lives in memory of the server and is
// gone when it restarts; settings.db is never written.

import { mainCurrency } from '../../balances.ts';
import { categoryCatalog } from '../../categories.ts';
import { addDays, monthOf, type MonthString } from '../../dates.ts';
import type { Operation } from '../../ledger.ts';
import type { RegularExpense } from '../../regular.ts';
import { transferHint, type MonthReview, type ToCheck } from '../../review.ts';
import { WEEK_LIMIT, weeksOfMonth } from '../../week.ts';
import type { EntityCollections, TagId } from '../../zenmoney/types.ts';
import { pageDocument } from '../document.ts';
import { dayMonth, money, monthName, num, percent } from '../format.ts';
import { Html, html } from '../html.ts';
import { categoryIcon, type IconName } from '../icons.ts';
import { categoryColor, toneColor, type Tone } from '../tones.ts';
import { suggestionList } from '../widgets/assistant.ts';
import { choiceGroup, emptyState, inlineForm, listHeading, pageIntro, section, segmentedLinks, shareBar } from '../widgets/basics.ts';
import { figureCard, panelCard } from '../widgets/cards.ts';
import { categoryMap } from '../widgets/charts.ts';
import { entryList, entryRow } from '../widgets/entries.ts';
import { amountList } from '../widgets/operations.ts';
import { appShell, grid, stack, toolbar, topBar } from '../widgets/shell.ts';
import { appRail, monthTabs, type Href } from './chrome.ts';
import type { SavedBudget } from './dashboard.ts';
import { allExpenses, markingTitle } from './marking.ts';
import { count, EXPENSES, mainBlocks, side, stop, sumOf, TO_CHECK_ROWS, versusUsual, type Page, type ReviewData } from './review.ts';

// ---- Variants

export type VariantKey = 'A' | 'B' | 'C';

const VARIANTS: Array<{ key: VariantKey; name: string }> = [
  { key: 'A', name: 'Раскрыть в карточке' },
  { key: 'B', name: 'Карта недель' },
  { key: 'C', name: 'По получателям' },
];

export function parseVariant(value: string | null | undefined): VariantKey {
  return VARIANTS.find((v) => v.key === value?.toUpperCase())?.key ?? 'A';
}

// ---- State, in memory

export interface Sub {
  id: string;
  parent: TagId;
  title: string;
}

interface Cat {
  id: TagId;
  title: string;
  color: string | null;
  hidden: boolean;
}

const state = {
  subs: [] as Sub[],
  /** `<category id>|<payee key>` → sub id: the payee's spends in that category go into the sub. */
  payeeSub: new Map<string, string>(),
  /** Payee key → category: every spend of the payee goes there. */
  payeeCategory: new Map<string, TagId>(),
  /** Spend id → where it was moved, for spends moved one by one, such as transfers to oneself. */
  spendMove: new Map<string, { category: TagId; sub: string | null }>(),
  added: [] as Array<{ id: TagId; title: string }>,
  renamed: new Map<TagId, string>(),
  hidden: new Set<TagId>(),
  /** Hints acted on, by id, with what they said then and the month they were shown for. */
  done: new Map<string, { title: string; text: string; month: MonthString }>(),
  dismissed: new Set<string>(),
};
let lastId = 0;

/** A payee as one, whatever shop number the bank adds: «Lenta 089» and «Lenta-0089» are both «lenta». */
export function payeeKey(payee: string): string {
  const key = payee
    .toLocaleLowerCase('ru')
    .replace(/[0-9]+/g, ' ')
    .replace(/[\s_*.\-"«»()#№]+/g, ' ')
    .trim();
  return key || payee.toLocaleLowerCase('ru');
}

function text(o: Operation): string {
  return [o.payee, o.originalPayee, o.comment].filter(Boolean).join(' ');
}

/** The categories with what was renamed, hidden and added in memory. */
export function protoCatalog(data: EntityCollections, saved: Pick<SavedBudget, 'categories'>): Cat[] {
  return [
    ...categoryCatalog(data.tag ?? [], saved.categories).map((c) => ({
      id: c.id,
      title: state.renamed.get(c.id) ?? c.title,
      color: c.color,
      hidden: c.hidden || state.hidden.has(c.id),
    })),
    ...state.added.map((c) => ({ id: c.id, title: c.title, color: null, hidden: state.hidden.has(c.id) })),
  ];
}

/** Expenses with the categories they were moved into in memory. Payments of regular expenses and purchases stay. */
export function overlay(expenses: Operation[], categories: Cat[]): Operation[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return expenses.map((o) => {
    if (o.regular || o.purchase) return o;
    const moved = state.spendMove.get(o.id)?.category ?? state.payeeCategory.get(payeeKey(o.payee));
    const c = moved ? byId.get(moved) : o.category ? byId.get(o.category.id) : undefined;
    if (!c || (!moved && c.title === o.category?.title)) return o;
    return { ...o, category: { id: c.id, title: c.title, color: c.color } };
  });
}

export function subOf(o: Operation): Sub | null {
  if (!o.category) return null;
  const id = state.spendMove.get(o.id)?.sub ?? state.payeeSub.get(`${o.category.id}|${payeeKey(o.payee)}`);
  const sub = id ? state.subs.find((s) => s.id === id) : undefined;
  return sub && sub.parent === o.category.id ? sub : null;
}

function ensureSub(parent: TagId, title: string): Sub {
  const found = state.subs.find((s) => s.parent === parent && s.title.toLocaleLowerCase('ru') === title.toLocaleLowerCase('ru'));
  if (found) return found;
  const sub = { id: `sub-${++lastId}`, parent, title };
  state.subs.push(sub);
  return sub;
}

// ---- Hints

const PRODUCTS = '2e3c6547-c5df-43f4-beea-0770d2279d89';
const CAFE = 'df20d386-77ed-464f-af2b-8744aee88dce';
const CAR = '46847e0a-f847-4ff9-acc2-1b67d7d210a3';
const SHOPPING = '7f40be37-8032-4f18-9725-53b5ab6dc497';
const HEALTH = '48e31440-28a3-4459-acaf-600708ec7271';
const HOME = '50ada988-4126-4d5d-9346-9a130a31c729';
const PHONE = 'd56689c1-a6d2-402b-94a7-99aadbcbd9f4';
const SUBSCRIPTIONS = 'own-1';
const PERSON = /^[А-ЯЁ][а-яё]+ [А-ЯЁ]\.$/;

/** Subcategories Claude would split a category into; a sub without `match` or `person` takes the rest. */
interface Split {
  id: string;
  category: TagId;
  why: string;
  subs: Array<{ title: string; match?: RegExp; person?: boolean }>;
}

const SPLITS: Split[] = [
  {
    id: 'split:products',
    category: PRODUCTS,
    why: 'Лента — крупно раз в неделю, рынок — переводами людям, доставка — мелко и часто.',
    subs: [
      { title: 'Лента', match: /lenta|лента/i },
      {
        title: 'Рынок и фермеры',
        person: true,
        match: /fresh ?fru|frukt|фрукт|овощ|ptichij|птичий|kozhevnikov|panysheva|umarova|умарова|zaripov|abdurakhmonov|myaso|мясо|syrnyj|сырн|freshik|фрешик/i,
      },
      { title: 'Доставка', match: /samokat|самокат|yandex\W*\d*\W*eda|яндекс еда|yandex market|kuper|купер|vkusvill/i },
      { title: 'Табак', match: /smoking|tabak|табак/i },
      { title: 'Магазины у дома' },
    ],
  },
  {
    id: 'split:cafe',
    category: CAFE,
    why: 'Кофе с выпечкой на ходу и походы в рестораны — разные траты.',
    subs: [{ title: 'Кофе и выпечка', match: /coff?ee|kofe|кофе|khofenberg|хофенберг|khleb|хлеб|bulochn|булочн|пекарн|tortish|babl|be-be|take and wake|surf/i }, { title: 'Рестораны' }],
  },
  {
    id: 'split:car',
    category: CAR,
    why: 'Топливо — каждую неделю, страховка — раз в год; проезд в автобусе лежит здесь же.',
    subs: [
      { title: 'Топливо', match: /gazprom|газпром|lukoil|лукойл|forus|форус|\bazs\b|\bазс\b|rosneft|роснефть/i },
      { title: 'Страховка', match: /страхов|strakh/i },
      { title: 'Штрафы', match: /штраф|gibdd|гибдд/i },
      { title: 'Проезд', match: /transport|proezd|avtobus|автобус|tpp/i },
    ],
  },
  {
    id: 'split:shopping',
    category: SHOPPING,
    why: 'Маркетплейсы, одежда и техника — три разных статьи.',
    subs: [
      { title: 'Ozon и WB', match: /ozon|озон|wildberries|вайлдберр|^wb\b/i },
      { title: 'Одежда и обувь', match: /lamoda|ламода|спортмастер|sportmaster|ecco|calzedonia|золотое яблоко|gloria|zara|befree|ostin/i },
      { title: 'Электроника', match: /\bdns\b|днс|mvideo|м\.видео|citilink|ситилинк|eldorado/i },
      { title: 'Авито и AliExpress', match: /avito|авито|aliexpress/i },
    ],
  },
  {
    id: 'split:health',
    category: HEALTH,
    why: 'Аптеки отдельно от врачей и анализов.',
    subs: [
      { title: 'Аптеки', match: /apte|аптек|zhivika|живика|romashka|ромашка/i },
      { title: 'Врачи и анализы', match: /premermed|gemotest|гемотест|ovum|medico|медико|мособлмед|melodiya|tridtsat|гидаятова|клиник|clinic|invitro|инвитро/i },
    ],
  },
];

function splitSub(split: Split, o: Operation): string | null {
  for (const s of split.subs) {
    if ((s.match && s.match.test(text(o))) || (s.person && PERSON.test(o.payee))) return s.title;
  }
  return split.subs.find((s) => !s.match && !s.person)?.title ?? null;
}

interface Context {
  regular: readonly Pick<RegularExpense, 'title' | 'amount'>[];
  selfPayee: string | null;
}

/** A group of spends Claude would move into a category; per spend when the payee says nothing, as with oneself. */
interface Move {
  id: string;
  icon: IconName;
  tone: Tone;
  label: string;
  title?: string;
  why: string;
  match: (o: Operation, c: Context) => boolean;
  to: { category: TagId; rename?: string } | { create: string };
  sub?: string;
  /** Only the spends of the month shown, as the amount is only a guess. */
  monthOnly?: boolean;
}

const MOVES: Move[] = [
  {
    id: 'move:marketplace',
    icon: 'card',
    tone: 'violet',
    label: 'Переводы себе с некруглой суммой',
    why: 'Так выглядит оплата покупок на Ozon и WB; какой из двух банков — по данным не видно.',
    match: (o, c) => !o.category && c.selfPayee !== null && o.payee === c.selfPayee && transferHint(o, c.regular) === 'marketplace',
    to: { category: SHOPPING },
    sub: 'Ozon и WB',
    monthOnly: true,
  },
  {
    id: 'move:tips',
    icon: 'coffee',
    tone: 'blue',
    label: 'Нетмонет',
    why: 'Это чаевые: в комментарии банка «Оплата чаевых».',
    match: (o) => !o.category && /нетмонет|netmonet|чаев/i.test(text(o)),
    to: { category: CAFE },
  },
  {
    id: 'move:yandex-plus',
    icon: 'repeat',
    tone: 'pink',
    label: 'Яндекс Плюс',
    why: 'В комментарии банка — «Яндекс Плюс», это подписка; Timeweb у вас уже в «Подписках».',
    match: (o) => !o.category && /яндекс плюс|yandex plus/i.test(text(o)),
    to: { category: SUBSCRIPTIONS },
  },
  {
    id: 'move:tobacco',
    icon: 'cart',
    tone: 'teal',
    label: 'Табак',
    why: 'Smoking Shop у вас в «Продуктах», а этот магазин табака — без категории.',
    match: (o) => !o.category && /tabak|табак/i.test(text(o)),
    to: { category: PRODUCTS },
    sub: 'Табак',
  },
  {
    id: 'move:lemana',
    icon: 'home',
    tone: 'teal',
    label: 'Лемана Про',
    why: 'Лемана Про — бывший Леруа Мерлен: товары для дома и ремонта.',
    match: (o) => !o.category && /lemana|леман/i.test(text(o)),
    to: { category: HOME },
  },
  {
    id: 'move:meat',
    icon: 'cart',
    tone: 'orange',
    label: 'Свежее мясо',
    why: 'Это мясная лавка, а ZenMoney записал её в «Кафе и рестораны».',
    match: (o) => o.category?.id === CAFE && /svezhee myaso|свежее мясо/i.test(text(o)),
    to: { category: PRODUCTS },
    sub: 'Рынок и фермеры',
  },
  {
    id: 'move:telecom',
    icon: 'phone',
    tone: 'blue',
    label: 'Т-Мобайл и Goodline',
    title: '«Мобильный телефон» → «Связь»',
    why: 'Категория «Мобильный телефон» пустует, а связь и интернет лежат в «Доме»: переименовать её в «Связь» и перенести их туда.',
    match: (o) => (!o.category || o.category.id === HOME) && /mobayl|мобайл|goodline|bilayn|билайн|beeline|yota/i.test(text(o)),
    to: { category: PHONE, rename: 'Связь' },
  },
  {
    id: 'move:fuel',
    icon: 'car',
    tone: 'orange',
    label: 'Заправки',
    why: 'Газпромнефть, Лукойл и Форус — АЗС; часть таких трат уже в «Автомобиле».',
    match: (o) => !o.category && /gazprom|газпром|lukoil|лукойл|forus|форус|\bazs\b|\bазс\b/i.test(text(o)),
    to: { category: CAR },
    sub: 'Топливо',
  },
  {
    id: 'move:car',
    icon: 'car',
    tone: 'orange',
    label: 'Страховка и штрафы',
    why: 'Т-Страхование и штрафы ГИБДД — расходы на машину.',
    match: (o) => !o.category && /страхов|штраф/i.test(text(o)),
    to: { category: CAR },
  },
  {
    id: 'move:travel',
    icon: 'ticket',
    tone: 'yellow',
    label: 'Билеты и гостиницы',
    why: 'Авиабилеты и отель — поездка, а такой категории нет: завести «Путешествия».',
    match: (o) => !o.category && /авиабилет|aviabilet|aviasales|hotel|отел|cosmos|ржд|rzd|tutu/i.test(text(o)),
    to: { create: 'Путешествия' },
  },
];

export interface Hint {
  id: string;
  kind: 'split' | 'move' | 'learned' | 'hide';
  icon: IconName;
  tone: Tone;
  title: string;
  text: string;
  source: string;
  actionLabel: string;
  amount: number;
  /** The category it splits, hides or moves spends into. */
  category: TagId | null;
  /** Spends of the month it moves, by id. */
  spends: string[];
  /** For a split: what each subcategory would hold this month. */
  preview: Array<{ title: string; amount: number }>;
  done: boolean;
}

interface HintInput {
  month: MonthString;
  /** Expenses of the month's weeks. */
  monthSpends: Operation[];
  /** Ordinary expenses of the month's weeks, those that count by category. */
  ordinary: Operation[];
  all: Operation[];
  catalog: Cat[];
  context: Context;
  symbol: string;
}

function catTitle(catalog: Cat[], id: TagId): string {
  return catalog.find((c) => c.id === id)?.title ?? 'категория';
}

function moveTarget(m: Move, catalog: Cat[]): string {
  if ('create' in m.to) return m.to.create;
  return m.to.rename ?? catTitle(catalog, m.to.category);
}

/** The hints for a month, largest first; done ones keep what they said, dismissed ones are left out. */
export function hintsFor(input: HintInput): Hint[] {
  const { month, catalog, symbol } = input;
  const hints: Hint[] = [];
  const base = (id: string) => ({ done: false, spends: [] as string[], preview: [], category: null, id });

  for (const split of SPLITS) {
    if (state.dismissed.has(split.id) || state.done.has(split.id) || !catalog.some((c) => c.id === split.category)) continue;
    if (state.subs.some((s) => s.parent === split.category)) continue;
    const spends = input.ordinary.filter((o) => o.category?.id === split.category);
    const sums = new Map<string, number>();
    let rest = 0;
    for (const o of spends) {
      const sub = splitSub(split, o);
      if (sub) sums.set(sub, (sums.get(sub) ?? 0) + o.amount);
      else rest += o.amount;
    }
    const preview = split.subs.map((s) => ({ title: s.title, amount: sums.get(s.title) ?? 0 })).filter((s) => s.amount > 0);
    if (preview.length < 2) continue;
    if (rest > 0) preview.push({ title: 'Остальное', amount: rest });
    const title = catTitle(catalog, split.category);
    hints.push({
      ...base(split.id),
      kind: 'split',
      icon: 'layers',
      tone: 'teal',
      title: `Разбить «${title}» на ${count(preview.filter((p) => p.title !== 'Остальное').length, ['подкатегорию', 'подкатегории', 'подкатегорий'])}`,
      text: `${preview.map((p) => `${p.title} ${num(p.amount)}`).join(', ')}. ${split.why}`,
      source: 'Claude',
      actionLabel: 'Разбить',
      amount: spends.reduce((s, o) => s + o.amount, 0),
      category: split.category,
      preview,
    });
  }

  const claimed = new Set<string>();
  for (const m of MOVES) {
    if (state.dismissed.has(m.id) || state.done.has(m.id)) continue;
    if ('category' in m.to && !catalog.some((c) => 'category' in m.to && c.id === m.to.category)) continue;
    const spends = input.monthSpends.filter((o) => !o.regular && !o.purchase && m.match(o, input.context));
    if (!spends.length) continue;
    for (const o of spends) claimed.add(o.id);
    const amount = spends.reduce((s, o) => s + o.amount, 0);
    const target = `${moveTarget(m, catalog)}${m.sub ? ` › ${m.sub}` : ''}`;
    hints.push({
      ...base(m.id),
      kind: 'move',
      icon: m.icon,
      tone: m.tone,
      title: m.title ?? `${m.label} → «${target}»`,
      text: `${count(spends.length, EXPENSES)} на ${stop(money(amount, symbol))} ${m.why}`,
      source: 'Claude',
      actionLabel: m.title ? 'Сделать' : 'Перенести',
      amount,
      category: 'category' in m.to ? m.to.category : null,
      spends: spends.map((o) => o.id),
    });
  }

  // A payee that went into one category before is likely to go there again.
  const learned = new Map<string, Operation[]>();
  for (const o of input.monthSpends) {
    if (o.category || o.regular || o.purchase || claimed.has(o.id) || o.payee === input.context.selfPayee) continue;
    const key = payeeKey(o.payee);
    learned.set(key, [...(learned.get(key) ?? []), o]);
  }
  for (const [key, spends] of learned) {
    const id = `learned:${key}`;
    if (state.dismissed.has(id) || state.done.has(id)) continue;
    const before = input.all.filter((o) => o.category && !o.regular && payeeKey(o.payee) === key).sort((a, b) => b.date.localeCompare(a.date));
    if (!before.length) continue;
    const counts = new Map<TagId, number>();
    for (const o of before) counts.set(o.category!.id, (counts.get(o.category!.id) ?? 0) + 1);
    const [category, times] = [...counts].sort((a, b) => b[1] - a[1])[0]!;
    if (times * 3 < before.length * 2) continue;
    const last = before.find((o) => o.category!.id === category)!;
    const amount = spends.reduce((s, o) => s + o.amount, 0);
    hints.push({
      ...base(id),
      kind: 'learned',
      icon: 'repeat',
      tone: 'green',
      title: `${spends[0]!.payee} → «${catTitle(catalog, category)}»`,
      text: `${count(spends.length, EXPENSES)} на ${stop(money(amount, symbol))} Так ${times > 1 ? `размечены ${times} траты, последняя` : 'размечена трата'} ${dayMonth(last.date)} на ${stop(money(last.amount, symbol))}`,
      source: 'по прошлым тратам',
      actionLabel: 'Перенести',
      amount,
      category,
      spends: spends.map((o) => o.id),
    });
  }

  // What moves this month's spends comes first, as it changes the month's figures; splits only show more.
  const order = { move: 0, learned: 0, split: 1, hide: 2 };
  hints.sort((a, b) => order[a.kind] - order[b.kind] || b.amount - a.amount);

  // A category nobody has put anything into for three months only gets in the way when marking.
  const since = addDays(`${month}-01`, -90);
  const wanted = new Set(MOVES.filter((m) => !state.dismissed.has(m.id) && 'category' in m.to).map((m) => ('category' in m.to ? m.to.category : '')));
  for (const c of catalog) {
    const id = `hide:${c.id}`;
    if (c.hidden || wanted.has(c.id) || state.added.some((a) => a.id === c.id) || state.dismissed.has(id) || state.done.has(id)) continue;
    const used = input.all.filter((o) => o.category?.id === c.id);
    if (used.some((o) => o.date >= since)) continue;
    hints.push({
      ...base(id),
      kind: 'hide',
      icon: 'x',
      tone: 'gray',
      title: `Скрыть «${c.title}»`,
      text: used.length ? `За три месяца трат в ней нет, последняя — ${dayMonth(used.sort((a, b) => b.date.localeCompare(a.date))[0]!.date)}.` : 'Трат в ней не было ни разу.',
      source: 'правило',
      actionLabel: 'Скрыть',
      amount: 0,
      category: c.id,
    });
  }

  for (const [id, done] of state.done) {
    if (done.month !== month) continue;
    hints.push({ ...base(id), kind: 'move', icon: 'check', tone: 'gray', title: done.title, text: done.text, source: '', actionLabel: '', amount: 0, done: true });
  }
  return hints;
}

// ---- What a page shows

export interface ProtoData {
  variant: VariantKey;
  open: string | null;
  tile: string | null;
  cat: string | null;
  /** A: all hints, not only the first. */
  more: boolean;
  edit: string | null;
  catalog: Cat[];
  subs: Sub[];
  hints: Hint[];
  /** Ordinary expenses of the month's weeks: they make up the categories. */
  ordinary: Operation[];
  /** Every expense, for how often a category is used. */
  all: Operation[];
}

export function loadProto(
  data: EntityCollections,
  saved: SavedBudget,
  review: MonthReview,
  catalog: Cat[],
  options: { today: string; variant?: string | null; open?: string | null; tile?: string | null; cat?: string | null; more?: string | null; edit?: string | null },
): ProtoData {
  const all = overlay(allExpenses(data, saved), catalog);
  const ordinary = review.expenses.filter((e) => e.kind === 'ordinary').map((e) => e.operation);
  return {
    variant: parseVariant(options.variant),
    open: options.open ?? null,
    tile: options.tile ?? null,
    cat: options.cat ?? null,
    more: Boolean(options.more),
    edit: options.edit ?? null,
    catalog,
    subs: [...state.subs],
    hints: hintsFor({
      month: review.month,
      monthSpends: review.expenses.map((e) => e.operation),
      ordinary,
      all,
      catalog,
      context: { regular: saved.regular, selfPayee: saved.selfPayee ?? null },
      symbol: mainCurrency(data).symbol,
    }),
    ordinary,
    all,
  };
}

// ---- Acting on hints and choices

function monthRange(month: MonthString, weekStart: SavedBudget['weekStart']): { from: string; to: string } {
  const weeks = weeksOfMonth(month, weekStart);
  return { from: weeks[0]!, to: addDays(weeks.at(-1)!, 6) };
}

/**
 * Applies a form posted to /prototype/categories/…: accept/<hint>?month=, dismiss/<hint>, payee-sub (category, payee,
 * sub or title), payee-category (payee, category), spends-category (spends, category), hide/<category>, show/<category>
 * and reset. False when nothing posts there.
 */
export function submitPrototype(path: string, query: URLSearchParams, posted: URLSearchParams, data: EntityCollections, saved: SavedBudget): boolean {
  const match = /^\/prototype\/categories\/([\w-]+)(?:\/(.+))?$/.exec(path);
  if (!match) return false;
  // Choices post empty forms to URLs that carry what was chosen, so the query and the form read alike.
  const body = new URLSearchParams([...query, ...posted]);
  const [, action, arg] = match;
  const id = arg ? decodeURIComponent(arg) : '';
  const catalog = protoCatalog(data, saved);
  switch (action) {
    case 'reset':
      state.subs = [];
      state.payeeSub.clear();
      state.payeeCategory.clear();
      state.spendMove.clear();
      state.added = [];
      state.renamed.clear();
      state.hidden.clear();
      state.done.clear();
      state.dismissed.clear();
      return true;
    case 'dismiss':
      state.dismissed.add(id);
      return true;
    case 'hide':
    case 'show':
      if (action === 'hide') state.hidden.add(id);
      else state.hidden.delete(id);
      return true;
    case 'payee-category': {
      const payee = body.get('payee') ?? '';
      const category = body.get('category') ?? '';
      if (payee && category) state.payeeCategory.set(payee, category);
      return true;
    }
    case 'spends-category': {
      const category = body.get('category') ?? '';
      for (const spend of (body.get('spends') ?? '').split(',').filter(Boolean)) state.spendMove.set(spend, { category, sub: null });
      return true;
    }
    case 'payee-sub': {
      const category = body.get('category') ?? '';
      const payee = body.get('payee') ?? '';
      const title = (body.get('title') ?? '').trim().slice(0, 60);
      const sub = body.get('sub') ?? '';
      const key = `${category}|${payee}`;
      if (title) state.payeeSub.set(key, ensureSub(category, title).id);
      else if (sub) state.payeeSub.set(key, sub);
      else state.payeeSub.delete(key);
      return true;
    }
    case 'accept':
      accept(id, body.get('month') ?? '', data, saved, catalog);
      return true;
    default:
      return false;
  }
}

function accept(id: string, month: MonthString, data: EntityCollections, saved: SavedBudget, catalog: Cat[]): void {
  const all = overlay(allExpenses(data, saved), catalog);
  const range = monthRange(month, saved.weekStart);
  const monthSpends = all.filter((o) => o.date >= range.from && o.date <= range.to);
  const context = { regular: saved.regular, selfPayee: saved.selfPayee ?? null };
  const hint = hintsFor({ month, monthSpends, ordinary: monthSpends.filter((o) => o.category), all, catalog, context, symbol: mainCurrency(data).symbol }).find((h) => h.id === id);
  if (!hint || hint.done) return;
  state.done.set(id, { title: hint.title, text: hint.text, month });

  const split = SPLITS.find((s) => s.id === id);
  if (split) {
    for (const o of all.filter((o) => o.category?.id === split.category)) {
      const title = splitSub(split, o);
      const key = `${split.category}|${payeeKey(o.payee)}`;
      if (title && !state.payeeSub.has(key)) state.payeeSub.set(key, ensureSub(split.category, title).id);
    }
    return;
  }
  const move = MOVES.find((m) => m.id === id);
  if (move) {
    let category: TagId;
    if ('create' in move.to) {
      const create = move.to.create;
      category = state.added.find((c) => c.title === create)?.id ?? `proto-${++lastId}`;
      if (!state.added.some((c) => c.id === category)) state.added.push({ id: category, title: create });
    } else {
      category = move.to.category;
      if (move.to.rename) state.renamed.set(category, move.to.rename);
    }
    const sub = move.sub ? ensureSub(category, move.sub).id : null;
    for (const o of (move.monthOnly ? monthSpends : all).filter((o) => !o.regular && !o.purchase && move.match(o, context))) state.spendMove.set(o.id, { category, sub });
    return;
  }
  if (id.startsWith('learned:') && hint.category) {
    state.payeeCategory.set(id.slice('learned:'.length), hint.category);
    return;
  }
  if (id.startsWith('hide:')) state.hidden.add(id.slice('hide:'.length));
}

// ---- Shared pieces

function hintActions(page: Page, h: Hint): Array<{ label: string; action: string }> {
  const { d, href } = page;
  if (h.done) return [];
  return [
    { label: h.actionLabel, action: href(`/prototype/categories/accept/${encodeURIComponent(h.id)}`, { month: d.review.month }) },
    { label: 'Не надо', action: href(`/prototype/categories/dismiss/${encodeURIComponent(h.id)}`) },
  ];
}

function hintItems(page: Page, hints: Hint[]) {
  return hints.map((h) => ({
    icon: h.icon,
    tone: h.tone,
    title: h.title,
    text: h.text,
    source: h.done ? undefined : h.source || undefined,
    actions: hintActions(page, h),
    done: h.done,
  }));
}

function catColor(c: { id: TagId; color: string | null }): string {
  return categoryColor(c.id, c.color);
}

/** A lighter shade of a category's colour for its n-th subcategory. */
function shade(color: string, n: number): string {
  return `color-mix(in srgb, ${color} ${Math.max(28, 85 - n * 14)}%, white)`;
}

/** The subcategories of a category with what went into them of `spends`, largest first, and the rest without one. */
function subsOf(spends: Operation[], category: TagId): Array<{ id: string | null; title: string; amount: number; count: number }> {
  const rows = new Map<string | null, { id: string | null; title: string; amount: number; count: number }>();
  for (const o of spends) {
    if (o.category?.id !== category) continue;
    const sub = subOf(o);
    const row = rows.get(sub?.id ?? null) ?? { id: sub?.id ?? null, title: sub?.title ?? 'Без подкатегории', amount: 0, count: 0 };
    row.amount += o.amount;
    row.count += 1;
    rows.set(row.id, row);
  }
  if (![...rows.keys()].some((k) => k !== null)) return [];
  return [...rows.values()].sort((a, b) => (a.id === null ? 1 : b.id === null ? -1 : b.amount - a.amount));
}

/** Spends grouped by payee, largest first. */
function byPayee(spends: Operation[]): Array<{ key: string; payee: string; amount: number; spends: Operation[] }> {
  const groups = new Map<string, { key: string; payee: string; amount: number; spends: Operation[] }>();
  for (const o of spends) {
    const key = payeeKey(o.payee);
    const g = groups.get(key) ?? { key, payee: o.payee, amount: 0, spends: [] };
    g.amount += o.amount;
    g.spends.push(o);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.amount - a.amount);
}

/** What Claude would make of a payee in a category: the subcategory of its split, before the split is accepted. */
function suggestedSub(category: TagId, o: Operation): string | null {
  const split = SPLITS.find((s) => s.category === category);
  return split ? splitSub(split, o) : null;
}

/** Categories offered to move spends into: the shown ones, with the one suggested first. */
function categoryChoices(page: Page, action: string, hidden: Record<string, string>, suggested: TagId | null) {
  const { d } = page;
  const shown = d.proto.catalog.filter((c) => !c.hidden);
  const ordered = [...shown].sort((a, b) => (a.id === suggested ? -1 : b.id === suggested ? 1 : 0));
  return ordered.map((c) => ({
    label: c.title,
    color: catColor(c),
    suggested: c.id === suggested,
    action: `${action}${action.includes('?') ? '&' : '?'}${new URLSearchParams({ ...hidden, category: c.id }).toString()}`,
  }));
}

/**
 * Posts in a choice go as query params, since choiceGroup posts an empty form; the server reads the body and the
 * query alike for /prototype/categories.
 */
function postHref(page: Page, path: string, params: Record<string, string>): string {
  return `${page.href(path)}${page.href(path).includes('?') ? '&' : '?'}${new URLSearchParams(params).toString()}`;
}

function subChoices(page: Page, category: TagId, payee: string, sample: Operation) {
  const { d } = page;
  const current = state.payeeSub.get(`${category}|${payee}`) ?? null;
  const subs = d.proto.subs.filter((s) => s.parent === category);
  const suggested = suggestedSub(category, sample);
  const choices = subs.map((s) => ({
    label: s.title,
    current: s.id === current,
    suggested: s.title === suggested && s.id !== current,
    action: postHref(page, '/prototype/categories/payee-sub', { category, payee, sub: s.id }),
  }));
  if (suggested && !subs.some((s) => s.title === suggested))
    choices.push({ label: suggested, current: false, suggested: true, action: postHref(page, '/prototype/categories/payee-sub', { category, payee, title: suggested }) });
  choices.push({ label: 'Без подкатегории', current: current === null, suggested: false, action: postHref(page, '/prototype/categories/payee-sub', { category, payee, sub: '' }) });
  return [
    choiceGroup({ label: 'Подкатегория', choices }),
    inlineForm({
      label: 'Новая подкатегория',
      action: postHref(page, '/prototype/categories/payee-sub', { category, payee }),
      name: 'title',
      placeholder: 'Например, Лента',
      maxLength: 60,
      submitLabel: 'Добавить',
    }),
  ];
}

// ---- A: unfold a category in its card, hints beside

const HINTS_SHOWN = 5;

function variantA(page: Page): Html {
  const { d, here } = page;
  const r = d.review;
  const p = d.proto;
  const rows: Parameters<typeof amountList>[0]['items'] = [];
  for (const c of r.categories) {
    const color = categoryColor(c.id, c.color);
    const subs = subsOf(p.ordinary, c.id);
    const split = p.hints.find((h) => h.kind === 'split' && h.category === c.id && !h.done);
    const unfolds = subs.length > 0 || split !== undefined;
    const open = p.open === c.id;
    rows.push({
      label: c.title,
      amount: c.perWeek,
      color,
      share: c.perWeek / r.categories[0]!.perWeek,
      note: subs.length ? `${subs.filter((s) => s.id).length} подкат.` : split ? 'можно разбить' : versusUsual(c),
      href: unfolds ? here({ open: open ? null : c.id }) : undefined,
      expanded: unfolds ? open : undefined,
    });
    if (!open) continue;
    if (subs.length) subs.forEach((s, i) => rows.push({ label: s.title, amount: s.amount / r.elapsed, color: s.id ? shade(color, i) : 'var(--soft)', sub: true }));
    else split?.preview.forEach((s) => rows.push({ label: s.title, amount: s.amount / r.elapsed, color, sub: true, proposed: true }));
  }
  const pending = p.hints.filter((h) => !h.done);
  const shown = p.more ? p.hints : [...pending.slice(0, HINTS_SHOWN), ...p.hints.filter((h) => h.done)];
  const hidden = pending.length - pending.slice(0, HINTS_SHOWN).length;
  const hints = shown;
  return panelCard({
    title: 'Обычные траты в неделю',
    amount: r.categories.reduce((s, c) => s + c.perWeek, 0),
    symbol: d.symbol,
    note: 'по категориям и подкатегориям',
    body: grid({
      columns: 2,
      min: 300,
      items: [
        r.categories.length ? amountList({ label: 'Обычные траты по категориям в неделю', items: rows }) : emptyState({ text: 'Трат с категорией в неделях нет.' }),
        hints.length
          ? stack({
              gap: 10,
              items: [
                listHeading({ title: 'Подсказки', count: pending.length }),
                suggestionList({ label: 'Подсказки по категориям', items: hintItems(page, hints) }),
                hidden > 0 && !p.more ? segmentedLinks({ label: 'Ещё подсказки', items: [{ label: `Ещё ${hidden}`, href: here({ more: '1' }) }] }) : null,
              ].filter((b): b is Html => b !== null),
            })
          : emptyState({ text: 'Подсказок нет.' }),
      ],
    }),
  });
}

// ---- B: the weeks as a map of tiles, a tile open on the side

interface Tile {
  id: string;
  label: string;
  amount: number;
  color: string;
  hatched: boolean;
  kind: ToCheck | null;
  category: TagId | null;
  spends: Operation[];
  items: Array<{ id: string; label: string; amount: number; spends: Operation[]; sub: string | null; payee: string | null }>;
  /** Every item, the folded ones too. */
  allItems: Tile['items'];
}

/** At most ITEMS_SHOWN items of a tile, the rest together. */
const ITEMS_SHOWN = 7;

function fold(id: string, items: Tile['items']): Tile['items'] {
  if (items.length <= ITEMS_SHOWN) return items;
  const rest = items.slice(ITEMS_SHOWN - 1);
  const spends = rest.flatMap((i) => i.spends);
  return [...items.slice(0, ITEMS_SHOWN - 1), { id: `${id}:rest`, label: `Ещё ${rest.length}`, amount: spends.reduce((s, o) => s + o.amount, 0), spends, sub: null, payee: null }];
}

function tilesOf(page: Page): Tile[] {
  const { d } = page;
  const r = d.review;
  const tiles: Tile[] = [];
  const byCategory = new Map<TagId, Operation[]>();
  for (const o of d.proto.ordinary) byCategory.set(o.category!.id, [...(byCategory.get(o.category!.id) ?? []), o]);
  for (const [id, spends] of byCategory) {
    const c = spends[0]!.category!;
    const subs = subsOf(spends, id);
    const items = subs.length
      ? subs.map((s) => ({ id: `cat:${id}:sub:${s.id ?? 'none'}`, label: s.title, amount: s.amount, spends: spends.filter((o) => (subOf(o)?.id ?? null) === s.id), sub: s.id, payee: null }))
      : byPayee(spends).map((g) => ({ id: `cat:${id}:payee:${g.key}`, label: g.payee, amount: g.amount, spends: g.spends, sub: null, payee: g.key }));
    tiles.push({ id: `cat:${id}`, label: c.title, amount: spends.reduce((s, o) => s + o.amount, 0), color: categoryColor(c.id, c.color), hatched: false, kind: null, category: id, spends, items: fold(`cat:${id}`, items), allItems: items });
  }
  for (const kind of ['person', 'self', 'untitled'] as const) {
    const spends = r.toCheck.filter((e) => e.kind === kind).map((e) => e.operation);
    if (!spends.length) continue;
    const items =
      kind === 'self'
        ? [
            { id: 'check:self:marketplace', label: 'Похоже на Ozon и WB', amount: 0, spends: spends.filter((o) => transferHint(o, d.regular) === 'marketplace'), sub: null, payee: null },
            { id: 'check:self:round', label: 'Круглые суммы', amount: 0, spends: spends.filter((o) => transferHint(o, d.regular) !== 'marketplace'), sub: null, payee: null },
          ]
            .map((i) => ({ ...i, amount: i.spends.reduce((s, o) => s + o.amount, 0) }))
            .filter((i) => i.spends.length)
        : byPayee(spends).map((g) => ({ id: `check:${kind}:${g.key}`, label: g.payee, amount: g.amount, spends: g.spends, sub: null, payee: g.key }));
    tiles.push({ id: `check:${kind}`, label: TO_CHECK_ROWS[kind].title, amount: sumOf(r.toCheck.filter((e) => e.kind === kind)), color: toneColor('gray'), hatched: true, kind, category: null, spends, items: fold(`check:${kind}`, items), allItems: items });
  }
  return tiles;
}

function variantB(page: Page): Html {
  const { d, here } = page;
  const tiles = tilesOf(page);
  const total = tiles.reduce((s, t) => s + t.amount, 0);
  const unsorted = tiles.filter((t) => t.hatched).reduce((s, t) => s + t.amount, 0);
  // A dot goes where a suggestion would change something: spends a hint moves, and a category Claude would split.
  const pending = d.proto.hints.filter((h) => !h.done);
  const moved = new Set(pending.flatMap((h) => h.spends));
  const splits = new Set(pending.filter((h) => h.kind === 'split').map((h) => h.category));
  const hinted = (spends: Operation[]) => spends.some((o) => moved.has(o.id));
  return panelCard({
    title: 'Из чего недели',
    amount: total,
    symbol: d.symbol,
    note: `${unsorted > 0 ? `не разобрано ${money(unsorted, d.symbol)}, ${percent(unsorted / total)}` : 'всё разобрано'}${moved.size || splits.size ? ' · точка и сиреневая рамка — есть подсказка' : ''}`,
    body: categoryMap({
      label: 'Траты недель по категориям',
      symbol: d.symbol,
      groups: tiles.map((t) => ({
        label: t.label,
        amount: t.amount,
        color: t.color,
        hatched: t.hatched,
        href: here({ tile: d.proto.tile === t.id ? null : t.id }),
        active: d.proto.tile === t.id,
        hinted: (t.category !== null && splits.has(t.category)) || hinted(t.spends),
        items: t.items.map((i) => ({ label: i.label, amount: i.amount, href: here({ tile: d.proto.tile === i.id ? null : i.id }), active: d.proto.tile === i.id, hinted: hinted(i.spends) })),
      })),
    }),
  });
}

/** The side of B with a tile open: what it holds, the hints about it, and where to move its spends. */
function inspectorB(page: Page): Html[] {
  const { d, href, here } = page;
  const tiles = tilesOf(page);
  const tileId = d.proto.tile!;
  const tile = tiles.find((t) => tileId === t.id || tileId.startsWith(`${t.id}:`));
  const back = toolbar({ items: [segmentedLinks({ label: 'Назад', items: [{ label: '← К выводам', href: here({ tile: null }) }] })] });
  if (!tile) return [back, emptyState({ text: 'Здесь уже ничего нет: траты разнесены.' })];
  const item = tile.items.find((i) => i.id === tileId) ?? tile.allItems.find((i) => i.id === tileId);
  const spends = item?.spends ?? tile.spends;
  const amount = spends.reduce((s, o) => s + o.amount, 0);
  const s = d.symbol;
  const blocks: Html[] = [
    back,
    figureCard({ label: item ? `${tile.label} › ${item.label}` : tile.label, amount, symbol: s, note: `${count(spends.length, EXPENSES)}, ${percent(amount / Math.max(1, d.review.inWeeks))} недель` }),
  ];
  const ids = new Set(spends.map((o) => o.id));
  // A whole tile shows the hints about its category; one payee or group only those about its own spends.
  const hints = d.proto.hints.filter(
    (h) => !h.done && (h.spends.some((id) => ids.has(id)) || (!item && tile.category !== null && h.category === tile.category && h.kind !== 'hide')),
  );
  if (hints.length) blocks.push(suggestionList({ label: 'Подсказки', items: hintItems(page, hints) }));

  if (tile.category !== null) {
    const category = tile.category;
    if (item?.payee) {
      blocks.push(stack({ gap: 12, items: subChoices(page, category, item.payee, item.spends[0]!) }));
    } else if (item?.sub !== undefined && item.sub !== null) {
      blocks.push(section({ title: 'Получатели', body: amountList({ label: 'Получатели', symbol: s, items: byPayee(spends).map((g) => ({ label: g.payee, amount: g.amount, note: `${g.spends.length} шт.` })) }) }));
    } else {
      const subs = subsOf(spends, category);
      blocks.push(
        section({
          title: subs.length ? 'Подкатегории' : 'Получатели',
          body: amountList({
            label: 'Из чего категория',
            symbol: s,
            items: subs.length
              ? subs.map((x, i) => ({ label: x.title, amount: x.amount, color: x.id ? shade(tile.color, i) : 'var(--soft)', note: `${x.count} шт.`, href: here({ tile: `${tile.id}:sub:${x.id ?? 'none'}` }) }))
              : byPayee(spends)
                  .slice(0, 12)
                  .map((g) => ({ label: g.payee, amount: g.amount, note: `${g.spends.length} шт.`, href: here({ tile: `${tile.id}:payee:${g.key}` }) })),
          }),
        }),
      );
    }
    return blocks;
  }

  // An unsorted tile: its payees, or one of them with where to move it.
  if (item) {
    const learned = d.proto.hints.find((h) => h.spends.some((id) => ids.has(id)) && h.category);
    const byPayeeRule = item.payee !== null && tile.kind !== 'self';
    const action = byPayeeRule ? href('/prototype/categories/payee-category') : href('/prototype/categories/spends-category');
    const params: Record<string, string> = byPayeeRule ? { payee: item.payee! } : { spends: spends.map((o) => o.id).join(',') };
    blocks.push(
      choiceGroup({
        label: byPayeeRule ? `Куда относить ${item.label} — и в другие месяцы` : 'Куда отнести эти траты',
        choices: categoryChoices(page, action, params, learned?.category ?? null),
      }),
      section({
        title: 'Траты',
        body: amountList({ label: 'Траты', symbol: s, items: spends.map((o) => ({ label: `${dayMonth(o.date)} · ${markingTitle(o)}`, amount: o.amount })) }),
      }),
    );
    return blocks;
  }
  blocks.push(
    section({
      title: tile.kind === 'self' ? 'По сумме' : 'Кому',
      body: amountList({ label: 'Кому', symbol: s, items: tile.items.map((i) => ({ label: i.label, amount: i.amount, note: `${i.spends.length} шт.`, href: here({ tile: i.id }) })) }),
    }),
  );
  return blocks;
}

// ---- C: a category opens on its own page, payees go into subcategories there

function variantC(page: Page): Html {
  const { d, href } = page;
  const r = d.review;
  const unsorted = sumOf(r.toCheck);
  const items: Parameters<typeof amountList>[0]['items'] = r.categories.map((c) => {
    const subs = subsOf(d.proto.ordinary, c.id);
    const sorted = subs.filter((x) => x.id).reduce((s, x) => s + x.amount, 0);
    const total = subs.reduce((s, x) => s + x.amount, 0);
    return {
      label: c.title,
      amount: c.perWeek,
      color: categoryColor(c.id, c.color),
      share: c.perWeek / r.categories[0]!.perWeek,
      note: subs.length ? `разложено ${percent(sorted / total)}` : 'без подкатегорий',
      href: href('/review/categories', { month: r.month, cat: c.id }),
    };
  });
  if (unsorted > 0) items.push({ label: 'Не разобрано', amount: unsorted / r.elapsed, icon: 'tag', tone: 'gray', note: count(r.toCheck.length, EXPENSES), href: href('/review/categories', { month: r.month, cat: 'none' }) });
  return panelCard({
    title: 'Категории в неделю',
    amount: r.categories.reduce((s, c) => s + c.perWeek, 0),
    symbol: d.symbol,
    note: `при плане ${money(WEEK_LIMIT, d.symbol)}`,
    href: href('/review/categories', { month: r.month }),
    body: amountList({ label: 'Категории в неделю', items }),
  });
}

/** /review/categories: one category of the month by payee, or what is not sorted yet; the set of categories aside. */
export function renderCategoriesPage(d: ReviewData, href: Href): Html {
  const r = d.review;
  const p = d.proto;
  const s = d.symbol;
  const present = r.categories.map((c) => c.id);
  const current = p.cat === 'none' || (p.cat && present.includes(p.cat)) ? p.cat : (present[0] ?? 'none');
  const here: Page['here'] = (changes) => href('/review/categories', { month: r.month, cat: current, ...changes });
  const page: Page = { d, href, here };
  const category = r.categories.find((c) => c.id === current);
  const tabs = segmentedLinks({
    label: 'Категория',
    items: [
      ...r.categories.map((c) => ({ label: c.title, href: href('/review/categories', { month: r.month, cat: c.id }), active: c.id === current, count: p.ordinary.filter((o) => o.category?.id === c.id).length })),
      ...(r.toCheck.length ? [{ label: 'Не разобрано', href: href('/review/categories', { month: r.month, cat: 'none' }), active: current === 'none', count: r.toCheck.length }] : []),
    ],
  });

  let content: Html[];
  if (category) {
    const spends = p.ordinary.filter((o) => o.category?.id === category.id);
    const color = categoryColor(category.id, category.color);
    const subs = subsOf(spends, category.id);
    const monthAmount = spends.reduce((t, o) => t + o.amount, 0);
    const split = p.hints.find((h) => h.kind === 'split' && h.category === category.id && !h.done);
    const groups = byPayee(spends);
    content = [
      pageIntro({
        title: category.title,
        text: `${money(monthAmount, s)} за месяц, ${money(category.perWeek, s)} в неделю. Подкатегорию получает получатель: все его траты в «${category.title}» идут туда, и в другие месяцы тоже.`,
      }),
      subs.length
        ? stack({
            gap: 12,
            items: [
              shareBar({ label: 'Подкатегории', parts: subs.map((x, i) => ({ label: x.title, value: x.amount, color: x.id ? shade(color, i) : '#ECECEA' })) }),
              amountList({ label: 'Подкатегории', symbol: s, items: subs.map((x, i) => ({ label: x.title, amount: x.amount, color: x.id ? shade(color, i) : 'var(--soft)', note: `${x.count} шт.` })) }),
            ],
          })
        : null,
      split ? suggestionList({ label: 'Подсказка', items: hintItems(page, [split]) }) : null,
      section({
        title: 'Получатели',
        body: entryList({
          label: 'Получатели',
          items: groups.map((g) => {
            const key = `payee-${g.key.replace(/[^a-zа-яё0-9]+/gi, '-')}`;
            const open = p.edit === key;
            const sub = subOf(g.spends[0]!);
            const hint = sub ? null : suggestedSub(category.id, g.spends[0]!);
            return entryRow({
              id: key,
              title: g.payee,
              details: [count(g.spends.length, EXPENSES), sub?.title ?? 'без подкатегории', hint ? `Claude: ${hint}` : null].filter(Boolean).join(' · '),
              icon: categoryIcon(category.title),
              color: sub ? shade(color, Math.max(0, p.subs.filter((x) => x.parent === category.id).findIndex((x) => x.id === sub.id))) : toneColor('gray'),
              amount: g.amount,
              symbol: s,
              href: `${here({ edit: open ? null : key })}#${key}`,
              panel: open ? subChoices(page, category.id, g.key, g.spends[0]!) : undefined,
            });
          }),
        }),
      }),
    ].filter((b): b is Html => b !== null);
  } else {
    // What counts in the weeks unsorted: people and other payees by payee, transfers to oneself one by one.
    const rows: Html[] = [];
    const groups = byPayee(r.toCheck.filter((e) => e.kind !== 'self').map((e) => e.operation));
    const self = r.toCheck.filter((e) => e.kind === 'self').map((e) => e.operation);
    for (const g of groups) {
      const key = `payee-${g.key.replace(/[^a-zа-яё0-9]+/gi, '-')}`;
      const open = p.edit === key;
      const learned = p.hints.find((h) => h.category && h.spends.some((id) => g.spends.some((o) => o.id === id)));
      rows.push(
        entryRow({
          id: key,
          title: g.payee,
          details: [count(g.spends.length, EXPENSES), learned ? `${learned.source === 'Claude' ? 'Claude' : 'раньше'}: ${catTitle(p.catalog, learned.category!)}` : null].filter(Boolean).join(' · '),
          icon: 'tag',
          color: toneColor('gray'),
          amount: g.amount,
          symbol: s,
          href: `${here({ edit: open ? null : key })}#${key}`,
          panel: open
            ? [choiceGroup({ label: `Куда относить ${g.payee} — и в другие месяцы`, choices: categoryChoices(page, href('/prototype/categories/payee-category'), { payee: g.key }, learned?.category ?? null) })]
            : undefined,
        }),
      );
    }
    for (const o of self) {
      const key = `spend-${o.id}`;
      const open = p.edit === key;
      const hint = transferHint(o, d.regular);
      rows.push(
        entryRow({
          id: key,
          title: `${o.payee}, ${dayMonth(o.date)}`,
          details: hint === 'marketplace' ? 'перевод себе · похоже на Ozon или WB' : hint ? `перевод себе · сумма «${hint.regular}»` : 'перевод себе · круглая сумма',
          icon: 'card',
          color: toneColor('violet'),
          amount: o.amount,
          symbol: s,
          href: `${here({ edit: open ? null : key })}#${key}`,
          panel: open
            ? [choiceGroup({ label: 'Куда отнести этот перевод', choices: categoryChoices(page, href('/prototype/categories/spends-category'), { spends: o.id }, hint === 'marketplace' ? SHOPPING : null) })]
            : undefined,
        }),
      );
    }
    content = [
      pageIntro({
        title: 'Не разобрано',
        text: `${count(r.toCheck.length, EXPENSES)} на ${money(sumOf(r.toCheck), s)} считаются в неделях без категории. Категорию получает получатель — и в другие месяцы тоже; перевод себе — по одному, банк неизвестен.`,
      }),
      entryList({ label: 'Не разобрано', items: rows }),
    ];
  }

  const body = appShell({
    rail: appRail('review', d.userName, href),
    tabs: monthTabs(monthOf(d.today), r.month, (m) => href('/review/categories', { month: m ?? monthOf(d.today), cat: current })),
    main: [
      topBar({ crumbs: [{ label: `Разбор ${monthName(r.month, 'genitive')}`, icon: 'target' }, { label: 'Категории' }] }),
      toolbar({ items: [segmentedLinks({ label: 'Назад', items: [{ label: '← К разбору', href: href('/review', { month: r.month }) }] }), tabs] }),
      ...content,
    ],
    side: setSide(page),
    wideSide: true,
  });
  return withSwitcher(pageDocument({ title: 'Бюджет: категории месяца', body }), p.variant, (key) => href('/review/categories', { month: r.month, cat: current, variant: key }));
}

/** C's side: the whole set of categories with how much they are used, and hints about the set. */
function setSide(page: Page): Html[] {
  const { d } = page;
  const p = d.proto;
  const since = addDays(`${d.review.month}-01`, -90);
  const used = (id: TagId) => p.all.filter((o) => o.category?.id === id && o.date >= since).length;
  const row = (c: Cat) => {
    const subs = p.subs.filter((x) => x.parent === c.id);
    return { label: c.title, amount: used(c.id), color: c.hidden ? 'var(--soft)' : catColor(c), note: subs.length ? subs.map((x) => x.title).join(', ') : undefined };
  };
  const shown = p.catalog.filter((c) => !c.hidden).sort((a, b) => used(b.id) - used(a.id));
  const hidden = p.catalog.filter((c) => c.hidden);
  const setHints = p.hints.filter((h) => h.kind === 'hide' || h.id === 'move:telecom' || h.id === 'move:travel');
  return [
    topBar({ crumbs: [{ label: 'Набор категорий' }] }),
    setHints.length ? suggestionList({ label: 'Подсказки по набору', items: hintItems(page, setHints) }) : null,
    section({ title: 'Трат за три месяца', body: amountList({ label: 'Категории', items: shown.map(row) }) }),
    hidden.length ? section({ title: 'Скрытые', body: amountList({ label: 'Скрытые категории', items: hidden.map(row) }) }) : null,
  ].filter((b): b is Html => b !== null);
}

// ---- The page

export function renderReviewPrototype(d: ReviewData, href: Href): Html {
  const p = d.proto;
  const here: Page['here'] = (changes) => href('/review', { month: d.review.month, ask: d.ask, open: p.open, tile: p.tile, more: p.more ? '1' : null, ...changes });
  const page: Page = { d, href, here };
  const b = mainBlocks(page);
  let main: Html[];
  let aside = side(page);
  if (p.variant === 'A') {
    main = [b.top, b.intro, b.figures, b.flow, grid({ columns: 2, min: 320, items: [b.weeks, b.check] }), variantA(page), b.regular];
  } else if (p.variant === 'B') {
    main = [b.top, b.intro, b.figures, b.flow, variantB(page), grid({ columns: 2, min: 320, items: [b.weeks, b.regular] })];
    if (p.tile) aside = inspectorB(page);
  } else {
    main = [b.top, b.intro, b.figures, b.flow, grid({ columns: 2, min: 320, items: [b.weeks, variantC(page), b.check, b.regular] })];
  }
  const body = appShell({
    rail: appRail('review', d.userName, href),
    tabs: monthTabs(monthOf(d.today), d.review.month, (m) => href('/review', { month: m ?? monthOf(d.today) })),
    main,
    side: aside,
    wideSide: true,
  });
  return withSwitcher(pageDocument({ title: 'Бюджет: разбор месяца', body }), p.variant, (key) => href('/review', { month: d.review.month, variant: key }));
}

// ---- The switcher

function withSwitcher(document: Html, current: VariantKey, link: (key: VariantKey) => string): Html {
  const index = VARIANTS.findIndex((v) => v.key === current);
  const prev = link(VARIANTS[(index - 1 + VARIANTS.length) % VARIANTS.length]!.key);
  const next = link(VARIANTS[(index + 1) % VARIANTS.length]!.key);
  const variant = VARIANTS[index]!;
  const bar = `
<div id="proto-switcher" role="toolbar" aria-label="Варианты прототипа">
  <a href="${prev}" aria-label="Предыдущий вариант" data-dir="prev">‹</a>
  <span><b>${variant.key}</b> ${variant.name} <i>${index + 1}/${VARIANTS.length}</i></span>
  <a href="${next}" aria-label="Следующий вариант" data-dir="next">›</a>
  <form method="post" action="/prototype/categories/reset"><button type="submit" title="Забыть всё, что сделано в прототипе">сброс</button></form>
</div>
<script>
  addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select, [contenteditable]')) return;
    const dir = e.key === 'ArrowLeft' ? 'prev' : e.key === 'ArrowRight' ? 'next' : null;
    if (dir) location.href = document.querySelector('#proto-switcher [data-dir="' + dir + '"]').href;
  });
</script>
<style>
  #proto-switcher { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 2147483647; display: flex; align-items: center; gap: 4px;
    padding: 5px; border-radius: 999px; background: #1F4BFF; color: #fff; font: 500 13px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    box-shadow: 0 10px 30px -8px rgb(31 75 255 / .6), 0 0 0 3px rgb(255 255 255 / .9); }
  #proto-switcher a { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 999px; background: rgb(255 255 255 / .16); color: #fff; font-size: 18px; }
  #proto-switcher a:hover { background: rgb(255 255 255 / .28); }
  #proto-switcher span { padding: 0 10px; white-space: nowrap; }
  #proto-switcher b { display: inline-block; padding: 3px 6px; margin-right: 4px; border-radius: 6px; background: #fff; color: #1F4BFF; }
  #proto-switcher i { font-style: normal; opacity: .7; }
  #proto-switcher form { display: contents; }
  #proto-switcher button { height: 30px; padding: 0 10px; border-radius: 999px; background: rgb(255 255 255 / .16); color: #fff; font: inherit; font-size: 11px; }
  #proto-switcher button:hover { background: rgb(255 255 255 / .28); }
</style>`;
  return new Html(document.toString().replace('</body>', `${bar}\n</body>`));
}
