import type { DiffRequest, DiffResponse } from './types.ts';

export const DEFAULT_BASE_URL = 'https://api.zenmoney.ru/v8';

export class ZenMoneyError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ZenMoneyError';
    this.status = status;
  }
}

export interface ZenMoneyClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
}

export class ZenMoneyClient {
  readonly #token: string;
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;

  constructor(token: string, options: ZenMoneyClientOptions = {}) {
    this.#token = token;
    this.#baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.#fetch = options.fetch ?? fetch;
  }

  /** Sends local changes and receives everything changed on the server since `serverTimestamp`. */
  async diff(request: DiffRequest): Promise<DiffResponse> {
    const response = await this.#fetch(`${this.#baseUrl}/diff/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.#token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const body = await response.text();
      if (response.status === 401) {
        throw new ZenMoneyError(401, 'ZenMoney отклонил токен (401). Получите новый на https://zerro.app/token');
      }
      throw new ZenMoneyError(response.status, `ZenMoney API ответил ${response.status}: ${body}`);
    }

    return (await response.json()) as DiffResponse;
  }

  /** Full snapshot of all user data. */
  fetchAll(): Promise<DiffResponse> {
    return this.diff({
      currentClientTimestamp: Math.floor(Date.now() / 1000),
      serverTimestamp: 0,
    });
  }
}
