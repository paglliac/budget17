// The login page of a server reachable from outside: one field for the access token, which posts to /login. The
// server then sets a cookie and sends the browser back to the page it came for.

import { pageDocument } from '../document.ts';
import type { Html } from '../html.ts';
import { field, pageIntro } from '../widgets/basics.ts';
import { entryForm, entryList } from '../widgets/entries.ts';
import { appShell, rail } from '../widgets/shell.ts';

export function renderLogin(options: { next: string; error?: string }): Html {
  const body = appShell({
    rail: rail({ groups: [] }),
    main: [
      pageIntro({ title: 'Вход', text: 'Сервер доступен из интернета, поэтому нужен токен доступа: он лежит в ACCESS_TOKEN в .env на сервере.' }),
      entryList({
        label: 'Вход',
        items: [
          entryForm({
            action: '/login',
            submitLabel: 'Войти',
            icon: 'wallet',
            color: 'var(--violet)',
            hidden: { next: options.next },
            fields: field({ label: 'Токен доступа', name: 'token', type: 'password', required: true, error: options.error }),
          }),
        ],
      }),
    ],
  });
  return pageDocument({ title: 'Бюджет: вход', body });
}
