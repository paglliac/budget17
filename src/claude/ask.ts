// Runs `claude -p` (Claude Code) on the user's subscription to review a month: without tools, with review.md as its
// system prompt and review.schema.json as the shape of its answer, the month on its input. With a token from
// `claude setup-token` it signs in by it rather than by the login of the machine's user; an API key in the
// environment is left out, so that Claude never goes on paid API use.

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import type { ClaudeInput } from '../claude-review.ts';

const SCHEMA = JSON.stringify(JSON.parse(readFileSync(new URL('./review.schema.json', import.meta.url), 'utf8')));
const PROMPT = readFileSync(new URL('./review.md', import.meta.url), 'utf8');
/** A review that takes longer has gone wrong. */
const CLAUDE_MINUTES = 15;

/** Claude's answer to the month: the structured output of `claude -p`, unchecked. */
export function askClaude(month: string, input: ClaudeInput, options: { token?: string | null; model?: string } = {}): Promise<unknown> {
  const args = ['-p', '--tools', '', '--no-session-persistence', '--output-format', 'json', '--json-schema', SCHEMA, '--system-prompt', PROMPT];
  if (options.model) args.push('--model', options.model);
  const { ANTHROPIC_API_KEY: _, ...env } = process.env;
  if (options.token) env.CLAUDE_CODE_OAUTH_TOKEN = options.token;
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, { env, stdio: ['pipe', 'pipe', 'pipe'], timeout: CLAUDE_MINUTES * 60_000 });
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (out += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (err += chunk));
    child.on('error', (error: NodeJS.ErrnoException) => reject(error.code === 'ENOENT' ? new Error('claude не установлен') : error));
    child.on('close', (code) => {
      let result: { is_error?: boolean; result?: string; structured_output?: unknown };
      try {
        result = JSON.parse(out);
      } catch {
        reject(new Error(`claude закончил с кодом ${code}: ${(err || out).trim().slice(0, 300)}`));
        return;
      }
      if (code !== 0 || result.is_error || result.structured_output === undefined) reject(new Error(`claude: ${(result.result ?? `код ${code}`).slice(0, 300)}`));
      else resolve(result.structured_output);
    });
    // Fields without a value are left out, as the prompt says.
    child.stdin.end(`Разбери месяц ${month}.\n\n${JSON.stringify(input, (_, value: unknown) => (value === null ? undefined : value))}`);
  });
}
