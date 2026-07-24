import { existsSync } from "node:fs";
import type { IUserService } from "../../../authentication/UserService.js";
import type { ConfigFileProvider } from "../../../config/configFileProvider.js";
import type { IConfigService } from "../../../config/configService.js";
import type {
  AuthenticationRequiredType,
  AuthenticationType,
  CertificateValidationType,
  ProxyType,
  UpdateMechanism,
} from "../../../config/enums.js";
import {
  containsReadarr,
  isValidIpAddress,
  isValidPort,
  isValidUrlBaseField,
} from "../../../validation/ruleHelpers.js";
import type { ValidationFailure } from "../../../validation/validationResult.js";
import { requestPath, validateId, validateResource } from "../../rest/RestController.js";
import { stripDefaultId, type RestResource } from "../../rest/RestResource.js";
import { Router, type Request, type Response, type NextFunction } from "express";

/**
 * Ported from Readarr.Api.V1/Config/{HostConfigResource,
 * HostConfigController}.cs. Mount path: `/api/v1/config/host`.
 *
 * Like UiConfigResource.ts/DevelopmentConfigResource.ts, built as a direct
 * Express router rather than via `configControllerBase.ts`'s
 * `configController()` -- this controller's GET/PUT bodies read/write
 * `IUserService` in addition to `IConfigFileProvider`/`IConfigService`,
 * which the shared factory has no slot for.
 *
 * ## SSL certificate validation deviation
 *
 * The real ctor chains `.SetValidator(fileExistsValidator)` (disk check)
 * THEN `.Must((resource, path) => IsValidSslCertificate(resource))` (parses
 * the file as an `X509Certificate2` with the submitted password) onto
 * `SslCertPath` when `EnableSsl` is true. This port has no X.509 certificate
 * parsing dependency and no injected disk-provider seam for this one field
 * (see MediaManagementConfigResource.ts's doc comment for the same
 * "disk-access validators need an injected provider this controller module
 * doesn't otherwise take" rationale) -- `sslCertPath` non-empty + `isPathValid`
 * shaped is checked (`IsValidPath` -- the same one `SharedValidator.RuleFor
 * (c => c.SslCertPath)... .IsValidPath()` runs BEFORE the disk/cert checks
 * in the real cascade), but actual file-existence and certificate-validity
 * are NOT reproduced. Documented, not silently dropped -- see
 * MediaManagementConfigResource.ts for the established pattern of noting
 * this rather than fabricating a fake pass/fail.
 */
export interface HostConfigResource extends RestResource {
  bindAddress: string;
  port: number;
  sslPort: number;
  enableSsl: boolean;
  launchBrowser: boolean;
  authenticationMethod: AuthenticationType;
  authenticationRequired: AuthenticationRequiredType;
  analyticsEnabled: boolean;
  username: string;
  password: string;
  passwordConfirmation: string;
  logLevel: string;
  consoleLogLevel: string;
  branch: string;
  apiKey: string;
  sslCertPath: string;
  sslCertPassword: string;
  urlBase: string;
  instanceName: string;
  applicationUrl: string;
  updateAutomatically: boolean;
  updateMechanism: UpdateMechanism;
  updateScriptPath: string;
  proxyEnabled: boolean;
  proxyType: ProxyType;
  proxyHostname: string;
  proxyPort: number;
  proxyUsername: string;
  proxyPassword: string;
  proxyBypassFilter: string;
  proxyBypassLocalAddresses: boolean;
  certificateValidation: CertificateValidationType;
  backupFolder: string;
  backupInterval: number;
  backupRetention: number;
  trustCgnatIpAddresses: boolean;
}

/** Ported from HostConfigResourceMapper.ToResource(IConfigFileProvider, IConfigService) -- Username/Password/PasswordConfirmation deliberately excluded (stamped separately from IUserService by the controller, see toHostConfigResourceWithUser below). */
export function toHostConfigResource(
  model: ConfigFileProvider,
  configService: IConfigService
): Omit<HostConfigResource, "id" | "username" | "password" | "passwordConfirmation"> {
  return {
    bindAddress: model.bindAddress,
    port: model.port,
    sslPort: model.sslPort,
    enableSsl: model.enableSsl,
    launchBrowser: model.launchBrowser,
    authenticationMethod: model.authenticationMethod,
    authenticationRequired: model.authenticationRequired,
    analyticsEnabled: model.analyticsEnabled,
    logLevel: model.logLevel,
    consoleLogLevel: model.consoleLogLevel,
    branch: model.branch,
    apiKey: model.apiKey,
    sslCertPath: model.sslCertPath,
    sslCertPassword: model.sslCertPassword,
    urlBase: model.urlBase,
    instanceName: model.instanceName,
    applicationUrl: configService.applicationUrl,
    updateAutomatically: model.updateAutomatically,
    updateMechanism: model.updateMechanism,
    updateScriptPath: model.updateScriptPath,
    proxyEnabled: configService.proxyEnabled,
    proxyType: configService.proxyType,
    proxyHostname: configService.proxyHostname,
    proxyPort: configService.proxyPort,
    proxyUsername: configService.proxyUsername,
    proxyPassword: configService.proxyPassword,
    proxyBypassFilter: configService.proxyBypassFilter,
    proxyBypassLocalAddresses: configService.proxyBypassLocalAddresses,
    certificateValidation: configService.certificateValidation,
    backupFolder: configService.backupFolder,
    backupInterval: configService.backupInterval,
    backupRetention: configService.backupRetention,
    trustCgnatIpAddresses: model.trustCgnatIpAddresses,
  };
}

/**
 * camelCase keys matching `ConfigFileProvider`/`IConfigService`'s own
 * property names, NOT the real C# reflection's PascalCase -- see
 * DownloadClientConfigResource.ts's doc comment for why. `apiKey` is
 * included for shape-completeness with the real dictionary, but
 * `ConfigFileProvider.saveConfigDictionary` explicitly skips any key whose
 * lowercased form is `"apikey"` (case-insensitively, so this still matches
 * despite the casing change) -- ported from the real
 * `SaveConfigDictionary`'s own `if (configValue.Key.ToLower() == "apikey")
 * { continue; }` guard (config/configFileProvider.ts's `saveConfigDictionary`).
 */
function toDictionary(resource: HostConfigResource): Record<string, unknown> {
  return {
    bindAddress: resource.bindAddress,
    port: resource.port,
    sslPort: resource.sslPort,
    enableSsl: resource.enableSsl,
    launchBrowser: resource.launchBrowser,
    authenticationMethod: resource.authenticationMethod,
    authenticationRequired: resource.authenticationRequired,
    analyticsEnabled: resource.analyticsEnabled,
    logLevel: resource.logLevel,
    consoleLogLevel: resource.consoleLogLevel,
    branch: resource.branch,
    apiKey: resource.apiKey,
    sslCertPath: resource.sslCertPath,
    sslCertPassword: resource.sslCertPassword,
    urlBase: resource.urlBase,
    instanceName: resource.instanceName,
    applicationUrl: resource.applicationUrl,
    updateAutomatically: resource.updateAutomatically,
    updateMechanism: resource.updateMechanism,
    updateScriptPath: resource.updateScriptPath,
    proxyEnabled: resource.proxyEnabled,
    proxyType: resource.proxyType,
    proxyHostname: resource.proxyHostname,
    proxyPort: resource.proxyPort,
    proxyUsername: resource.proxyUsername,
    proxyPassword: resource.proxyPassword,
    proxyBypassFilter: resource.proxyBypassFilter,
    proxyBypassLocalAddresses: resource.proxyBypassLocalAddresses,
    certificateValidation: resource.certificateValidation,
    backupFolder: resource.backupFolder,
    backupInterval: resource.backupInterval,
    backupRetention: resource.backupRetention,
    trustCgnatIpAddresses: resource.trustCgnatIpAddresses,
  };
}

/** Ported from `Path.IsPathRooted`/`IsValidPath` shape check, narrowed for this one field -- see module doc comment on the SSL-cert deviation. */
function looksLikeAPath(value: string): boolean {
  return value.trim() !== "";
}

/** Ported from HostConfigController's ctor SharedValidator rules (see module doc comment for the SSL-certificate-parsing deviation). `isMatchingPassword` is injected so tests/callers can supply a fake IUserService without a real password hash comparison. */
export function hostConfigSharedValidator(
  resource: HostConfigResource,
  isMatchingPassword: (resource: HostConfigResource) => boolean
): ValidationFailure[] {
  const failures: ValidationFailure[] = [];

  if (
    resource.bindAddress !== "*" &&
    resource.bindAddress !== "localhost" &&
    !isValidIpAddress(resource.bindAddress)
  ) {
    failures.push({ propertyName: "bindAddress", errorMessage: "Invalid IP Address" });
  }

  if (!isValidPort(resource.port)) {
    failures.push({ propertyName: "port", errorMessage: "Invalid Port" });
  }

  if (!isValidUrlBaseField(resource.urlBase)) {
    failures.push({ propertyName: "urlBase", errorMessage: "Invalid UrlBase" });
  }

  if (resource.instanceName.trim() !== "" && !containsReadarr(resource.instanceName)) {
    failures.push({
      propertyName: "instanceName",
      errorMessage: "Must contain 'Readarr' to allow for tray icon to work",
    });
  }

  const authRequiresCreds =
    resource.authenticationMethod === "Basic" || resource.authenticationMethod === "Forms";

  if (authRequiresCreds && resource.username.trim() === "") {
    failures.push({ propertyName: "username", errorMessage: "Must not be empty" });
  }

  if (authRequiresCreds && resource.password.trim() === "") {
    failures.push({ propertyName: "password", errorMessage: "Must not be empty" });
  }

  if (!isMatchingPassword(resource)) {
    failures.push({ propertyName: "passwordConfirmation", errorMessage: "Must match Password" });
  }

  if (resource.enableSsl && !isValidPort(resource.sslPort)) {
    failures.push({ propertyName: "sslPort", errorMessage: "Invalid Port" });
  }

  if (resource.enableSsl && resource.sslPort === resource.port) {
    failures.push({ propertyName: "sslPort", errorMessage: "Should not equal Port" });
  }

  if (resource.enableSsl) {
    if (!looksLikeAPath(resource.sslCertPath)) {
      failures.push({ propertyName: "sslCertPath", errorMessage: "Must not be empty" });
    } else if (!existsSync(resource.sslCertPath)) {
      // Ported from FileExistsValidator -- real disk check IS reproduced here
      // (unlike the X509 certificate-parsing step after it, see module doc
      // comment): the real controller's cascade stops before ever reaching
      // IsValidSslCertificate if the file doesn't exist.
      failures.push({ propertyName: "sslCertPath", errorMessage: "File does not exist" });
    }
  }

  if (resource.branch.trim() === "") {
    failures.push({
      propertyName: "branch",
      errorMessage: "Branch name is required, 'master' is the default",
    });
  }

  if (resource.backupInterval < 1 || resource.backupInterval > 7) {
    failures.push({
      propertyName: "backupInterval",
      errorMessage: "'Backup Interval' must be between 1 and 7.",
    });
  }

  if (resource.backupRetention < 1 || resource.backupRetention > 90) {
    failures.push({
      propertyName: "backupRetention",
      errorMessage: "'Backup Retention' must be between 1 and 90.",
    });
  }

  return failures;
}

/** Ported from HostConfigController.IsMatchingPassword: true if the submitted password matches the currently-stored user's password hash verbatim (a pre-existing user editing OTHER fields without retyping their password), OR if Password === PasswordConfirmation. */
function isMatchingPassword(userService: IUserService, resource: HostConfigResource): boolean {
  const user = userService.findUser();

  if (user && user.password === resource.password) {
    return true;
  }

  return resource.password === resource.passwordConfirmation;
}

function asyncHandler(
  fn: (req: Request, res: Response) => void | Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

export function hostConfigController(
  configFileProvider: ConfigFileProvider,
  configService: IConfigService,
  userService: IUserService
): Router {
  const router = Router();

  const validators = {
    sharedValidator: (resource: HostConfigResource) =>
      hostConfigSharedValidator(resource, (r) => isMatchingPassword(userService, r)),
    putValidator: () => [],
    postValidator: () => [],
  };

  /** Ported from GetHostConfig(): base resource + live Username/Password stamped from IUserService, PasswordConfirmation always blanked. */
  function getConfig(): HostConfigResource {
    const user = userService.findUser();
    return {
      ...toHostConfigResource(configFileProvider, configService),
      id: 1,
      username: user?.username ?? "",
      password: user?.password ?? "",
      passwordConfirmation: "",
    };
  }

  router.get(
    "/",
    asyncHandler((_req, res) => {
      res.json(stripDefaultId(getConfig()));
    })
  );

  router.get(
    "/:id",
    asyncHandler((_req, res) => {
      res.json(stripDefaultId(getConfig()));
    })
  );

  router.put(
    "/:id?",
    asyncHandler((req, res) => {
      const resource = req.body as HostConfigResource;

      if (resource && !resource.id && req.params["id"] !== undefined) {
        resource.id = Number.parseInt(req.params["id"], 10);
      }

      validateResource(resource, "PUT", requestPath(req), validators);

      if (req.params["id"] !== undefined) {
        validateId(Number.parseInt(req.params["id"] ?? "", 10));
      }

      const dictionary = toDictionary(resource);
      configFileProvider.saveConfigDictionary(dictionary);
      configService.saveConfigDictionary(dictionary);

      if (resource.username.trim() !== "" && resource.password.trim() !== "") {
        userService.upsert(resource.username, resource.password);
      }

      res.status(202).json(stripDefaultId(getConfig()));
    })
  );

  return router;
}
