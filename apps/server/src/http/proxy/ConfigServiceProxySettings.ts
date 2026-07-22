// Stub interface for the slice of NzbDrone.Core.Configuration.IConfigService
// that NzbDrone.Core/Http/HttpProxySettingsProvider.cs reads. The
// Configuration module is being ported in parallel by another agent
// (see PORT_PLAN.md Phase 0); this interface lets HttpProxySettingsProvider
// compile and be unit-tested now without waiting on that port to land.
// Once Configuration ships, its real config service should be widened (or
// this narrowed interface kept as a structural subset it satisfies) rather
// than this file being deleted -- whichever the Configuration module's
// actual shape makes cleaner.

import { ProxyType } from "./ProxyType.js";

export interface ConfigServiceProxySettings {
  readonly proxyEnabled: boolean;
  readonly proxyType: ProxyType;
  readonly proxyHostname: string;
  readonly proxyPort: number;
  readonly proxyBypassFilter: string;
  readonly proxyBypassLocalAddresses: boolean;
  readonly proxyUsername: string;
  readonly proxyPassword: string;
}
