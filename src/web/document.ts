import { html, raw, type Content, type Html } from './html.ts';

/** A complete HTML page with the shared stylesheet and font. `styles` adds page-specific CSS. */
export function pageDocument(options: { title: string; body: Content; styles?: string }): Html {
  return html`<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${options.title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600&display=swap">
<link rel="stylesheet" href="/styles.css">
${options.styles ? html`<style>${raw(options.styles)}</style>` : null}
</head>
<body>
${options.body}
</body>
</html>`;
}
