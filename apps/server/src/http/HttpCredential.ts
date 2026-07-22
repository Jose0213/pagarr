// Ported from NzbDrone.Common/Http/BasicNetworkCredential.cs
//
// .NET's ICredentials/NetworkCredential distinguishes "basic" (send the
// Authorization header up front) from a generic NetworkCredential that
// participates in the 401 challenge/response handshake via a
// CredentialCache keyed by auth scheme (Basic/Digest). fetch() has no
// built-in credential-cache/challenge-response mechanism, so we model both
// shapes but ManagedHttpDispatcher only implements the Basic path -- see
// its file header for details on the Digest gap.

export interface NetworkCredential {
  readonly kind: "network";
  userName: string;
  password: string;
}

export interface BasicNetworkCredential {
  readonly kind: "basic";
  userName: string;
  password: string;
}

export type HttpCredential = NetworkCredential | BasicNetworkCredential;

export function basicNetworkCredential(user: string, pass: string): BasicNetworkCredential {
  return { kind: "basic", userName: user, password: pass };
}

export function networkCredential(user: string, pass: string): NetworkCredential {
  return { kind: "network", userName: user, password: pass };
}
