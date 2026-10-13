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

/**
 * Shows a category's colour and photo on its form's icon as soon as they are picked (colorPicker and photoField). A
 * photo is shrunk to a square of PHOTO_SIZE pixels and sent as a data URL: a photo is cut to the square and sent as a
 * JPEG; an image with a clear ground, such as an icon, fits into the square whole with a margin and stays a PNG, so the
 * category's colour shows through it.
 */
const PICK_LOOK = `
(() => {
  const PHOTO_SIZE = 240;
  const show = (form, color) => form.style.setProperty('--color', color);
  const pickColor = (input) => {
    const form = input.form;
    if (!form) return;
    if (input.type === 'color') {
      const custom = input.closest('.color-choice');
      const radio = custom && custom.querySelector('input[type=radio]');
      if (!radio) return;
      radio.checked = true;
      radio.dataset.color = input.value;
      custom.style.setProperty('--custom', input.value);
      show(form, input.value);
    } else if (input.dataset.color && input.checked) {
      show(form, input.dataset.color);
    }
  };
  const shrink = async (file) => {
    const image = new Image();
    image.src = URL.createObjectURL(file);
    await image.decode();
    const probe = document.createElement('canvas');
    probe.width = probe.height = 32;
    probe.getContext('2d').drawImage(image, 0, 0, 32, 32);
    const pixels = probe.getContext('2d').getImageData(0, 0, 32, 32).data;
    let clear = false;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] < 250) clear = true;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = PHOTO_SIZE;
    const context = canvas.getContext('2d');
    const { naturalWidth: width, naturalHeight: height } = image;
    const scale = clear ? (0.72 * PHOTO_SIZE) / Math.max(width, height) : PHOTO_SIZE / Math.min(width, height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, (PHOTO_SIZE - width * scale) / 2, (PHOTO_SIZE - height * scale) / 2, width * scale, height * scale);
    URL.revokeObjectURL(image.src);
    return clear ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85);
  };
  const pickPhoto = async (input) => {
    const form = input.form;
    const file = input.files && input.files[0];
    if (!form || !file) return;
    let data;
    try {
      data = await shrink(file);
    } catch {
      alert('Не получилось открыть картинку');
      return;
    }
    let value = form.querySelector('input[type=hidden][name="' + input.dataset.photo + '"]');
    if (!value) {
      value = document.createElement('input');
      value.type = 'hidden';
      value.name = input.dataset.photo;
      form.append(value);
    }
    value.value = data;
    const tile = form.querySelector('.entry-icon');
    if (tile) {
      const photo = document.createElement('img');
      photo.className = 'photo';
      photo.alt = '';
      photo.src = data;
      tile.replaceChildren(photo);
    }
  };
  addEventListener('input', (event) => {
    if (event.target instanceof HTMLInputElement && event.target.type === 'color') pickColor(event.target);
  });
  addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (input.dataset.photo) pickPhoto(input);
    else pickColor(input);
  });
})();
`;

/**
 * Finds as the user types in a live search field (searchField with `live`): a moment after the last key, and at once
 * on Enter, the page asks the server for itself with what was typed, as the search would without it, and puts what
 * follows the field in the element with an id round it in place of what follows it here. The field keeps what is
 * typed and the focus, and the address takes the search, so that a reload or a form that comes back shows the same.
 * Without it the search finds on Enter.
 */
const LIVE_SEARCH = `
(() => {
  let timer = null;
  let asking = null;
  const find = async (form) => {
    const region = form.closest('[id]');
    if (!region) return;
    const url = new URL(form.action, location.href);
    url.search = new URLSearchParams(new FormData(form)).toString();
    url.hash = '';
    if (asking) asking.abort();
    const controller = new AbortController();
    asking = controller;
    let page;
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return;
      page = await response.text();
    } catch {
      return;
    }
    const fresh = new DOMParser().parseFromString(page, 'text/html').getElementById(region.id);
    const field = fresh && fresh.querySelector('form[data-live]');
    if (!field) return;
    while (form.nextSibling) form.nextSibling.remove();
    const found = [];
    for (let node = field.nextSibling; node; node = node.nextSibling) found.push(document.importNode(node, true));
    form.after(...found);
    history.replaceState(history.state, '', url.pathname + url.search + location.hash);
  };
  addEventListener('input', (event) => {
    const form = event.target instanceof HTMLInputElement ? event.target.form : null;
    if (!form || !form.hasAttribute('data-live')) return;
    clearTimeout(timer);
    timer = setTimeout(() => find(form), 200);
  });
  addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.hasAttribute('data-live')) return;
    event.preventDefault();
    clearTimeout(timer);
    find(form);
  });
})();
`;

/**
 * Posts a form marked to stay (data-stay) without leaving the page: the page the server answers with, the same one
 * after a redirect, takes the place of this one's body, and the part of the page the form was in stays where it was
 * on the screen, though rows above it come or go. The address takes the one answered. If the post fails the form is
 * sent as without it.
 */
const STAY = `
(() => {
  addEventListener('submit', async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.hasAttribute('data-stay') || form.method !== 'post') return;
    event.preventDefault();
    const anchor = form.closest('[id]');
    const id = anchor ? anchor.id : null;
    const top = anchor ? anchor.getBoundingClientRect().top : 0;
    let response;
    let page;
    try {
      response = await fetch(form.action, { method: 'POST', body: new URLSearchParams(new FormData(form, event.submitter)) });
      if (!response.ok) throw new Error(String(response.status));
      page = new DOMParser().parseFromString(await response.text(), 'text/html');
    } catch {
      HTMLFormElement.prototype.submit.call(form);
      return;
    }
    for (const script of page.body.querySelectorAll('script')) script.remove();
    document.body.replaceChildren(...[...page.body.childNodes].map((node) => document.importNode(node, true)));
    history.replaceState(history.state, '', response.url.replace(/#.*$/, '') + location.hash);
    const again = id ? document.getElementById(id) : null;
    if (again) scrollTo(0, scrollY + again.getBoundingClientRect().top - top);
  });
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
<script>${raw(PICK_LOOK)}</script>
<script>${raw(LIVE_SEARCH)}</script>
<script>${raw(STAY)}</script>
</body>
</html>`;
}
