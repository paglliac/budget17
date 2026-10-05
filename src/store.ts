import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Budget, DiffResponse, EntityCollections, Timestamp } from './zenmoney/types.ts';

/** What one sync changed in the local copy. */
export interface AppliedChanges {
  /** The first sync downloads everything. */
  initial: boolean;
  /** Number of created or updated entities by type, e.g. { transaction: 3 }. */
  updated: Record<string, number>;
  deleted: number;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS entity (
    type TEXT NOT NULL,
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (type, id)
  ) STRICT;

  CREATE TABLE IF NOT EXISTS sync_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    server_timestamp INTEGER NOT NULL
  ) STRICT;
`;

/** Local copy of ZenMoney data in SQLite. Entities are stored as JSON exactly as the API returns them. */
export class Store {
  readonly #db: DatabaseSync;

  /** Opens or creates the database; ':memory:' keeps it in memory. */
  constructor(path: string) {
    if (path !== ':memory:') {
      mkdirSync(dirname(path), { recursive: true });
    }
    this.#db = new DatabaseSync(path);
    this.#db.exec(SCHEMA);
  }

  /** serverTimestamp of the last sync; 0 when nothing has been synced yet. */
  get serverTimestamp(): Timestamp {
    const row = this.#db.prepare('SELECT server_timestamp FROM sync_state').get();
    return row ? Number(row.server_timestamp) : 0;
  }

  /** Saves a diff atomically: entities, deletions and the new serverTimestamp. */
  apply(diff: DiffResponse): AppliedChanges {
    const { serverTimestamp, deletion = [], ...collections } = diff;
    const initial = this.serverTimestamp === 0;
    const upsert = this.#db.prepare(
      'INSERT INTO entity (type, id, data) VALUES (?, ?, ?) ON CONFLICT (type, id) DO UPDATE SET data = excluded.data',
    );
    const remove = this.#db.prepare('DELETE FROM entity WHERE type = ? AND id = ?');
    const updated: Record<string, number> = {};
    let deleted = 0;

    this.#db.exec('BEGIN');
    try {
      // The response also carries collections absent from our types, e.g. country; store them all.
      for (const [type, entities] of Object.entries(collections)) {
        if (!Array.isArray(entities) || entities.length === 0) continue;
        for (const entity of entities) {
          upsert.run(type, entityKey(type, entity), JSON.stringify(entity));
        }
        updated[type] = entities.length;
      }
      for (const { object, id } of deletion) {
        deleted += Number(remove.run(object, id).changes);
      }
      this.#db
        .prepare(
          'INSERT INTO sync_state (id, server_timestamp) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET server_timestamp = excluded.server_timestamp',
        )
        .run(serverTimestamp);
      this.#db.exec('COMMIT');
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }

    return { initial, updated, deleted };
  }

  /** All stored entities grouped by type, shaped like an API response. */
  load(): EntityCollections {
    const collections: Record<string, unknown[]> = {};
    for (const row of this.#db.prepare('SELECT type, data FROM entity').all()) {
      (collections[row.type as string] ??= []).push(JSON.parse(row.data as string));
    }
    return collections;
  }

  [Symbol.dispose](): void {
    this.#db.close();
  }
}

/** Budget is the only entity without an id: it is identified by user, category and month. */
function entityKey(type: string, entity: object): string {
  if (type === 'budget') {
    const { user, tag, date } = entity as Budget;
    return `${user}:${tag}:${date}`;
  }
  return String((entity as { id: unknown }).id);
}
