import { BasicRepository, type ColumnMapping } from "../db/basic-repository.js";
import type { IDatabase } from "../db/database.js";
import type { IEventAggregator } from "../db/events.js";
import type { User } from "./User.js";

/**
 * Ported from NzbDrone.Core/Authentication/UserRepository.cs.
 *
 * Builds on the shared `BasicRepository<TModel>` -- the `Users` table
 * (migration 0001_initial_setup.sql) has no JSON-embedded columns, so
 * unlike ThingiProvider's own `ProviderRepository`/`ProviderStatusRepository`
 * (both documented deviations for exactly that reason), this repository
 * needs no custom row mapping.
 */
const USER_COLUMNS: ColumnMapping<User>[] = [
  { prop: "identifier", column: "Identifier" },
  { prop: "username", column: "Username" },
  { prop: "password", column: "Password" },
];

export interface IUserRepository {
  all(): User[];
  find(id: number): User | undefined;
  get(id: number): User;
  insert(model: User): User;
  update(model: User): User;
  upsert(model: User): User;
  delete(id: number): void;
  single(): User;
  singleOrDefault(): User | undefined;
  /** Ported from IUserRepository.FindUser(string username): Query(x => x.Username == username).SingleOrDefault(). */
  findUserByUsername(username: string): User | undefined;
  /** Ported from IUserRepository.FindUser(Guid identifier): Query(x => x.Identifier == identifier).SingleOrDefault(). */
  findUserByIdentifier(identifier: string): User | undefined;
}

export class UserRepository extends BasicRepository<User> implements IUserRepository {
  constructor(database: IDatabase, eventAggregator?: IEventAggregator) {
    super(database, { tableName: "Users", columns: USER_COLUMNS, eventAggregator });
  }

  findUserByUsername(username: string): User | undefined {
    return this.all().find((u) => u.username === username);
  }

  findUserByIdentifier(identifier: string): User | undefined {
    return this.all().find((u) => u.identifier === identifier);
  }
}
