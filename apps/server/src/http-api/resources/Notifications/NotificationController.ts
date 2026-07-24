import type { Router } from "express";
import { createAppriseSettings } from "../../../notifications/apprise/AppriseSettings.js";
import { createCustomScriptSettings } from "../../../notifications/customscript/CustomScriptSettings.js";
import { createDiscordSettings } from "../../../notifications/discord/DiscordSettings.js";
import { createEmailSettings } from "../../../notifications/email/EmailSettings.js";
import { createGoodreadsBookshelfNotificationSettings } from "../../../notifications/goodreads/Bookshelf/GoodreadsBookshelfNotificationSettings.js";
import { createGoodreadsOwnedBooksNotificationSettings } from "../../../notifications/goodreads/OwnedBooks/GoodreadsOwnedBooksNotificationSettings.js";
import { createGotifySettings } from "../../../notifications/gotify/GotifySettings.js";
import { createJoinSettings } from "../../../notifications/join/JoinSettings.js";
import { createKavitaSettings } from "../../../notifications/kavita/KavitaSettings.js";
import { createMailgunSettings } from "../../../notifications/mailgun/MailgunSettings.js";
import { createNotifiarrSettings } from "../../../notifications/notifiarr/NotifiarrSettings.js";
import { createNtfySettings } from "../../../notifications/ntfy/NtfySettings.js";
import { createPlexServerSettings } from "../../../notifications/plex/server/PlexServerSettings.js";
import { createProwlSettings } from "../../../notifications/prowl/ProwlSettings.js";
import { createPushBulletSettings } from "../../../notifications/pushbullet/PushBulletSettings.js";
import { createPushoverSettings } from "../../../notifications/pushover/PushoverSettings.js";
import { createSendGridSettings } from "../../../notifications/sendgrid/SendGridSettings.js";
import { createSignalSettings } from "../../../notifications/signal/SignalSettings.js";
import { createSimplepushSettings } from "../../../notifications/simplepush/SimplepushSettings.js";
import { createSlackSettings } from "../../../notifications/slack/SlackSettings.js";
import { createSubsonicSettings } from "../../../notifications/subsonic/SubsonicSettings.js";
import { createSynologyIndexerSettings } from "../../../notifications/synology/SynologyIndexerSettings.js";
import { createTelegramSettings } from "../../../notifications/telegram/TelegramSettings.js";
import { createTwitterSettings } from "../../../notifications/twitter/TwitterSettings.js";
import { createWebhookSettings } from "../../../notifications/webhook/WebhookSettings.js";
import type {
  INotification,
  INotificationRepository,
  INotificationStatusService,
} from "../../../notifications/index.js";
import { NotificationFactory } from "../../../notifications/NotificationFactory.js";
import {
  computeNotificationDefinitionEnable,
  type NotificationDefinition,
} from "../../../notifications/NotificationDefinition.js";
import type {
  IProviderConfig,
  ProviderDefinition,
  ProviderFactoryEventAggregator,
  ProviderFactoryLogger,
} from "../../../thingi-provider/index.js";
import { providerControllerBase } from "../../rest/ProviderControllerBase.js";
import {
  extraFieldsProviderResourceMapper,
  type ProviderSettingsSchema,
} from "../../rest/ProviderResource.js";
import { unionFieldDefs } from "../genericProviderFieldSchema.js";
import { NOTIFICATION_EXTRA_FIELDS, type NotificationResource } from "./NotificationResource.js";

/**
 * Ported from Readarr.Api.V1/Notifications/NotificationController.cs.
 *
 * ```
 * public class NotificationController : ProviderControllerBase<NotificationResource, NotificationBulkResource, INotification, NotificationDefinition>
 * {
 *     public NotificationController(NotificationFactory notificationFactory)
 *         : base(notificationFactory, "notification", ResourceMapper, BulkResourceMapper)
 *     {
 *     }
 *
 *     [NonAction] public override ActionResult<NotificationResource> UpdateProvider([FromBody] NotificationBulkResource providerResource) => throw new NotImplementedException();
 *     [NonAction] public override object DeleteProviders([FromBody] NotificationBulkResource resource) => throw new NotImplementedException();
 * }
 * ```
 *
 * ## The easy half: `NotificationFactory`/`NotificationRepository` are REAL
 * `IProviderFactory`/`IProviderRepository` implementations already
 *
 * Unlike DownloadClient (see `DownloadClient/DownloadClientController.ts`'s
 * extensive doc comment on the adapters that module needed),
 * `notifications/NotificationFactory.ts`'s `NotificationFactory extends
 * thingi-provider/ProviderFactory<INotification, IProviderConfig>` FOR
 * REAL, and `INotification extends IProvider<TProviderConfig>` FOR REAL
 * (see `notifications/INotification.ts`'s own doc comment: "Notifications
 * is the intended real consumer" of the ThingiProvider base). No adapter
 * layer is needed here at all -- `NotificationFactory` (constructed by the
 * caller with a real `INotificationRepository` + real `INotification[]`
 * instances) is handed to `providerControllerBase()` completely as-is.
 *
 * ## The remaining gap: extra sibling JSON fields, same as every other
 * provider-kind controller in this task's scope
 *
 * `NotificationResource`'s ~29 extra fields (`OnX` triggers,
 * `SupportsOnX` capability flags, `IncludeHealthWarnings`) are carried
 * to/from the wire via `providerControllerBase()`'s real `resourceMapper`
 * extension seam -- `rest/ProviderResource.ts`'s
 * `extraFieldsProviderResourceMapper()`, same helper
 * `DownloadClientController.ts`/`MetadataController.ts` use for their own
 * extra fields.
 *
 * ## Settings-schema genericity: 25 concrete notifier settings shapes
 *
 * `NotificationDefinition.settings` varies across all 25 real, already-
 * ported notifier implementations (Discord/Slack/Telegram/Signal/
 * Simplepush/CustomScript/Kavita/PlexServer/Subsonic/SynologyIndexer/
 * Webhook/Apprise/Gotify/Join/Notifiarr/Ntfy/Prowl/PushBullet/Pushover/
 * Email/Mailgun/SendGrid/Twitter/GoodreadsBookshelf/GoodreadsOwnedBooks --
 * see `notifications/index.ts`'s barrel export for the full per-notifier
 * submodule list), so this controller's `fieldDefs` is the UNION schema
 * built by `genericProviderFieldSchema.ts`'s `unionFieldDefs()` -- see that
 * module's doc comment for the full "why a union, not 25 separate
 * controllers or reflection" rationale. This is the SAME mechanism
 * DownloadClient's controller uses for its own 4-shape settings union,
 * scaled up to 25 shapes with no change to the mechanism itself.
 *
 * ## Bulk routes: real C# disables them, this port's shared base cannot
 *
 * See `NotificationBulkResource.ts`'s doc comment for the full explanation
 * -- the real `NotificationController` has NO `PUT /bulk`/`DELETE /bulk`
 * routes at all ([NonAction] removes them from ASP.NET's routing table).
 * `providerControllerBase()` mounts them unconditionally with no
 * per-controller opt-out. This port's `NotificationController` therefore
 * exposes working bulk routes where the real API would 404 -- an accepted,
 * documented deviation (see this task's final report), not a bug.
 *
 * ## `enable`'s computed-getter semantics -- a small, local `NotificationFactory` subclass
 *
 * `NotificationDefinition.Enable` is a real C# OVERRIDDEN GETTER (`OnGrab ||
 * OnReleaseImport || ... || OnApplicationUpdate`, see
 * `NotificationDefinition.ts`'s `computeNotificationDefinitionEnable`), not
 * a settable field -- so in the real C#, no matter what
 * `ProviderResourceMapper.ToModel`'s base implementation does to the base
 * `Enable` field (it never sets it, matching `NotificationResource`'s own
 * lack of an `Enable` wire property), reading `definition.Enable` anywhere
 * downstream ALWAYS reflects the current `OnX` flags, automatically,
 * because it's computed on every access.
 *
 * This port's `ProviderDefinition.enable` is a plain settable boolean field
 * (TS interfaces have no override mechanism for a computed property -- see
 * `NotificationDefinition.ts`'s own doc comment on this exact point), so
 * nothing recomputes it automatically. `mapper.toModel()`
 * (`ProviderResource.ts`, internal to the shared `providerControllerBase()`)
 * leaves it hardcoded `false`.
 *
 * `EnableRecomputingNotificationFactory` below is a small local
 * `NotificationFactory` subclass overriding `create`/`update` to call
 * `computeNotificationDefinitionEnable()` on the definition before
 * delegating to `super.create`/`super.update` -- the direct, faithful
 * substitute for the real computed-getter semantics, applied at both write
 * paths. This makes `definition.enable` correct in the PERSISTED row
 * (`NotificationRepository` doesn't store `enable` as a column at all --
 * see that file's doc comment -- so this has no direct storage effect, but
 * it DOES make every subsequent `providerFactory.get()`/`getMany()`/`all()`
 * read return a definition whose in-memory `enable` reflects the real
 * `OnX` state until the next `NotificationFactory.active()` call
 * recomputes it fresh anyway) and correct for any caller downstream of
 * `create`/`update` that reads `definition.enable` directly.
 *
 * KNOWN LIMITATION -- does NOT reach `providerControllerBase()`'s own
 * PRE-CREATE test-gate: `ProviderControllerBase.ts`'s `POST /` handler
 * checks `if (definition.enable) { await test(definition, ...) }` BEFORE
 * calling `providerFactory.create(definition)` (see that file's "POST /
 * (create)" route) -- i.e. the gate check happens strictly earlier in the
 * request pipeline than this subclass's `create()` override ever runs.
 * There is no seam this port's `NotificationController` can hook between
 * `getDefinition()` (which builds the wrong-`enable` definition via the
 * shared `mapper.toModel()`) and that `if` check without modifying
 * `ProviderControllerBase.ts` itself -- out of scope, shared composition
 * root nine sibling agents build on in parallel. NET EFFECT: a newly
 * created/updated notification with real `OnX` triggers set will NOT be
 * auto-tested on save the way real Readarr tests a newly-enabled provider
 * (real Readarr's computed getter is already correct by the time ITS
 * `Enable` check runs, since there's no separate "build the model" step
 * with stale data in between). This is a real, accepted, documented
 * behavioral deviation -- see this task's final report.
 *
 * ## `create`/`update` need no more unhoisting -- the real `resourceMapper`
 * seam already puts `OnX`/`SupportsOnX`/`IncludeHealthWarnings` on the
 * definition's REAL top-level fields
 *
 * Previously (before `providerControllerBase()`'s `resourceMapper` seam
 * existed), `mapper.toModel()` built a `ProviderDefinition` with ONLY the
 * generic base's own fields -- `NotificationDefinition.onGrab`/
 * `onReleaseImport`/etc. were `undefined` on the definition object
 * `create`/`update` received, requiring a local `unhoistExtraFieldsOntoDefinition()`
 * step to copy them back from `wrapProviderRouterWithExtraFields()`'s
 * reserved `settings` keys. Now that `NotificationController` supplies its
 * own `resourceMapper` (`rest/ProviderResource.ts`'s
 * `extraFieldsProviderResourceMapper()`), `mapper.toModel(resource)` already
 * copies every `NOTIFICATION_EXTRA_FIELDS` entry directly onto the
 * definition's real, identically-named property BEFORE `create`/`update`
 * ever see it -- `EnableRecomputingNotificationFactory` below only needs to
 * handle the ONE thing the generic mapper still can't do: recompute
 * `enable` (a real C# computed getter this port has no override mechanism
 * for -- see below).
 */

class EnableRecomputingNotificationFactory extends NotificationFactory {
  override create(
    definition: ProviderDefinition<IProviderConfig>
  ): ProviderDefinition<IProviderConfig> {
    (definition as NotificationDefinition).enable = computeNotificationDefinitionEnable(
      definition as NotificationDefinition
    );
    return super.create(definition);
  }

  override update(definition: ProviderDefinition<IProviderConfig>): void {
    (definition as NotificationDefinition).enable = computeNotificationDefinitionEnable(
      definition as NotificationDefinition
    );
    super.update(definition);
  }
}

export interface NotificationControllerOptions {
  repository: INotificationRepository;
  /** Live, fully-constructed notifier instances (this port's 25 real notifiers -- see notifications/index.ts). */
  providers: INotification[];
  notificationStatusService: INotificationStatusService;
  eventAggregator?: ProviderFactoryEventAggregator;
  logger?: ProviderFactoryLogger;
}

/** Every registered notifier implementation's own default-settings factory -- used to build the union field schema (see module doc comment). Implementation-string keys match each notifier's own `name` property (`notifications/<dir>/<Notifier>.ts`'s `readonly name = "..."`). */
const SETTINGS_FACTORIES: Record<string, () => IProviderConfig> = {
  Apprise: () => createAppriseSettings(),
  "Custom Script": () => createCustomScriptSettings(),
  Discord: () => createDiscordSettings(),
  Email: () => createEmailSettings(),
  "Goodreads Bookshelves": () => createGoodreadsBookshelfNotificationSettings(),
  "Goodreads Owned Books": () => createGoodreadsOwnedBooksNotificationSettings(),
  Gotify: () => createGotifySettings(),
  Join: () => createJoinSettings(),
  Kavita: () => createKavitaSettings(),
  Mailgun: () => createMailgunSettings(),
  Notifiarr: () => createNotifiarrSettings(),
  "ntfy.sh": () => createNtfySettings(),
  "Plex Media Server": () => createPlexServerSettings(),
  Prowl: () => createProwlSettings(),
  Pushbullet: () => createPushBulletSettings(),
  Pushover: () => createPushoverSettings(),
  SendGrid: () => createSendGridSettings(),
  Signal: () => createSignalSettings(),
  Simplepush: () => createSimplepushSettings(),
  Slack: () => createSlackSettings(),
  Subsonic: () => createSubsonicSettings(),
  "Synology Indexer": () => createSynologyIndexerSettings(),
  Telegram: () => createTelegramSettings(),
  Twitter: () => createTwitterSettings(),
  Webhook: () => createWebhookSettings(),
};

export function notificationController(options: NotificationControllerOptions): Router {
  const { repository, providers, notificationStatusService } = options;

  const implementationFactories = new Map<string, () => INotification>();
  for (const provider of providers) {
    implementationFactories.set(provider.name.toLowerCase(), () => provider);
  }

  const factory = new EnableRecomputingNotificationFactory(
    notificationStatusService,
    repository,
    providers,
    implementationFactories,
    options.eventAggregator,
    options.logger
  );

  const fieldDefs = unionFieldDefs<IProviderConfig>(
    Object.values(SETTINGS_FACTORIES).map((create) => create())
  );

  const settingsSchema: ProviderSettingsSchema<IProviderConfig> = {
    fieldDefs,
    createDefaultSettings: () => createDiscordSettings(),
  };

  return providerControllerBase<
    INotification,
    IProviderConfig,
    NotificationResource,
    ProviderDefinition<IProviderConfig>
  >({
    providerFactory: factory,
    settingsSchema,
    wikiSlug: "readarr",
    resourceMapper: extraFieldsProviderResourceMapper(settingsSchema, NOTIFICATION_EXTRA_FIELDS),
  });
}
