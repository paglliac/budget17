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
  choiceGroup,
  factList,
  emptyState,
  field,
  filterTag,
  footnote,
  iconBadge,
  iconPicker,
  inlineForm,
  listHeading,
  pageIntro,
  progressBar,
  searchField,
  section,
  segmentedLinks,
  selectField,
  shareBar,
} from './widgets/basics.ts';
import { monthCalendar } from './widgets/calendar.ts';
import { assistantAnswer, assistantHero, insightList } from './widgets/assistant.ts';
import { categoryTile, figureCard, panelCard, paymentCard, statCard } from './widgets/cards.ts';
import { flowChart, weekBars } from './widgets/charts.ts';
import { entryDivider, entryForm, entryList, entryRow } from './widgets/entries.ts';
import { amountList, categoryList, dayGroup, operationRow } from './widgets/operations.ts';
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

export const GROUPS = ['Каркас', 'Основа', 'Фильтры', 'Формы', 'Карточки', 'Графики', 'Операции', 'Ассистент', 'Настройка', 'Календарь', 'Счета'] as const;

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

const sortingGroups = [
  {
    label: 'Регулярные траты',
    options: [
      { value: 'regular-1', label: 'Офис аренда · 13 000 ₽' },
      { value: 'regular-2', label: 'Мастерская аренда · 40 000 ₽' },
    ],
  },
  {
    label: 'Категории',
    options: [
      { value: 'tag-food', label: 'Продукты' },
      { value: 'tag-cafe', label: 'Кафе и рестораны' },
    ],
  },
];

const accountChips = new Html(
  [chip({ label: 'Карты', icon: 'card', tone: 'teal', count: 2 }), chip({ label: 'Наличные', icon: 'banknote', tone: 'blue', count: 2 })].join(''),
);

export const WIDGET_DOCS: WidgetDoc[] = [
  doc(
    appShell,
    {
      group: 'Каркас',
      description: 'Рамка страницы: рейка слева, вкладки, основная панель и боковая панель справа. Широкая боковая панель вмещает свои списки, например план недели.',
    },
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
      {
        name: 'С широкой боковой панелью',
        surface: 'page',
        props: {
          rail: rail({ groups: [{ title: 'Меню', items: [{ icon: 'home', label: 'Обзор', href: '#', active: true }] }] }),
          main: emptyState({ text: 'Траты недели' }),
          side: emptyState({ text: 'Можно потратить и план' }),
          wideSide: true,
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
    { name: 'С бейджем', props: { title: 'Разбор сентября', text: 'Что произошло с деньгами и что стоит поправить.', badge: { text: 'ассистент сделал 6 выводов', tone: 'green' } } },
  ]),
  doc(listHeading, { group: 'Основа', description: 'Заголовок над списком и сколько в нём всего.' }, [
    { name: 'С числом', width: 420, props: { title: 'Главные выводы', count: 6 } },
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
  doc(selectField, {
    group: 'Формы',
    description: 'Выбор из списка с подписью, по группам, если в нём вещи разного рода. С подсказкой и без значения ничего не выбрано.',
  }, [
    {
      name: 'Выбрано',
      width: 420,
      props: { label: 'Александр А. · 5 октября · 40 000 ₽', name: 'target', value: 'regular-2', required: true, groups: sortingGroups },
    },
    {
      name: 'Ничего не выбрано',
      width: 420,
      props: { label: 'Куда отнести', name: 'target', placeholder: 'Категория или регулярная трата', required: true, groups: sortingGroups },
    },
  ]),
  doc(factList, { group: 'Основа', description: 'Сведения о чём-то: подпись и значение, в строку с переносом, например когда и откуда оплачена трата.' }, [
    {
      name: 'Трата',
      width: 520,
      props: {
        label: 'О трате',
        items: [
          { label: 'Когда', value: '5 октября, 23:28' },
          { label: 'Счёт', value: 'Основной' },
          { label: 'В банке', value: 'prostoplatSBP' },
          { label: 'Комментарий', value: 'Оплата штрафа по постановлению 18810542260930190636' },
        ],
      },
    },
  ]),
  doc(choiceGroup, {
    group: 'Формы',
    description: 'Выбор в один клик: каждая кнопка сразу отправляет форму. Текущий вариант выделен, подсказанный отмечен; остальные можно выбрать из списка.',
  }, [
    {
      name: 'Категории с подсказкой',
      width: 520,
      props: {
        label: 'Категория',
        choices: [
          { label: 'Продукты', action: '#', color: '#4FAE7F', suggested: true },
          { label: 'Кафе', action: '#', color: '#EE7B3C' },
          { label: 'Транспорт', action: '#', color: '#5B84F0' },
          { label: 'Дети', action: '#', color: 'var(--violet)' },
        ],
      },
    },
    {
      name: 'Выбрано, со списком остального',
      width: 520,
      props: {
        label: 'Оплата',
        choices: [
          { label: 'Продукты', detail: 'в плане недели · 3 000 ₽', current: true },
          { label: 'Бокс', detail: '3 октября · 25 000 ₽', action: '#' },
        ],
        other: { label: 'Другой платёж', action: '#', name: 'target', placeholder: 'Регулярная трата или покупка', submitLabel: 'Привязать', groups: sortingGroups },
      },
    },
    {
      name: 'Выбирать не из чего',
      width: 320,
      props: { label: 'Категория', choices: [], empty: 'Из ZenMoney: Продукты' },
    },
  ]),
  doc(inlineForm, {
    group: 'Формы',
    description: 'Одно поле со своей кнопкой, например описание траты. Пустое поле тоже отправляется: так описание убирают.',
  }, [
    {
      name: 'Пусто',
      width: 520,
      props: { label: 'Описание', action: '#', name: 'description', placeholder: 'Например, подарок маме', maxLength: 200, submitLabel: 'Сохранить' },
    },
    {
      name: 'С описанием',
      width: 520,
      props: { label: 'Описание', action: '#', name: 'description', value: 'Подарок на день рождения Савелию', maxLength: 200, submitLabel: 'Сохранить' },
    },
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
  doc(figureCard, { group: 'Карточки', description: 'Крупная цифра на карточке: что это, сумма с тихой валютой, пояснение и полоса.' }, [
    { name: 'Только сумма', width: 260, props: { label: 'Доход', amount: 736_821, symbol: '₽' } },
    { name: 'С полосой', width: 260, props: { label: 'Потрачено', amount: 645_370, symbol: '₽', note: '88% от дохода', progress: { value: 0.88, tone: 'violet' } } },
  ]),
  doc(panelCard, { group: 'Карточки', description: 'Блок страницы на карточке: заголовок с бейджем, крупная сумма с пояснением и ссылка дальше.' }, [
    {
      name: 'С бейджем и ссылкой',
      width: 480,
      props: { title: 'Недельные траты', amount: 488_432, symbol: '₽', note: 'при плане 225 000 ₽', badge: { text: '+263 432 ₽', tone: 'red' }, href: '#', body: emptyState({ text: 'Содержимое блока' }) },
    },
    { name: 'Только заголовок', width: 480, props: { title: 'Куда ушли деньги', body: emptyState({ text: 'Содержимое блока' }) } },
  ]),
  doc(flowChart, { group: 'Графики', description: 'Куда ушли деньги: источник слева растекается на части справа, у каждой сумма и доля источника.' }, [
    {
      name: 'Доход месяца',
      props: {
        label: 'Куда ушёл доход',
        symbol: '₽',
        source: { label: 'доход', amount: 736_821 },
        parts: [
          { label: 'Недели', amount: 488_432, color: 'var(--yellow)' },
          { label: 'Регулярные', amount: 154_448, color: 'var(--gray)' },
          { label: 'Дополнительные', amount: 2_490, color: 'var(--violet)' },
          { label: 'Осталось', amount: 91_451, color: 'var(--teal)' },
        ],
      },
    },
  ]),
  doc(weekBars, { group: 'Графики', description: 'Траты недель столбиками, лимит недели — пунктир поперёк, выше него столбик темнее; будущая неделя пустая.' }, [
    {
      name: 'Месяц с перерасходом',
      width: 480,
      props: {
        label: 'Траты недель',
        bars: [
          { label: 'Нед. 1', value: 91_301, limit: 45_000, href: '#' },
          { label: 'Нед. 2', value: 30_253, limit: 45_000, href: '#' },
          { label: 'Нед. 3', value: 179_519, limit: 45_000, href: '#' },
          { label: 'Нед. 4', value: 0, limit: 30_000, ahead: true },
        ],
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
    description: 'Одна операция: кто, за что, с какого счёта и сколько. У расхода минус, доход зелёный с плюсом, перевод приглушён. Расход открывается на месте для разметки. Точка перед суммой говорит, где расход считается; в списке одних расходов минус можно убрать.',
  }, [
    { name: 'Расход', width: 520, props: { title: 'Пятёрочка', details: 'Продукты, Т-Банк Black', icon: 'cart', color: '#4FAE7F', kind: 'expense', amount: 1_247.9, symbol: '₽' } },
    {
      name: 'С отметкой, где считается',
      width: 520,
      props: {
        title: 'Коммуналка Московский 18к5',
        details: 'Основной · prostoplatSBP',
        icon: 'repeat',
        color: 'var(--orange)',
        kind: 'expense',
        amount: 8_309,
        symbol: '₽',
        href: '#',
        mark: { label: 'Вне бюджета' },
        unsigned: true,
      },
    },
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
    {
      name: 'Не учитывается',
      width: 520,
      props: { title: 'Расход', details: 'не учитывается, Основной', icon: 'tag', color: 'var(--gray)', kind: 'expense', amount: 120_000, symbol: '₽', href: '#', muted: true },
    },
    {
      name: 'Открытая для разметки',
      width: 520,
      props: {
        id: 'spending-1',
        title: 'Т-Мобайл',
        details: 'Связь, Т-Банк Black',
        icon: 'phone',
        color: 'var(--orange)',
        kind: 'expense',
        amount: 1_500,
        symbol: '₽',
        href: '#',
        actions: [{ label: 'Отвязать', action: '#' }],
        panel: choiceGroup({
          label: 'Категория',
          choices: [
            { label: 'Связь', action: '#', color: 'var(--orange)', current: true },
            { label: 'Дом', detail: 'из ZenMoney', action: '#', color: 'var(--teal)' },
          ],
        }),
      },
    },
  ]),
  doc(dayGroup, { group: 'Операции', description: 'Операции одного дня под заголовком с итогом дня.' }, [
    { name: 'Сегодня', width: 560, props: { date: TODAY, today: TODAY, net: { amount: -1_807.9, symbol: '₽' }, rows: operationRows } },
    { name: 'Давно', width: 560, props: { date: '2026-09-12', today: TODAY, rows: operationRows.slice(0, 1) } },
  ]),
  doc(amountList, { group: 'Операции', description: 'Суммы одна под другой: с точкой или иконкой, по желанию с полосой доли, пометкой и ссылкой; открытая подсвечена.' }, [
    {
      name: 'С полосами',
      width: 420,
      props: {
        label: 'Категории в неделю',
        items: [
          { label: 'Продукты', amount: 26_560, color: '#4FAE7F', share: 1, note: '+39%' },
          { label: 'Кафе и рестораны', amount: 6_330, color: 'var(--blue)', share: 0.24, note: '−49%' },
          { label: 'Шоппинг', amount: 4_624, color: 'var(--orange)', share: 0.17 },
        ],
      },
    },
    {
      name: 'С иконками и ссылками',
      width: 420,
      props: {
        label: 'Проверить',
        symbol: '₽',
        items: [
          { label: 'Переводы людям', amount: 123_158, icon: 'arrowUpRight', tone: 'blue', note: '14 шт.', href: '#', active: true },
          { label: 'Без категории', amount: 20_172, icon: 'tag', tone: 'gray', note: '17 шт.', href: '#' },
        ],
      },
    },
    { name: 'Просто суммы', width: 420, props: { label: 'Регулярные', items: [{ label: 'Школа', amount: 45_000 }, { label: 'Аренда', amount: 40_000 }] } },
  ]),
  doc(assistantHero, { group: 'Ассистент', description: 'Приветствие ассистента: что он сделал и нашёл, вопросы чипами; отвеченный подсвечен.' }, [
    {
      name: 'С выбранным вопросом',
      width: 440,
      props: {
        title: 'Разобрал сентябрь',
        text: 'Нашёл 6 важных моментов.',
        chips: [
          { label: 'Где перерасход и почему', icon: 'trendingUp', href: '#', active: true },
          { label: 'Какие траты проверить', icon: 'search', href: '#' },
          { label: 'На чём сэкономить', icon: 'piggy', href: '#' },
        ],
      },
    },
  ]),
  doc(assistantAnswer, { group: 'Ассистент', description: 'Ответ ассистента: вопрос, абзацы и ссылки на то, о чём речь.' }, [
    {
      name: 'Со ссылками',
      width: 440,
      props: {
        question: 'Где перерасход и почему',
        paragraphs: ['Недели потратили 488 432 ₽ при плане 225 000 ₽.', 'Больше всего потратила неделя 12 – 18 сентября, и раздули её траты ниже.'],
        links: [{ label: '18 сентября · Татьяна А.', detail: '70 000 ₽', href: '#' }],
        closeHref: '#',
      },
    },
    { name: 'Без ссылок', width: 440, props: { question: 'На чём сэкономить', paragraphs: ['Ни одна категория заметно не выросла.'], closeHref: '#' } },
  ]),
  doc(insightList, { group: 'Ассистент', description: 'Что нашёл ассистент: иконка в круге, жирная строка, тихое пояснение и ссылка дальше.' }, [
    {
      name: 'Выводы',
      width: 440,
      props: {
        label: 'Главные выводы',
        items: [
          { icon: 'trendingUp', tone: 'red', title: 'Недели потратили на 263 432 ₽ больше плана', text: 'Больше всего — 12 – 18 сентября: 179 519 ₽.', href: '#' },
          { icon: 'check', tone: 'green', title: 'Дополнительные почти не тронуты', text: '2 490 ₽ из 100 000 ₽.' },
        ],
      },
    },
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
    description: 'Запись, которую настраивают: что, когда и сколько. Строка открывает её для правки, кнопки рядом делают частое действие сразу; кнопка-значок видна при наведении. Точка перед суммой говорит, где сумма считается: жёлтая — в неделе, фиолетовая — в дополнительных, пустое кольцо — вне бюджета.',
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
      name: 'Покупка с действием-значком',
      width: 520,
      props: {
        title: 'Ботинки Савве',
        details: 'ждёт покупки',
        mark: { label: 'В неделе', tone: 'yellow' },
        icon: 'shirt',
        color: 'var(--blue)',
        amount: 8_000,
        symbol: '₽',
        href: '#',
        actions: [{ label: 'Завершить: остаток вернётся', icon: 'check', action: '#' }],
      },
    },
    {
      name: 'Приглушённая',
      width: 520,
      props: { title: 'Интернет', details: '1-го числа · прошёл 1 октября', icon: 'phone', color: 'var(--gray)', amount: 1_100, symbol: '₽', href: '#', muted: true },
    },
    {
      name: 'Открытая, с панелью',
      width: 520,
      props: {
        id: 'spending-1',
        title: 'Продукты',
        details: '5 октября, Основной · Пятёрочка',
        icon: 'cart',
        color: '#4FAE7F',
        mark: { label: 'В неделе', tone: 'yellow' },
        amount: 473,
        symbol: '₽',
        href: '#',
        actions: [{ label: 'Отвязать', action: '#' }],
        panel: choiceGroup({
          label: 'Оплата',
          choices: [
            { label: 'Продукты', detail: 'в плане недели · 3 000 ₽', current: true },
            { label: 'Проезд', detail: 'в плане недели · 1 000 ₽', action: '#' },
          ],
        }),
      },
    },
    {
      name: 'С отметкой, где считается',
      width: 360,
      props: {
        title: 'Коммуналка Московский 18к5',
        details: '5 октября, Основной · prostoplatSBP',
        icon: 'repeat',
        color: 'var(--orange)',
        mark: { label: 'Вне бюджета' },
        amount: 8_309,
        symbol: '₽',
        href: '#',
      },
    },
    {
      name: 'Без суммы',
      width: 520,
      props: { title: 'Продукты', details: 'в ZenMoney «Groceries» · 200 трат за 3 месяца', icon: 'cart', color: '#4FAE7F', href: '#' },
    },
    {
      name: 'Без правки, с выбором',
      width: 520,
      props: {
        title: 'Александр А.',
        details: '5 октября, Запас · без категории',
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
      name: 'Вход с паролем',
      width: 640,
      props: {
        action: '#',
        submitLabel: 'Войти',
        icon: 'wallet',
        color: 'var(--violet)',
        fields: field({ label: 'Токен доступа', name: 'token', type: 'password', required: true, error: 'Токен не подошёл' }),
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

  doc(entryDivider, { group: 'Настройка', description: 'Черта между записями с подписью, например сегодняшний день между прошедшими и предстоящими платежами.' }, [
    {
      name: 'Сегодня',
      width: 520,
      props: { label: 'Сегодня, 6 октября' },
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
