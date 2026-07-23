import { createHash, randomUUID } from "node:crypto";
import type { IUserRepository } from "./UserRepository.js";
import { createUser, type User } from "./User.js";

/**
 * Ported from NzbDrone.Core/Hashing.cs's `SHA256Hash(this string input)`
 * extension method, as used by UserService: UTF-8 encodes the input,
 * SHA-256 hashes it, renders as lowercase hex. Kept local to this module
 * rather than imported from `extras/hashing.ts` (which independently ports
 * the same C# extension method for a different consumer, MetadataService)
 * -- Authentication is a self-contained module per this task's
 * directory-scoping constraint, and the two call sites' only relationship
 * is "happen to port the same one-line C# extension method," not a shared
 * abstraction worth coupling across module boundaries for.
 */
function sha256Hash(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Ported from NzbDrone.Core/Authentication/UserService.cs.
 *
 * `IAppFolderInfo`/`IDiskProvider` are injected in the C# constructor but
 * never actually referenced by any method body in the original (dead DI --
 * verified against the full 98-line source file) -- this port omits them
 * rather than translating unused constructor parameters, per "faithful
 * port of behavior," not "faithful port of every unused DI token."
 */
export interface IUserService {
  add(username: string, password: string): User;
  update(user: User): User;
  upsert(username: string, password: string): User;
  findUser(): User | undefined;
  findUserByCredentials(username: string, password: string): User | undefined;
  findUserByIdentifier(identifier: string): User | undefined;
}

export class UserService implements IUserService {
  constructor(private readonly repo: IUserRepository) {}

  /** Ported from UserService.Add(): Identifier = Guid.NewGuid(), Username lowercased, Password SHA-256 hashed. */
  add(username: string, password: string): User {
    return this.repo.insert(
      createUser({
        identifier: randomUUID(),
        username: username.toLowerCase(),
        password: sha256Hash(password),
      })
    );
  }

  update(user: User): User {
    return this.repo.update(user);
  }

  /**
   * Ported from UserService.Upsert(): finds the (single, since Readarr is
   * single-user) existing user; if none exists, adds one. If one exists,
   * re-hashes the password only when it differs from the stored hash --
   * NOTE this is the real, faithful (if odd) C# behavior: it compares the
   * NEW plaintext `password` param against the OLD user.Password (already
   * a SHA-256 hash), which will essentially always differ, so the password
   * is effectively always re-hashed on every Upsert call in practice. This
   * is preserved exactly rather than "fixed" per this task's brief.
   */
  upsert(username: string, password: string): User {
    const user = this.findUser();

    if (!user) {
      return this.add(username, password);
    }

    if (user.password !== password) {
      user.password = sha256Hash(password);
    }

    user.username = username.toLowerCase();

    return this.update(user);
  }

  findUser(): User | undefined {
    return this.repo.singleOrDefault();
  }

  /** Ported from UserService.FindUser(string username, string password). */
  findUserByCredentials(username: string, password: string): User | undefined {
    if (!username || !username.trim() || !password || !password.trim()) {
      return undefined;
    }

    const user = this.repo.findUserByUsername(username.toLowerCase());

    if (!user) {
      return undefined;
    }

    if (user.password === sha256Hash(password)) {
      return user;
    }

    return undefined;
  }

  findUserByIdentifier(identifier: string): User | undefined {
    return this.repo.findUserByIdentifier(identifier);
  }
}
