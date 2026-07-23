import type { CheckOnEntry } from "../checkOnAttribute.js";
import {
  createHealthCheck,
  createOkHealthCheck,
  HealthCheckResult,
  type HealthCheck,
} from "../healthCheck.js";
import { HealthCheckBase } from "../healthCheckBase.js";
import type { ILocalizationService } from "../localizationService.js";

/**
 * Ported from NzbDrone.Core/HealthCheck/Checks/PackageGlobalMessageCheck.cs.
 *
 * FORWARD-REFERENCE: `IDeploymentInfoProvider.PackageGlobalMessage`
 * (`NzbDrone.Core.Configuration.DeploymentInfoProvider`) -- read-only
 * startup info sourced from a package/release-info file dropped next to the
 * compiled binary by Readarr's build/release pipeline, allowing a package
 * maintainer (e.g. a Linux distro packager) to surface a one-line
 * Error:/Warn:-prefixed banner in the UI. `config/configFileProvider.ts`'s
 * doc comment already documents this exact gap: "Node/npm has no equivalent
 * artifact-side-channel convention, and nothing in Phase 0 depends on it, so
 * it is NOT ported here". Narrowed to the one field this check reads.
 */
export interface DeploymentInfoProviderLike {
  readonly packageGlobalMessage: string | null;
}

export const CHECK_ON: CheckOnEntry[] = [];

export class PackageGlobalMessageCheck extends HealthCheckBase {
  constructor(
    private readonly deploymentInfoProvider: DeploymentInfoProviderLike,
    localizationService: ILocalizationService
  ) {
    super(localizationService);
  }

  check(): HealthCheck {
    const rawMessage = this.deploymentInfoProvider.packageGlobalMessage;

    if (!rawMessage || !rawMessage.trim()) {
      return createOkHealthCheck(PackageGlobalMessageCheck);
    }

    let message = rawMessage;
    let result = HealthCheckResult.Notice;

    if (message.startsWith("Error:")) {
      message = message.slice(6);
      result = HealthCheckResult.Error;
    } else if (message.startsWith("Warn:")) {
      message = message.slice(5);
      result = HealthCheckResult.Warning;
    }

    return createHealthCheck(
      PackageGlobalMessageCheck,
      result,
      message,
      "#package-maintainer-message"
    );
  }
}
