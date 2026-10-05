import type { AppliedChanges, Store } from './store.ts';
import type { ZenMoneyClient } from './zenmoney/client.ts';

/** Downloads what changed in ZenMoney since the previous sync and saves it locally. */
export async function sync(client: Pick<ZenMoneyClient, 'changesSince'>, store: Store): Promise<AppliedChanges> {
  const diff = await client.changesSince(store.serverTimestamp);
  return store.apply(diff);
}
