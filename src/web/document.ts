import { html, raw, type Content, type Html } from './html.ts';

/**
 * Keeps the page where it was when a link or a form leads back to it, such as opening an entry, picking a choice in
 * it or saving it: the entry clicked, found by its id, stays where it was on the screen, and when it is gone the
 * scroll position does. Without it every such click would jump to the top of the page. Pages work without it too.
 */
const KEEP_PLACE = `
(() => {
  const key = 'keep-place';
  let kept = null;
  try {
    kept = JSON.parse(sessionStorage.getItem(key) || 'null');
    sessionStorage.removeItem(key);
  } catch {}
  if (kept && kept.path === location.pathname && Date.now() - kept.at < 15000) {
    const entry = kept.id ? document.getElementById(kept.id) : null;
    scrollTo(0, entry ? entry.getBoundingClientRect().top + scrollY - kept.top : kept.y);
    if (entry && entry.getBoundingClientRect().bottom > innerHeight) entry.scrollIntoView({ block: 'nearest' });
  }
  const keep = (element) => {
    const entry = element.closest('[id]');
    const place = { path: location.pathname, at: Date.now(), y: scrollY, id: entry ? entry.id : null, top: entry ? entry.getBoundingClientRect().top : 0 };
    try {
      sessionStorage.setItem(key, JSON.stringify(place));
    } catch {}
  };
  addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (link && link.origin === location.origin && link.pathname === location.pathname) keep(link);
  });
  addEventListener('submit', (event) => keep(event.target));
})();
`;

/** A complete HTML page with the shared stylesheet and font. `styles` adds page-specific CSS. */
export function pageDocument(options: { title: string; body: Content; styles?: string }): Html {
  return html`<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${options.title}</title>
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600&display=swap">
<link rel="stylesheet" href="/styles.css">
${options.styles ? html`<style>${raw(options.styles)}</style>` : null}
</head>
<body>
${options.body}
<script>${raw(KEEP_PLACE)}</script>
</body>
</html>`;
}
