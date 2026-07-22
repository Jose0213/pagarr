// Ported from:
//  - NzbDrone.Common/Http/UserAgentBuilder.cs
//  - NzbDrone.Common/Http/UserAgentParser.cs

export interface OsInfo {
  name: string | null;
  version: string | null;
}

export interface BuildInfo {
  appName: string;
  /** Full version string, e.g. "1.2.3.4". */
  version: string;
  /** First two components of version, e.g. "1.2" -- mirrors Version.ToString(2). */
  versionShort: string;
}

export interface IUserAgentBuilder {
  getUserAgent(simplified?: boolean): string;
}

export class UserAgentBuilder implements IUserAgentBuilder {
  private readonly userAgentSimplified: string;
  private readonly userAgent: string;

  constructor(osInfo: OsInfo, buildInfo: BuildInfo) {
    const osName =
      osInfo.name !== null && osInfo.name !== undefined && osInfo.name.trim() !== ""
        ? osInfo.name.toLowerCase()
        : process.platform;
    const osVersion = osInfo.version?.toLowerCase() ?? "";

    this.userAgent = `${buildInfo.appName}/${buildInfo.version} (${osName} ${osVersion})`;
    this.userAgentSimplified = `${buildInfo.appName}/${buildInfo.versionShort}`;
  }

  getUserAgent(simplified = false): string {
    return simplified ? this.userAgentSimplified : this.userAgent;
  }
}

export function simplifyUserAgent(userAgent: string | null): string | null {
  if (userAgent === null || userAgent.startsWith("Mozilla/5.0")) {
    return null;
  }

  return userAgent;
}
