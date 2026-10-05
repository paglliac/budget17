// Stories: every widget in its typical states, shown on /storyboard.
// A new widget gets its stories here; test/storyboard.test.ts fails while any widget has none.

import { Html } from './html.ts';
import { ENTRY_ICONS } from './icons.ts';
import { accountList, balanceTotal } from './widgets/accounts.ts';
import {
  avatar,
  badge,
  button,
  chip,
  emptyState,
  field,
  filterTag,
  footnote,
  iconBadge,
  iconPicker,
  pageIntro,
  progressBar,
  searchField,
  section,
  segmentedLinks,
  shareBar,
} from './widgets/basics.ts';
import { monthCalendar } from './widgets/calendar.ts';
import { categoryTile, paymentCard, statCard } from './widgets/cards.ts';
import { entryForm, entryList, entryRow } from './widgets/entries.ts';
import { categoryList, dayGroup, operationRow } from './widgets/operations.ts';
import { appShell, grid, rail, stack, tabs, toolbar, topBar } from './widgets/shell.ts';

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

export const GROUPS = ['Каркас', 'Основа', 'Фильтры', 'Формы', 'Карточки', 'Операции', 'Настройка', 'Календарь', 'Счета'] as const;

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

const kindLinks = segmentedLinks({
  label: 'Вид операций',
  items: [
    { label: 'Все', href: '#', active: true, count: 82 },
    { label: 'Расходы', href: '#', count: 77 },
    { label: 'Доходы', href: '#', count: 2 },
    { label: 'Переводы', href: '#', count: 3 },
  ],
});

const operationRows = [
  operationRow({ title: 'Пятёрочка', details: 'Продукты, Т-Банк Black', icon: 'cart', color: '#4FAE7F', kind: 'expense', amount: 1_247.9, symbol: '₽' }),
  operationRow({ title: 'Яндекс Go', details: 'Транспорт, Т-Банк Black', icon: 'bus', color: '#5B84F0', kind: 'expense', amount: 560, symbol: '₽', hold: true }),
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
  doc(toolbar, { group: 'Каркас', description: 'Элементы управления в одну строку, которая переносится на узком экране, например фильтры над списком.' }, [
    {
      name: 'Фильтры',
      props: {
        items: [
          kindLinks,
          searchField({ action: '#', name: 'q', placeholder: 'Найти операцию' }),
          filterTag({ label: 'Продукты', href: '#', color: '#4FAE7F' }),
        ],
      },
    },
  ]),
  doc(stack, { group: 'Каркас', description: 'Блоки друг под другом с ровным отступом, например дни в ленте.' }, [
    { name: 'Три блока', width: 360, props: { gap: 12, items: [emptyState({ text: 'Первый' }), emptyState({ text: 'Второй' }), emptyState({ text: 'Третий' })] } },
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
    { width: 160, name: 'Отправляет свою форму', props: { label: 'Добавить', submit: true } },
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
    { name: 'Нет платежей', width: 420, props: { text: 'Плановых платежей нет. Добавьте доходы, регулярные траты или плановые платежи в ZenMoney, и они появятся здесь.' } },
  ]),
  doc(footnote, { group: 'Основа', description: 'Тихий текст внизу панели, например откуда данные.' }, [
    { width: 260, name: 'Источник', props: { text: 'Данные из ZenMoney.' } },
  ]),

  doc(segmentedLinks, { group: 'Фильтры', description: 'Взаимоисключающие варианты ссылками, например вид операций; текущий подсвечен.' }, [
    {
      name: 'Вид операций',
      width: 420,
      props: {
        label: 'Вид операций',
        items: [
          { label: 'Все', href: '#', active: true, count: 82 },
          { label: 'Расходы', href: '#', count: 77 },
          { label: 'Доходы', href: '#', count: 2 },
          { label: 'Переводы', href: '#', count: 3 },
        ],
      },
    },
  ]),
  doc(searchField, { group: 'Фильтры', description: 'Поле поиска, отправляет GET-форму; params сохраняют остальные фильтры.' }, [
    { name: 'Пустое', width: 300, props: { action: '#', name: 'q', placeholder: 'Найти операцию' } },
    { name: 'С запросом', width: 300, props: { action: '#', name: 'q', value: 'кофе', placeholder: 'Найти операцию', params: { month: '2026-09' } } },
  ]),
  doc(filterTag, { group: 'Фильтры', description: 'Действующий фильтр; ссылка убирает его.' }, [
    { name: 'Категория', width: 160, props: { label: 'Продукты', href: '#', color: '#4FAE7F' } },
    { name: 'Поиск', width: 160, props: { label: '«кофе»', href: '#' } },
  ]),

  doc(field, { group: 'Формы', description: 'Поле формы с подписью. Без ширины занимает свободное место в строке; ошибка видна под полем.' }, [
    { name: 'Текст', width: 260, props: { label: 'Название', name: 'title', placeholder: 'Например, аренда', required: true } },
    { name: 'Сумма', width: 160, props: { label: 'Сумма, ₽', name: 'amount', type: 'decimal', value: '13 000', width: 130 } },
    { name: 'Число с ошибкой', width: 160, props: { label: 'Число', name: 'day', type: 'integer', min: 1, max: 31, value: '32', width: 84, error: 'От 1 до 31' } },
    { name: 'Дата', width: 190, props: { label: 'Дата окончания', name: 'end', type: 'date', value: '2027-03-20', width: 160 } },
  ]),
  doc(iconPicker, {
    group: 'Формы',
    description: 'Выбор иконки в цвете формы вокруг. Первый вариант, «авто», отправляет пустое значение: иконку подберут сами, например по названию.',
  }, [
    {
      name: 'Своя иконка',
      width: 520,
      props: { label: 'Иконка', name: 'icon', value: 'card', icons: ENTRY_ICONS, auto: { icon: 'phone', label: 'По названию' } },
    },
    {
      name: 'По названию',
      width: 520,
      props: { label: 'Иконка', name: 'icon', value: '', icons: ENTRY_ICONS.slice(0, 6), auto: { icon: 'phone', label: 'По названию' } },
    },
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

  doc(operationRow, {
    group: 'Операции',
    description: 'Одна операция: кто, за что, с какого счёта и сколько. У расхода минус, доход зелёный с плюсом, перевод приглушён.',
  }, [
    { name: 'Расход', width: 520, props: { title: 'Пятёрочка', details: 'Продукты, Т-Банк Black', icon: 'cart', color: '#4FAE7F', kind: 'expense', amount: 1_247.9, symbol: '₽' } },
    {
      name: 'Доход с комментарием',
      width: 520,
      props: { title: 'ООО «Северный ветер»', details: 'Зарплата, Т-Банк Black', icon: 'briefcase', color: '#3FA46A', kind: 'income', amount: 142_000, symbol: '₽', comment: 'Зарплата за сентябрь' },
    },
    {
      name: 'Перевод',
      width: 520,
      props: { title: 'Т-Банк Black → Накопительный счёт', details: 'Т-Банк Black → Накопительный счёт', icon: 'arrows', color: 'var(--gray)', kind: 'transfer', amount: 30_000, symbol: '₽' },
    },
    {
      name: 'В валюте, ещё не проведена',
      width: 520,
      props: { title: 'Steam', details: 'Развлечения, Доллары', icon: 'ticket', color: '#F2C14E', kind: 'expense', amount: 1_252.24, symbol: '₽', original: { amount: 12.99, symbol: '$' }, hold: true },
    },
  ]),
  doc(dayGroup, { group: 'Операции', description: 'Операции одного дня под заголовком с итогом дня.' }, [
    { name: 'Сегодня', width: 560, props: { date: TODAY, today: TODAY, net: { amount: -1_807.9, symbol: '₽' }, rows: operationRows } },
    { name: 'Давно', width: 560, props: { date: '2026-09-12', today: TODAY, rows: operationRows.slice(0, 1) } },
  ]),
  doc(categoryList, { group: 'Операции', description: 'Траты по категориям с долей; категория ведёт к своим операциям, выбранная подсвечена.' }, [
    {
      name: 'С выбранной категорией',
      width: 320,
      props: {
        label: 'Расходы по категориям',
        symbol: '₽',
        items: [
          { title: 'Жильё', icon: 'home', color: '#9479E6', amount: 61_640, share: 0.76, href: '#' },
          { title: 'Продукты', icon: 'cart', color: '#4FAE7F', amount: 8_832, share: 0.11, href: '#', active: true },
          { title: 'Без категории', icon: 'tag', color: 'var(--gray)', amount: 420, share: 0.005, href: '#' },
        ],
      },
    },
  ]),

  doc(entryRow, {
    group: 'Настройка',
    description: 'Запись, которую настраивают: что, когда и сколько. Строка открывает её для правки, кнопки рядом делают частое действие сразу.',
  }, [
    {
      name: 'Регулярная трата',
      width: 520,
      props: { title: 'Офис аренда', details: '25-го числа · через 20 дней', icon: 'home', color: 'var(--violet)', amount: 13_000, symbol: '₽', href: '#' },
    },
    {
      name: 'Доход',
      width: 520,
      props: { title: 'Зарплата', details: 'аванс 20-го, остальное 5-го · через 15 дней', icon: 'briefcase', color: 'var(--teal)', amount: 200_000, symbol: '₽', href: '#' },
    },
    {
      name: 'Покупка с действием',
      width: 520,
      props: {
        title: 'Ботинки Савве',
        details: 'ждёт покупки · обычные',
        icon: 'shirt',
        color: 'var(--blue)',
        amount: 8_000,
        symbol: '₽',
        href: '#',
        actions: [{ label: 'Куплено', action: '#' }],
      },
    },
    {
      name: 'Без правки, с выбором',
      width: 520,
      props: {
        title: 'Александр А.',
        details: '5 октября, Запас · в неделе',
        icon: 'tag',
        color: 'var(--gray)',
        amount: 40_000,
        symbol: '₽',
        actions: [
          { label: 'В дополнительные', action: '#' },
          { label: 'Вне бюджета', action: '#' },
        ],
      },
    },
  ]),
  doc(entryForm, {
    group: 'Настройка',
    description: 'Новая или открытая для правки запись: поля из field, кнопка и скрытые значения. Редкие поля сворачиваются в more. У существующей есть «Удалить» и «Отмена».',
  }, [
    {
      name: 'Новая',
      width: 640,
      props: {
        action: '#',
        submitLabel: 'Добавить',
        icon: 'plus',
        color: 'var(--gray)',
        fields: [
          field({ label: 'Название', name: 'title', placeholder: 'Например, аренда', required: true }),
          field({ label: 'Сумма, ₽', name: 'amount', type: 'decimal', placeholder: '13 000', width: 130, required: true }),
          field({ label: 'Число', name: 'day', type: 'integer', min: 1, max: 31, placeholder: '25', width: 84, required: true }),
        ],
        more: {
          label: 'Даты и иконка',
          fields: [
            field({ label: 'Дата начала', name: 'start', type: 'date', width: 160 }),
            field({ label: 'Дата окончания', name: 'end', type: 'date', width: 160 }),
          ],
        },
      },
    },
    {
      name: 'Правка с ошибкой',
      width: 640,
      props: {
        action: '#',
        submitLabel: 'Сохранить',
        icon: 'book',
        color: 'var(--teal)',
        fields: [
          field({ label: 'Название', name: 'title', value: 'Школа', required: true }),
          field({ label: 'Сумма, ₽', name: 'amount', type: 'decimal', value: 'дорого', width: 130, error: 'Сумма в рублях, например 13 000' }),
          field({ label: 'Число', name: 'day', type: 'integer', value: '30', width: 84 }),
        ],
        deleteAction: '#',
        cancelHref: '#',
      },
    },
    {
      name: 'Правка с раскрытыми настройками',
      width: 640,
      props: {
        action: '#',
        submitLabel: 'Сохранить',
        icon: 'card',
        color: 'var(--orange)',
        fields: [
          field({ label: 'Название', name: 'title', value: 'Кредит', required: true }),
          field({ label: 'Сумма, ₽', name: 'amount', type: 'decimal', value: '9000', width: 130, required: true }),
          field({ label: 'Число', name: 'day', type: 'integer', value: '20', width: 84, required: true }),
        ],
        more: {
          label: 'Даты и иконка',
          open: true,
          fields: [
            field({ label: 'Дата начала', name: 'start', type: 'date', value: '2026-11-01', width: 160 }),
            field({ label: 'Дата окончания', name: 'end', type: 'date', value: '2026-10-01', width: 160, error: 'Раньше даты начала' }),
            iconPicker({ label: 'Иконка', name: 'icon', value: 'card', icons: ENTRY_ICONS, auto: { icon: 'card', label: 'По названию' } }),
          ],
        },
        deleteAction: '#',
        cancelHref: '#',
      },
    },
    {
      name: 'Правка с переносом',
      width: 640,
      props: {
        action: '#',
        submitLabel: 'Сохранить',
        icon: 'gift',
        color: 'var(--violet)',
        fields: [
          field({ label: 'Что', name: 'title', value: 'Подарок Серёге В.', required: true }),
          field({ label: 'Сумма, ₽', name: 'amount', type: 'decimal', value: '5000', width: 130, required: true }),
        ],
        extraActions: [{ label: 'В дополнительные', action: '#' }],
        deleteAction: '#',
        cancelHref: '#',
      },
    },
  ]),
  doc(entryList, { group: 'Настройка', description: 'Записи друг под другом: строки и формы в заданном порядке.' }, [
    {
      name: 'Строки и форма',
      width: 640,
      props: {
        label: 'Регулярные траты',
        items: [
          entryRow({ title: 'Интернет', details: '1-го числа · через 27 дней', icon: 'phone', color: 'var(--orange)', amount: 1_100, symbol: '₽', href: '#' }),
          entryRow({ title: 'Машина', details: '5-го числа · сегодня', icon: 'car', color: 'var(--blue)', amount: 91_000, symbol: '₽', href: '#' }),
          entryForm({
            action: '#',
            submitLabel: 'Добавить',
            icon: 'plus',
            color: 'var(--gray)',
            fields: [field({ label: 'Название', name: 'title' }), field({ label: 'Сумма, ₽', name: 'amount', type: 'decimal', width: 130 })],
          }),
        ],
      },
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
