// Asks Claude, by the user's subscription, to review a month on a server and posts its answer back: reads the month
// from GET /api/review/claude/input, runs `claude -p` as ask.ts does, signed in as the user running this, and posts the
// answer to /api/review/claude/answer. Without --month it reviews the months the user asked for on the page
// («Пересмотреть»); --watch keeps looking for such requests. With ACCESS_TOKEN in the environment every request
// carries it, for a server open to the internet. A server with a Claude token in its settings needs none of this: it
// reviews what is asked for by itself.
//
//   node src/claude/run.ts --server http://localhost:4318 --month 2026-09
//   node --env-file=.env src/claude/run.ts --server https://budget.gang.su --watch

import { writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import type { ClaudeInput } from '../claude-review.ts';
import { askClaude } from './ask.ts';

const { values } = parseArgs({
  options: {
    server: { type: 'string', default: 'http://localhost:4317' },
    month: { type: 'string' },
    watch: { type: 'boolean', default: false },
    model: { type: 'string' },
    /** Where to write Claude's answer as well, to read it. */
    out: { type: 'string' },
  },
});

const AUTHORIZATION: Record<string, string> = process.env.ACCESS_TOKEN ? { authorization: `Bearer ${process.env.ACCESS_TOKEN}` } : {};
/** How often --watch looks for requests. */
const WATCH_SECONDS = 20;

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(new URL(path, values.server), { ...init, headers: { ...AUTHORIZATION, ...(init.headers as Record<string, string>) } });
  const body = (await response.json()) as T & { error?: string; errors?: string[] };
  if (!response.ok) throw new Error(`${path}: ${response.status} ${body.error ?? body.errors?.join('; ') ?? ''}`);
  return body;
}

async function review(month: string): Promise<void> {
  const started = Date.now();
  const input = await api<ClaudeInput>(`/api/review/claude/input?month=${month}`);
  console.log(`${month}: ${input.expenses.length} трат, ${input.previous ? 'Claude пересматривает' : 'Claude разбирает'} месяц…`);
  const answer = await askClaude(month, input, { model: values.model });
  if (values.out) writeFileSync(values.out, `${JSON.stringify(answer, null, 2)}\n`);
  const saved = await api<{ dropped: string[] }>(`/api/review/claude/answer?month=${month}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(answer),
  });
  const a = answer as Record<string, unknown[]>;
  const sizes = ['findings', 'marking', 'questions', 'splits', 'avoidable'].map((key) => `${key} ${a[key]?.length ?? 0}`).join(', ');
  console.log(`${month}: ответ записан за ${Math.round((Date.now() - started) / 1000)} с — ${sizes}`);
  for (const line of saved.dropped) console.log(`  пропущено: ${line}`);
}

async function requested(): Promise<Array<{ month: string; askedAt: string }>> {
  return (await api<{ requests: Array<{ month: string; askedAt: string }> }>('/api/review/claude/requests')).requests;
}

if (values.month) {
  await review(values.month);
} else if (!values.watch) {
  const requests = await requested();
  if (!requests.length) console.log('Разобрать месяц никто не просил; укажите --month.');
  for (const { month } of requests) await review(month);
} else {
  // A request that failed is not tried again until the user asks anew.
  const failed = new Set<string>();
  console.log(`Жду просьб разобрать месяц на ${values.server}…`);
  for (;;) {
    try {
      for (const { month, askedAt } of await requested()) {
        if (failed.has(`${month} ${askedAt}`)) continue;
        await review(month).catch((error: unknown) => {
          failed.add(`${month} ${askedAt}`);
          console.error(`${month}: не вышло —`, error instanceof Error ? error.message : error);
        });
      }
    } catch (error) {
      console.error('Сервер не ответил:', error instanceof Error ? error.message : error);
    }
    await sleep(WATCH_SECONDS * 1000);
  }
}
