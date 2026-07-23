import type { ModelBase } from "../db/model-base.js";

/**
 * Ported from NzbDrone.Core/Authentication/User.cs.
 *
 * C#'s `Guid Identifier` becomes a plain `string` here -- this port
 * generates identifiers via `node:crypto`'s `randomUUID()` (see
 * UserService.ts), which produces the same RFC 4122 v4 UUID text form a
 * .NET `Guid.NewGuid().ToString()` would, so the on-disk/JSON
 * representation is unchanged; TS just has no distinct GUID value type to
 * mirror C#'s `System.Guid` struct with.
 */
export interface User extends ModelBase {
  identifier: string;
  username: string;
  password: string;
}

export function createUser(overrides: Partial<User> = {}): User {
  return {
    id: 0,
    identifier: "",
    username: "",
    password: "",
    ...overrides,
  };
}
