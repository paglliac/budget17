// Stories: every widget in its typical states, shown on /storyboard.
// A new widget gets its stories here; test/storyboard.test.ts fails while any widget has none.

import { Html } from './html.ts';
import { accountList, balanceTotal } from './widgets/accounts.ts';
import {
  avatar,
  badge,
  button,
  chip,
  emptyState,
  footnote,
  iconBadge,
  pageIntro,
  progressBar,
  section,
  shareBar,
} from './widgets/basics.ts';
import { monthCalendar } from './widgets/calendar.ts';
import { categoryTile, paymentCard, statCard } from './widgets/cards.ts';
import { appShell, grid, rail, tabs, topBar } from './widgets/shell.ts';

export interface Story {
  name: string;
  /** Props as passed to the widget, shown as code under the story. */
  props: unknown;
  /** Width of the story frame in pixels; the full column when omitted. */
  width?: number;
  /** What the widget sits on: a panel, as most widgets do, or the page, as the shell does. */
  surface?: 'panel' | 'page';
  render(): Html;
}

export interface WidgetDoc {
  /** The widget function's name, as it is called in code. */
  name: string;
  group: string;
  description: string;
  widget: (props: never) => Html;
  stories: Story[];
}

export const GROUPS = ['Каркас', 'Основа', 'Карточки', 'Календарь', 'Счета'] as const;

function doc<P>(
  widget: (props: P) => Html,
  meta: { group: (typeof GROUPS)[number]; description: string },
  stories: Array<{ name: string; props: P; width?: number; surface?: 'panel' | 'page' }>,
): WidgetDoc {
  return {
    name: widget.name,
    ...meta,
    widget,
    stories: stories.map((s) => ({ ...s, render: () => widget(s.props) })),
  };
}

const TODAY = '2026-10-05';

const cardAccounts = [
  { title: 'Накопительный счёт', subtitle: 'Счёт', balance: 412_000, symbol: '₽', color: 'var(--yellow)' },
  { title: 'Доллары', subtitle: 'Наличные', balance: 1_250, symbol: '$', converted: { amount: 120_500, symbol: '₽' }, color: 'var(--violet)' },
  { title: 'Т-Банк Black', subtitle: 'Карта', balance: 86_412.4, symbol: '₽', color: 'var(--teal)' },
  { title: 'Т-Банк Platinum', subtitle: 'Карта', balance: -18_740, symbol: '₽', color: 'var(--blue)' },
];

const accountChips = new Html(
  [chip({ label: 'Карты', icon: 'card', tone: 'teal', count: 2 }), chip({ label: 'Наличные', icon: 'banknote', tone: 'blue', count: 2 })].join(''),
);

export const WIDGET_DOCS: WidgetDoc[] = [
  doc(
    appShell,
    { group: 'Каркас', description: 'Рамка страницы: рейка слева, вкладки, основная панель и боковая панель справа.' },
    [
      {
        name: 'С боковой панелью',
        surface: 'page',
        props: {
          rail: rail({ groups: [{ title: 'Меню', items: [{ icon: 'home', label: 'Обзор', href: '#', active: true }] }] }),
          tabs: tabs({ label: 'Месяц', items: [{ label: 'Октябрь', href: '#', active: true }, { label: 'Сентябрь', href: '#' }] }),
          main: emptyState({ text: 'Основное содержимое страницы' }),
          side: emptyState({ text: 'Боковая панель' }),
        },
      },
    ],
  ),
  doc(rail, { group: 'Каркас', description: 'Навигация иконками по группам; текущая страница подсвечена.' }, [
    {
      name: 'Меню и профиль',
      width: 90,
      props: {
        groups: [
          {
            title: 'Меню',
            items: [
              { icon: 'home', label: 'Обзор', href: '#', active: true },
              { icon: 'layers', label: 'Виджеты', href: '#' },
            ],
          },
        ],
        footer: { title: 'Профиль', body: avatar({ name: 'Мои финансы' }) },
      },
    },
  ]),
  doc(tabs, { group: 'Каркас', description: 'Вкладки над основной панелью, например месяцы.' }, [
    {
      name: 'Месяцы',
      props: {
        label: 'Месяц',
        items: [
          { label: 'Октябрь', href: '#', icon: 'calendar', active: true },
          { label: 'Сентябрь', href: '#', icon: 'calendar' },
          { label: 'Август', href: '#', icon: 'calendar' },
        ],
      },
    },
  ]),
  doc(topBar, { group: 'Каркас', description: 'Верхняя полоса панели: где вы находитесь и действия справа.' }, [
    { name: 'Хлебные крошки', props: { crumbs: [{ label: 'Бюджет' }, { label: 'Обзор', icon: 'home' }] } },
    { name: 'С действием', width: 340, props: { crumbs: [{ label: 'Счета' }], actions: button({ label: 'Обновить', icon: 'refresh' }) } },
  ]),
  doc(grid, { group: 'Каркас', description: 'Равные колонки, не больше заданного числа; переносятся, когда колонке становится тесно.' }, [
    {
      name: 'Три колонки',
      props: { columns: 3, items: [emptyState({ text: 'Первая' }), emptyState({ text: 'Вторая' }), emptyState({ text: 'Третья' })] },
    },
    {
      name: 'В узкой панели',
      width: 360,
      props: { columns: 3, items: [emptyState({ text: 'Первая' }), emptyState({ text: 'Вторая' }), emptyState({ text: 'Третья' })] },
    },
  ]),

  doc(pageIntro, { group: 'Основа', description: 'Заголовок страницы и одна фраза о том, что сейчас важно.' }, [
    {
      name: 'Приветствие',
      props: { title: 'Добрый день', emoji: '👋', text: 'В октябре вы потратили 80 820 ₽. Это на 14% больше, чем к 5 сентября.' },
    },
  ]),
  doc(section, { group: 'Основа', description: 'Блок страницы с заголовком.' }, [
    { name: 'С содержимым', props: { title: 'Больше всего тратите на', body: emptyState({ text: 'Содержимое блока' }) } },
  ]),
  doc(button, { group: 'Основа', description: 'Главное действие. С action отправляет POST-форму по этому адресу.' }, [
    { width: 160, name: 'С иконкой', props: { label: 'Обновить', icon: 'refresh' } },
    { width: 160, name: 'Только текст', props: { label: 'Сохранить' } },
  ]),
  doc(iconBadge, { group: 'Основа', description: 'Иконка на цветном квадрате: о чём карточка.' }, [
    { width: 80, name: 'Расходы', props: { icon: 'wallet', tone: 'yellow' } },
    { width: 80, name: 'Доходы', props: { icon: 'arrowDownLeft', tone: 'violet' } },
    { width: 80, name: 'Время', props: { icon: 'clock', tone: 'teal' } },
  ]),
  doc(progressBar, { group: 'Основа', description: 'Сколько сделано: от 0 до 1, больше 1 остаётся полной.' }, [
    { width: 260, name: 'Пусто', props: { value: 0, tone: 'blue' } },
    { width: 260, name: 'Начало', props: { value: 0.16, tone: 'teal' } },
    { width: 260, name: 'Половина', props: { value: 0.6, tone: 'yellow' } },
    { width: 260, name: 'Заполнено', props: { value: 1, tone: 'violet' } },
    { width: 260, name: 'Сверх плана', props: { value: 1.25, tone: 'red' } },
  ]),
  doc(shareBar, { group: 'Основа', description: 'Доли целого, например деньги по счетам. Нулевые и отрицательные доли не показываются.' }, [
    {
      name: 'Счета',
      width: 320,
      props: {
        label: 'Доли счетов',
        parts: cardAccounts.map((a) => ({ label: a.title, value: a.converted?.amount ?? a.balance, color: a.color })),
      },
    },
  ]),
  doc(badge, { group: 'Основа', description: 'Короткое значение рядом с заголовком, например сумма.' }, [
    { width: 140, name: 'Нейтральный', props: { text: '−650 ₽' } },
    { width: 140, name: 'С тоном', props: { text: '+142 000 ₽', tone: 'violet' } },
  ]),
  doc(chip, { group: 'Основа', description: 'Метка с рамкой, иконкой и числом, например группа счетов.' }, [
    { width: 160, name: 'С иконкой и числом', props: { label: 'Карты', icon: 'card', tone: 'teal', count: 2 } },
    { width: 160, name: 'Только текст', props: { label: 'Накопления' } },
  ]),
  doc(avatar, { group: 'Основа', description: 'Первая буква имени в круге.' }, [{ width: 80, name: 'Буква', props: { name: 'Мои финансы' } }]),
  doc(emptyState, { group: 'Основа', description: 'Когда показать нечего: почему и что сделать.' }, [
    { name: 'Нет платежей', width: 420, props: { text: 'Плановых платежей нет. Добавьте регулярные платежи в ZenMoney, и они появятся здесь.' } },
  ]),
  doc(footnote, { group: 'Основа', description: 'Тихий текст внизу панели, например откуда данные.' }, [
    { width: 260, name: 'Источник', props: { text: 'Данные из ZenMoney.' } },
  ]),

  doc(statCard, { group: 'Карточки', description: 'Одна цифра месяца и полоска прогресса.' }, [
    {
      name: 'Расходы',
      width: 320,
      props: { icon: 'wallet', tone: 'yellow', title: 'Расходы', label: '80 820 из 135 200 ₽', value: '60%', progress: 0.6 },
    },
    {
      name: 'Перерасход',
      width: 320,
      props: { icon: 'wallet', tone: 'red', title: 'Расходы', label: '168 456 из 135 200 ₽', value: '125%', progress: 1.25 },
    },
    {
      name: 'Со ссылкой',
      width: 320,
      props: {
        icon: 'arrowDownLeft',
        tone: 'violet',
        title: 'Доходы',
        label: 'Получено',
        value: '142 000 ₽',
        progress: 0.68,
        action: { label: 'Операции', href: '#' },
      },
    },
  ]),
  doc(categoryTile, { group: 'Карточки', description: 'Траты в категории в цвете категории. Со ссылкой появляется стрелка.' }, [
    { name: 'Без ссылки', width: 240, props: { icon: 'cart', color: '#4FAE7F', title: 'Продукты', amount: 8_832, symbol: '₽' } },
    { name: 'Со ссылкой', width: 240, props: { icon: 'coffee', color: '#F09A4A', title: 'Кафе и рестораны', amount: 8_691, symbol: '₽', href: '#' } },
    {
      name: 'Без цвета в ZenMoney',
      width: 240,
      props: { icon: 'tag', color: 'var(--gray)', title: 'Без категории', amount: 1_240, symbol: '₽' },
    },
  ]),
  doc(paymentCard, { group: 'Карточки', description: 'Плановая операция и сколько до неё осталось; полоска заполняется за 30 дней.' }, [
    {
      name: 'Платёж',
      width: 240,
      props: { title: 'Т-Мобайл', date: '2026-10-07', today: TODAY, kind: 'expense', amount: 650, symbol: '₽', tone: 'yellow' },
    },
    {
      name: 'Доход',
      width: 240,
      props: { title: 'Аванс', date: '2026-10-20', today: TODAY, kind: 'income', amount: 68_000, symbol: '₽', tone: 'violet' },
    },
    {
      name: 'Перевод сегодня',
      width: 240,
      props: { title: 'Накопительный счёт', date: TODAY, today: TODAY, kind: 'transfer', amount: 30_000, symbol: '₽', tone: 'blue' },
    },
  ]),

  doc(monthCalendar, { group: 'Календарь', description: 'Месяц неделями с понедельника: отмеченные дни, точки событий и легенда.' }, [
    {
      name: 'Текущий месяц',
      width: 360,
      props: {
        month: '2026-10',
        today: TODAY,
        days: [
          { marked: true, dots: ['orange'], title: 'Расходы 61 889 ₽' },
          { marked: true },
          { marked: true },
          { marked: true },
          { marked: true, dots: ['violet'] },
          { dots: ['teal'] },
          { dots: ['teal'] },
        ],
        legend: [
          { tone: 'orange', label: 'Крупные траты' },
          { tone: 'violet', label: 'Доход' },
          { tone: 'teal', label: 'Платёж' },
        ],
      },
    },
    {
      name: 'Прошлый месяц без легенды',
      width: 360,
      props: { month: '2026-09', days: Array.from({ length: 30 }, (_, i) => ({ marked: i % 3 !== 2 })) },
    },
  ]),

  doc(balanceTotal, { group: 'Счета', description: 'Крупная сумма с тихими копейками, пояснение и то, что под ней.' }, [
    { name: 'Сумма', width: 320, props: { amount: 606_472.4, symbol: '₽', note: 'на 5 счетах, которые учитываются в балансе' } },
    { name: 'С чипами', width: 320, props: { amount: 606_472.4, symbol: '₽', note: 'на 5 счетах, которые учитываются в балансе', footer: accountChips } },
  ]),
  doc(accountList, { group: 'Счета', description: 'Счета с балансами; с заголовком список в рамке, для отдельной группы.' }, [
    { name: 'Счета', width: 320, props: { accounts: cardAccounts } },
    {
      name: 'Отдельная группа',
      width: 320,
      props: {
        title: 'Не учитываются в балансе',
        accounts: [{ title: 'Т-Инвестиции', subtitle: 'Счёт', balance: 238_500, symbol: '₽', color: 'var(--pink)' }],
      },
    },
  ]),
];
