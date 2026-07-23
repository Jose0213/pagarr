import type { WebhookEventType } from "./WebhookEventType.js";
import type {
  WebhookAuthor,
  WebhookBook,
  WebhookBookFile,
  WebhookRelease,
  WebhookRenamedBookFile,
} from "./WebhookModels.js";
import type { HealthCheckResult } from "../forwardRefs.js";

/**
 * Ported from NzbDrone.Core/Notifications/Webhook/WebhookPayload.cs +
 * WebhookGrabPayload.cs, WebhookImportPayload.cs, WebhookRenamePayload.cs,
 * WebhookRetagPayload.cs, WebhookBookDeletePayload.cs,
 * WebhookBookFileDeletePayload.cs, WebhookAuthorAddedPayload.cs,
 * WebhookAuthorDeletePayload.cs, WebhookHealthPayload.cs,
 * WebhookApplicationUpdatePayload.cs.
 *
 * Each `WebhookXPayload : WebhookPayload` subclass is ported as an
 * interface extending `WebhookPayload` (TS interfaces model C# field-only
 * subclassing directly, no factory function needed since these are built
 * inline in WebhookBase.ts's `buildOnXPayload` methods, not constructed
 * standalone elsewhere).
 */
export interface WebhookPayload {
  eventType: WebhookEventType;
  instanceName: string | null;
}

export interface WebhookGrabPayload extends WebhookPayload {
  author: WebhookAuthor;
  books: WebhookBook[];
  release: WebhookRelease;
  downloadClient: string | null;
  downloadClientType: string | null;
  downloadId: string | null;
}

export interface WebhookImportPayload extends WebhookPayload {
  author: WebhookAuthor;
  book: WebhookBook;
  bookFiles: WebhookBookFile[];
  deletedFiles: WebhookBookFile[] | null;
  isUpgrade: boolean;
  downloadClient: string | null;
  downloadClientType: string | null;
  downloadId: string | null;
}

export interface WebhookRenamePayload extends WebhookPayload {
  author: WebhookAuthor;
  renamedBookFiles: WebhookRenamedBookFile[];
}

export interface WebhookRetagPayload extends WebhookPayload {
  author: WebhookAuthor;
  bookFile: WebhookBookFile;
}

export interface WebhookBookDeletePayload extends WebhookPayload {
  author: WebhookAuthor;
  book: WebhookBook;
  deletedFiles: boolean;
}

export interface WebhookBookFileDeletePayload extends WebhookPayload {
  author: WebhookAuthor;
  book: WebhookBook;
  bookFile: WebhookBookFile;
}

export interface WebhookAuthorAddedPayload extends WebhookPayload {
  author: WebhookAuthor;
}

export interface WebhookAuthorDeletePayload extends WebhookPayload {
  author: WebhookAuthor;
  deletedFiles: boolean;
}

export interface WebhookHealthPayload extends WebhookPayload {
  level: HealthCheckResult;
  message: string;
  type: string;
  wikiUrl: string | null;
}

export interface WebhookApplicationUpdatePayload extends WebhookPayload {
  message: string;
  previousVersion: string;
  newVersion: string;
}
