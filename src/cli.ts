import { summarizeBalances } from './balances.ts';
import { renderBalances } from './format.ts';
import { ZenMoneyClient, ZenMoneyError } from './zenmoney/client.ts';

class UsageError extends Error {}

const commands: Record<string, () => Promise<void>> = {
  async balances() {
    const data = await createClient().fetchAll();
    console.log(renderBalances(summarizeBalances(data)));
  },
};

function createClient(): ZenMoneyClient {
  const token = process.env.ZENMONEY_TOKEN;
  if (!token) {
    throw new UsageError(
      'Не задан ZENMONEY_TOKEN. Скопируйте .env.example в .env и вставьте токен с https://zerro.app/token',
    );
  }
  return new ZenMoneyClient(token);
}

async function main(argv: string[]): Promise<void> {
  const [name = 'balances'] = argv;
  const command = commands[name];
  if (!command) {
    throw new UsageError(`Неизвестная команда «${name}». Доступны: ${Object.keys(commands).join(', ')}`);
  }
  await command();
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  if (error instanceof UsageError || error instanceof ZenMoneyError) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
