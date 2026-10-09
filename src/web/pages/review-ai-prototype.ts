// PROTOTYPE (throwaway, branch prototype/review-ai): what Claude does on the month review. Three variants of /review,
// switched by ?variant= and a floating bar, show one answer Claude wrote in a Claude Code session ("wizard of Oz"),
// review-ai.prototype.json, read again on every request so it can be rewritten while the server runs:
// - A «Советчик»: the side is Claude's — the month in words, findings, questions, hints and what could be spared; all by click.
// - B «Разметчик»: Claude has already marked the expenses and split the categories; the main column lists what it did, each
//   with «Не так», and asks what it could not tell; the side stays the rule assistant.
// - C «Письмо»: the main column opens with Claude's letter about the month, its questions and hints inside; the side only
//   answers the four questions.
// What is accepted, turned down or answered lives in memory (`state`) and is laid over the saved marking before the review
// is worked out, so settings.db stays as it is.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { categoryCatalog, NO_SUBCATEGORIES, type Subcategory } from '../../categories.ts';
import { monthOf } from '../../dates.ts';
import { shopKey } from '../../payees.ts';
import type { Envelope } from '../../week.ts';
import type { DateString, EntityCollections, TagId } from '../../zenmoney/types.ts';
import { pageDocument } from '../document.ts';
import { capitalize, dayMonth, money, monthName } from '../format.ts';
import { Html } from '../html.ts';
import type { IconName } from '../icons.ts';
import type { Tone } from '../tones.ts';
import { assistantAnswer, assistantHero, insightList, suggestionList } from '../widgets/assistant.ts';
import { listHeading, pageIntro } from '../widgets/basics.ts';
import { panelCard } from '../widgets/cards.ts';
import { amountList } from '../widgets/operations.ts';
import { appShell, screenOnly, topBar } from '../widgets/shell.ts';
import { appRail, monthTabs, type Href } from './chrome.ts';
import type { SavedBudget } from './dashboard.ts';
import { count, hintItem, loadReview, main, opened, QUESTIONS, side, tileSide, type Page, type Question, type ReviewData } from './review.ts';

const AI_PATH = fileURLToPath(new URL('./review-ai.prototype.json', import.meta.url));

interface Choice {
  label: string;
  category?: string;
  subcategory?: string;
  envelope?: Envelope;
}

interface Ai {
  month: string;
  madeAt: string;
  story: string[];
  findings: Array<{ tone: Tone; icon: IconName; title: string; text: string; tile?: string }>;
  marking: Array<{ id: string; title: string; expenses: string[]; category: string; subcategory?: string; why: string }>;
  questions: Array<{ id: string; title: string; text: string; expenses: string[]; options: Choice[] }>;
  splits: Array<{ id: string; category: string; why: string; subs: Array<{ title: string; match?: string; person?: boolean }> }>;
  avoidable: Array<{ id: string; title: string; text: string; amount: number }>;
  answers: Record<Question, string[]>;
}

function readAi(): Ai {
  return JSON.parse(readFileSync(AI_PATH, 'utf8')) as Ai;
}

export const VARIANTS = [
  { key: 'A', name: 'Советчик' },
  { key: 'B', name: 'Разметчик' },
  { key: 'C', name: 'Письмо' },
] as const;
export type VariantKey = (typeof VARIANTS)[number]['key'];

export function parseVariant(value: string | null): VariantKey {
  return VARIANTS.find((v) => v.key === value)?.key ?? 'A';
}

/** What was done with Claude's word, by its id: marking and splits accepted or turned down, questions answered. */
const state = {
  accepted: new Set<string>(),
  declined: new Set<string>(),
  answers: new Map<string, number>(),
};

/** A form of the prototype, /review/ai/<accept|decline|undo|answer|reset>; false when there is no such form. */
export function submitAi(path: string, form: URLSearchParams): boolean {
  const id = form.get('id') ?? '';
  switch (path) {
    case '/review/ai/accept':
      state.declined.delete(id);
      state.accepted.add(id);
      return true;
    case '/review/ai/decline':
      state.accepted.delete(id);
      state.declined.add(id);
      return true;
    case '/review/ai/undo':
      state.accepted.delete(id);
      state.declined.delete(id);
      state.answers.delete(id);
      return true;
    case '/review/ai/answer':
      state.answers.set(id, Number(form.get('option') ?? 0));
      return true;
    case '/review/ai/reset':
      state.accepted.clear();
      state.declined.clear();
      state.answers.clear();
      return true;
  }
  return false;
}

/** In B Claude's word is applied unless turned down; in A and C only once accepted. */
function applies(variant: VariantKey, id: string): boolean {
  return variant === 'B' ? !state.declined.has(id) : state.accepted.has(id);
}

const PERSON = /^[А-ЯЁ][а-яё]+ [А-ЯЁ]\.$/;

/** Full ZenMoney ids of the expenses Claude named by their first characters. */
function resolve(data: EntityCollections, prefixes: string[]): string[] {
  const ids = (data.transaction ?? []).map((t) => t.id);
  return prefixes.flatMap((p) => ids.filter((id) => id.startsWith(p)));
}

/** The saved marking with what of Claude's word applies laid over it. */
function overlay(data: EntityCollections, saved: SavedBudget, ai: Ai, variant: VariantKey, options: Parameters<typeof loadReview>[2]): SavedBudget {
  const catalog = categoryCatalog(data.tag ?? [], saved.categories);
  const categoryId = (title: string) => catalog.find((c) => c.title === title)?.id;
  const categorizations = new Map(saved.categorizations);
  const marks = new Map(saved.marks);
  const setup = saved.subcategories ?? NO_SUBCATEGORIES;
  const subcategories: Subcategory[] = [...setup.subcategories];
  const shops = new Map([...setup.shops].map(([c, m]) => [c, new Map(m)]));
  const spending = new Map(setup.spending);
  let lastId = 0;
  const sub = (category: TagId, title: string) => {
    const found = subcategories.find((s) => s.category === category && s.title.toLocaleLowerCase('ru') === title.toLocaleLowerCase('ru'));
    if (found) return found;
    const made = { id: --lastId, category, title };
    subcategories.push(made);
    return made;
  };
  const put = (ids: string[], choice: Omit<Choice, 'label'>) => {
    const category = choice.category ? categoryId(choice.category) : undefined;
    for (const id of ids) {
      if (category) categorizations.set(id, { tag: category });
      if (category && choice.subcategory) spending.set(id, sub(category, choice.subcategory).id);
      if (choice.envelope === 'week') marks.delete(id);
      else if (choice.envelope) marks.set(id, choice.envelope);
    }
  };
  for (const m of ai.marking) if (applies(variant, m.id)) put(resolve(data, m.expenses), m);
  for (const q of ai.questions) {
    const answer = state.answers.get(q.id);
    if (answer !== undefined && q.options[answer]) put(resolve(data, q.expenses), q.options[answer]);
  }
  const marked: SavedBudget = { ...saved, categorizations, marks, subcategories: { subcategories, shops, spending } };
  // Splits go by the categories the expenses are in once marked, so the review is worked out once more for them.
  const splits = ai.splits.filter((s) => applies(variant, s.id));
  if (!splits.length) return marked;
  const review = loadReview(data, marked, options).review;
  for (const split of splits) {
    const category = categoryId(split.category);
    if (!category) continue;
    const ofShops = shops.get(category) ?? new Map<string, number>();
    shops.set(category, ofShops);
    for (const { operation: o } of review.expenses) {
      if (o.category?.id !== category || spending.has(o.id)) continue;
      const text = `${o.payee} ${o.comment ?? ''}`;
      const person = PERSON.test(o.payee);
      const into =
        split.subs.find((s) => (s.match && new RegExp(s.match, 'i').test(text)) || (s.person && person)) ?? split.subs.find((s) => !s.match && !s.person);
      if (!into) continue;
      const target = sub(category, into.title);
      if (person) spending.set(o.id, target.id);
      else if (!ofShops.has(shopKey(o.payee))) ofShops.set(shopKey(o.payee), target.id);
    }
  }
  return marked;
}

export interface AiReview {
  d: ReviewData;
  ai: Ai;
  variant: VariantKey;
  /** Expense ids of each piece of Claude's word, by its id. */
  ids: Map<string, string[]>;
  story: boolean;
}

export function loadAiReview(
  data: EntityCollections,
  saved: SavedBudget,
  options: Parameters<typeof loadReview>[2] & { variant: VariantKey; story?: string | null },
): AiReview {
  const ai = readAi();
  const d = loadReview(data, overlay(data, saved, ai, options.variant, options), options);
  const ids = new Map<string, string[]>([...ai.marking, ...ai.questions].map((x) => [x.id, resolve(data, x.expenses)]));
  // What still waits for a word from the user is outlined on the map.
  const waiting = [
    ...ai.marking.filter((m) => !applies(options.variant, m.id) && !state.declined.has(m.id)),
    ...ai.questions.filter((q) => !state.answers.has(q.id)),
  ];
  d.aiHinted = new Set(waiting.flatMap((x) => ids.get(x.id) ?? []));
  return { d, ai, variant: options.variant, ids, story: options.story !== 'hidden' };
}

// ---- Pieces of Claude's word

type Suggestion = Parameters<typeof suggestionList>[0]['items'][number];

function action(href: Href, what: 'accept' | 'decline' | 'undo' | 'answer', id: string, option?: number): string {
  return href(`/review/ai/${what}`, { id, option: option === undefined ? null : String(option) });
}

function amountOf(r: AiReview, id: string): number {
  const ids = new Set(r.ids.get(id) ?? []);
  return r.d.review.expenses.filter((e) => ids.has(e.operation.id)).reduce((s, e) => s + e.operation.amount, 0);
}

/** A marking Claude suggests, with Принять and Не надо; once taken, with Вернуть. */
function markingItem(r: AiReview, href: Href, m: Ai['marking'][number]): Suggestion {
  const n = r.ids.get(m.id)?.length ?? 0;
  const taken = applies(r.variant, m.id);
  return {
    icon: 'sparkles',
    tone: taken ? 'green' : 'violet',
    title: m.title,
    text: `${count(n, ['трата', 'траты', 'трат'])} на ${money(amountOf(r, m.id), r.d.symbol)} ${m.why}`,
    source: taken ? (r.variant === 'B' ? 'Claude разметил сам' : 'принято') : undefined,
    actions: taken
      ? [{ label: r.variant === 'B' ? 'Не так' : 'Вернуть', action: action(href, r.variant === 'B' ? 'decline' : 'undo', m.id) }]
      : [
          { label: 'Принять', action: action(href, r.variant === 'B' ? 'undo' : 'accept', m.id) },
          ...(state.declined.has(m.id) ? [] : [{ label: 'Не надо', action: action(href, 'decline', m.id) }]),
        ],
  };
}

function splitItem(r: AiReview, href: Href, s: Ai['splits'][number]): Suggestion {
  const taken = applies(r.variant, s.id);
  return {
    icon: 'layers',
    tone: taken ? 'green' : 'violet',
    title: `Разбить «${s.category}»: ${s.subs.map((x) => x.title).join(', ')}`,
    text: s.why,
    source: taken ? (r.variant === 'B' ? 'Claude разбил сам' : 'принято') : undefined,
    actions: taken
      ? [{ label: r.variant === 'B' ? 'Не так' : 'Вернуть', action: action(href, r.variant === 'B' ? 'decline' : 'undo', s.id) }]
      : [
          { label: 'Разбить', action: action(href, r.variant === 'B' ? 'undo' : 'accept', s.id) },
          ...(state.declined.has(s.id) ? [] : [{ label: 'Не надо', action: action(href, 'decline', s.id) }]),
        ],
  };
}

/** A question Claude asks, its options as buttons; once answered, the answer with Передумал. */
function questionItem(r: AiReview, href: Href, q: Ai['questions'][number]): Suggestion {
  const answer = state.answers.get(q.id);
  return {
    icon: 'message',
    tone: answer === undefined ? 'yellow' : 'green',
    title: q.title,
    text: answer === undefined ? q.text : `Ответ: ${q.options[answer]?.label}.`,
    actions: answer === undefined ? q.options.map((o, i) => ({ label: o.label, action: action(href, 'answer', q.id, i) })) : [{ label: 'Передумал', action: action(href, 'undo', q.id) }],
  };
}

function findingItems(r: AiReview, here: Page['here']) {
  return r.ai.findings.map((f) => ({ icon: f.icon, tone: f.tone, title: f.title, text: f.text, href: f.tile ? here({ tile: f.tile }) : undefined }));
}

function avoidableItems(r: AiReview) {
  return r.ai.avoidable.map((a) => ({ icon: 'piggy' as IconName, tone: 'teal' as Tone, title: a.title, text: a.text }));
}

function madeAt(r: AiReview): string {
  const at = new Date(r.ai.madeAt);
  return `${dayMonth(r.ai.madeAt.slice(0, 10) as DateString)} в ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}

/** Claude's answer to one of the four questions, as the chips of the hero ask them. */
function aiAnswer(r: AiReview, here: Page['here']): Html | null {
  const ask = r.d.ask;
  if (!ask) return null;
  return assistantAnswer({ question: QUESTIONS.find((q) => q.key === ask)!.label, paragraphs: r.ai.answers[ask], closeHref: here({ ask: null }) });
}

function hero(r: AiReview, here: Page['here'], text: string): Html {
  return assistantHero({
    title: `Claude разобрал ${monthName(r.d.review.month)}`,
    text,
    chips: QUESTIONS.map((q) => ({ label: q.label, icon: q.icon, href: here({ ask: r.d.ask === q.key ? null : q.key }), active: r.d.ask === q.key })),
  });
}

/** Claude's word about the open tile: its marking and questions about the tile's expenses, its split of the tile's category. */
function tileWord(r: AiReview, href: Href): { list: Html; count: number } | null {
  const open = opened(r.d);
  if (!open) return null;
  const expenses = open.expense ? [open.expense] : open.piece ? open.piece.expenses : open.rest ? open.rest.flatMap((p) => p.expenses) : open.part.expenses;
  const ids = new Set(expenses.map((o) => o.id));
  const about = (id: string) => (r.ids.get(id) ?? []).some((x) => ids.has(x));
  const items = [
    ...r.ai.questions.filter((q) => about(q.id)).map((q) => questionItem(r, href, q)),
    ...r.ai.marking.filter((m) => about(m.id)).map((m) => markingItem(r, href, m)),
    ...r.ai.splits.filter((s) => open.part?.category?.title === s.category && !open.piece && !open.expense).map((s) => splitItem(r, href, s)),
  ];
  return items.length ? { list: suggestionList({ label: 'Claude об этом', items }), count: items.length } : null;
}

/** The side with a tile open, Claude's word about it after the tile's figure. */
function withTileWord(r: AiReview, page: Page): Html[] {
  const blocks = tileSide(page);
  const word = tileWord(r, page.href);
  return word ? [...blocks.slice(0, 2), listHeading({ title: 'Claude об этом', count: word.count }), word.list, ...blocks.slice(2)] : blocks;
}

// ---- The variants

export function renderAiReview(r: AiReview, href: Href): Html {
  const d = r.d;
  const here: Page['here'] = (changes) => href('/review', { month: d.review.month, ask: d.ask, tile: d.tile, story: r.story ? null : 'hidden', ...changes });
  const page: Page = { d, href, here };
  const tile = d.tile ? withTileWord(r, page) : null;
  const ownMonth = d.review.month === r.ai.month;
  const sides = { A: sideA, B: sideB, C: sideC };
  const mains = { A: mainA, B: mainB, C: mainC };
  const mainBlocks = ownMonth ? mains[r.variant](r, page, tile) : main(page, tile);
  const sideBlocks = ownMonth ? sides[r.variant](r, page) : side(page);
  const body = appShell({
    rail: appRail('review', d.userName, href),
    tabs: monthTabs(monthOf(d.today), d.review.month, (m) => href('/review', { month: m ?? monthOf(d.today) })),
    main: mainBlocks,
    side: tile ? [screenOnly({ screen: 'wide', items: tile }), screenOnly({ screen: 'narrow', items: sideBlocks })] : sideBlocks,
    wideSide: true,
  });
  return withSwitcher(pageDocument({ title: 'Бюджет: разбор месяца', body }), r.variant, (key) => href('/review', { month: d.review.month, variant: key }));
}

// A — the side is Claude's.

function mainA(_r: AiReview, page: Page, tile: Html[] | null): Html[] {
  return main(page, tile);
}

function sideA(r: AiReview, page: Page): Html[] {
  const { href, here } = page;
  const waiting = r.ai.questions.filter((q) => !state.answers.has(q.id)).length;
  const hints = [...r.ai.marking.map((m) => markingItem(r, href, m)), ...r.ai.splits.map((s) => splitItem(r, href, s)), ...r.d.hints.map((h) => hintItem(page, h))];
  return [
    hero(r, here, `${madeAt(r)} · ${count(r.ai.findings.length, ['вывод', 'вывода', 'выводов'])}, ${count(waiting, ['вопрос', 'вопроса', 'вопросов'])}`),
    aiAnswer(r, here),
    r.story ? assistantAnswer({ question: `${capitalize(monthName(r.d.review.month))} словами`, paragraphs: r.ai.story, closeHref: href('/review', { month: r.d.review.month, ask: r.d.ask, tile: r.d.tile, story: 'hidden' }) }) : null,
    listHeading({ title: 'Главные выводы', count: r.ai.findings.length }),
    insightList({ label: 'Главные выводы', items: findingItems(r, here) }),
    listHeading({ title: 'Claude спрашивает', count: waiting }),
    suggestionList({ label: 'Claude спрашивает', items: r.ai.questions.map((q) => questionItem(r, href, q)) }),
    listHeading({ title: 'Подсказки', count: hints.length }),
    suggestionList({ label: 'Подсказки', items: hints }),
    listHeading({ title: 'Можно было не тратить', count: r.ai.avoidable.length }),
    insightList({ label: 'Можно было не тратить', items: avoidableItems(r) }),
  ].filter((b): b is Html => b !== null);
}

// B — Claude has marked already; the main column says what it did.

function mainB(r: AiReview, page: Page, tile: Html[] | null): Html[] {
  const { href } = page;
  const blocks = main(page, tile);
  const done = r.ai.marking.filter((m) => applies('B', m.id));
  const doneAmount = done.reduce((s, m) => s + amountOf(r, m.id), 0);
  const doneCount = done.reduce((s, m) => s + (r.ids.get(m.id)?.length ?? 0), 0);
  const split = r.ai.splits.filter((s) => applies('B', s.id)).length;
  const asks = r.ai.questions.filter((q) => !state.answers.has(q.id));
  const { here } = page;
  const turnedDown = [...r.ai.marking, ...r.ai.splits].filter((x) => state.declined.has(x.id));
  const did = panelCard({
    title: 'Claude разметил сам',
    amount: doneAmount,
    symbol: r.d.symbol,
    note: `${count(doneCount, ['трата', 'траты', 'трат'])}${split ? `, ${count(split, ['категория разбита', 'категории разбиты', 'категорий разбито'])}` : ''} · ${madeAt(r)} · откройте строку, чтобы поправить`,
    body: amountList({
      label: 'Что Claude разметил',
      symbol: r.d.symbol,
      items: [
        ...done.map((m) => {
          const first = r.ids.get(m.id)?.[0];
          return { label: m.title, amount: amountOf(r, m.id), icon: 'sparkles' as IconName, tone: 'violet' as Tone, href: first ? here({ tile: `spending-${first}` }) : undefined };
        }),
        ...r.ai.splits
          .filter((s) => applies('B', s.id))
          .map((s) => {
            const part = r.d.parts.find((p) => p.category?.title === s.category);
            return {
              label: `«${s.category}» → ${s.subs.map((x) => x.title).join(', ')}`,
              amount: part?.amount ?? 0,
              icon: 'layers' as IconName,
              tone: 'violet' as Tone,
              href: part?.category ? here({ tile: `category-${part.category.id}` }) : undefined,
            };
          }),
      ],
    }),
  });
  const undone = turnedDown.length
    ? panelCard({
        title: 'Вы сказали «Не так»',
        body: suggestionList({
          label: 'Отменённое',
          items: turnedDown.map((x) => ('expenses' in x ? markingItem(r, href, x) : splitItem(r, href, x))),
        }),
      })
    : null;
  const ask = panelCard({
    title: asks.length ? 'Это Claude не понял — решите вы' : 'На вопросы Claude отвечено',
    body: suggestionList({ label: 'Вопросы Claude', items: r.ai.questions.map((q) => questionItem(r, href, q)) }),
  });
  // The questions before the map, what Claude did after it: the map shows that at once.
  return [...blocks.slice(0, 4), ask, blocks[4]!, did, ...(undone ? [undone] : []), ...blocks.slice(5)];
}

function sideB(_r: AiReview, page: Page): Html[] {
  return side(page);
}

// C — the main column opens with Claude's letter.

function mainC(r: AiReview, page: Page, tile: Html[] | null): Html[] {
  const { href, here } = page;
  const blocks = main(page, tile);
  const letter = [
    assistantAnswer({ question: 'Коротко', paragraphs: r.ai.story }),
    assistantAnswer({
      question: 'Что раздуло недели',
      paragraphs: r.ai.answers.overspend,
      links: r.ai.findings.filter((f) => f.tile).map((f) => ({ label: f.title, href: here({ tile: f.tile }) })),
    }),
    panelCard({ title: 'Спрошу у вас', body: suggestionList({ label: 'Вопросы Claude', items: r.ai.questions.map((q) => questionItem(r, href, q)) }) }),
    panelCard({
      title: 'Поправил бы в разметке и категориях',
      body: suggestionList({ label: 'Подсказки Claude', items: [...r.ai.marking.map((m) => markingItem(r, href, m)), ...r.ai.splits.map((s) => splitItem(r, href, s))] }),
    }),
    panelCard({
      title: 'Можно было не тратить',
      amount: r.ai.avoidable.reduce((s, a) => s + a.amount, 0),
      symbol: r.d.symbol,
      body: insightList({ label: 'Можно было не тратить', items: avoidableItems(r) }),
    }),
  ];
  return [
    blocks[0]!,
    pageIntro({ title: `Разбор ${monthName(r.d.review.month, 'genitive')}`, text: `Claude разобрал месяц ${madeAt(r)}. Цифры и карта — под письмом.` }),
    ...letter,
    ...blocks.slice(2),
  ];
}

function sideC(r: AiReview, page: Page): Html[] {
  const { here } = page;
  return [hero(r, here, 'Спросите, и я отвечу по сентябрю.'), aiAnswer(r, here)].filter((b): b is Html => b !== null);
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
  <form method="post" action="/review/ai/reset"><button type="submit" title="Забыть всё, что сделано в прототипе">сброс</button></form>
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
