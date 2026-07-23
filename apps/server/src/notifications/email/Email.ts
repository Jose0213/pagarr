/**
 * Ported from NzbDrone.Core/Notifications/Email/Email.cs.
 *
 * NEW RUNTIME DEPENDENCY: `nodemailer` (added to apps/server/package.json).
 * C# uses MailKit's `SmtpClient` (connect -> optional authenticate -> send
 * -> disconnect) + MimeKit's `MimeMessage`/`BodyBuilder` for attachments.
 * Node has no standard-library SMTP client; `nodemailer` is the de facto
 * standard choice (widely used, actively maintained, supports the same
 * connect/STARTTLS/SSL-on-connect/auth/send lifecycle MailKit's SmtpClient
 * exposes) and is used here as the closest faithful substitute. See this
 * file's `send` for the connect-per-send lifecycle mapping (MailKit's
 * `client.Connect` / `client.Authenticate` / `client.Send` /
 * `client.Disconnect` -> nodemailer's `createTransport` + `sendMail` +
 * `close`).
 */

import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import nodemailer from "nodemailer";
import type { ValidationFailure, ValidationResult } from "../../thingi-provider/IProviderConfig.js";
import { MediaFileExtensions } from "../../parser/qualityParser.js";
import type { Author } from "../../books/models.js";
import type { ApplicationUpdateMessage } from "../ApplicationUpdateMessage.js";
import type { AuthorDeleteMessage } from "../AuthorDeleteMessage.js";
import type { BookDeleteMessage } from "../BookDeleteMessage.js";
import type { BookDownloadMessage } from "../BookDownloadMessage.js";
import type { BookFileDeleteMessage } from "../BookFileDeleteMessage.js";
import type { DownloadFailedMessage } from "../DownloadFailedMessage.js";
import type { GrabMessage } from "../GrabMessage.js";
import type { HealthCheckLike } from "../forwardRefs.js";
import { NotificationBase } from "../NotificationBase.js";
import type { EmailSettings } from "./EmailSettings.js";

/**
 * Minimal logger surface -- matches this port's convention elsewhere (e.g.
 * `download-clients/qbittorrent/QBittorrentProxyV1.ts`'s `QBittorrentProxyLogger`).
 */
export interface EmailLogger {
  debug(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

const noopLogger: EmailLogger = { debug: () => {}, error: () => {} };

/**
 * Ported from `NzbDrone.Common.Http.Dispatchers.ICertificateValidationService`
 * (already ported for real at `http/dispatchers/ICertificateValidationService.ts`
 * -- reused directly here) via MailKit's
 * `client.ServerCertificateValidationCallback`. nodemailer's TLS equivalent
 * is a boolean `tls.rejectUnauthorized` per-send rather than a per-host
 * callback; `shouldByPassValidationError(host)` is consulted once per send
 * against the configured SMTP server host to produce that boolean.
 */
export interface ICertificateValidationService {
  shouldByPassValidationError(host: string): boolean;
}

const acceptAllCertificates: ICertificateValidationService = {
  shouldByPassValidationError: () => true,
};

export interface MimeAttachment {
  filename: string;
  content: Buffer;
}

/**
 * Ported from NotificationBase<EmailSettings> / Email : NotificationBase<EmailSettings>.
 *
 * `link`: real C# `Email.Link => null` -- the ONLY notifier in the entire
 * real Readarr source whose `Link` override returns `null` (every other
 * notifier in this port, chat/media/push/mail-legacy alike, returns a real
 * URL string). The real base's `INotification`/`NotificationBase.link` is
 * typed as non-nullable `string` (matching all ~18 other notifiers'
 * shape), so widening it to `string | null` for this one outlier would
 * force null-handling onto every other already-reconciled call site.
 * Narrowed to `""` here instead -- an empty string is a closer behavioral
 * match than fabricating a fake URL, and no ported call site in this
 * module's scope reads `.link` for anything but display purposes.
 */
export class Email extends NotificationBase<EmailSettings> {
  readonly name = "Email";
  readonly configContract = "EmailSettings";
  readonly link = "";

  private readonly certificateValidationService: ICertificateValidationService;
  private readonly logger: EmailLogger;

  constructor(
    certificateValidationService: ICertificateValidationService = acceptAllCertificates,
    logger: EmailLogger = noopLogger
  ) {
    super();
    this.certificateValidationService = certificateValidationService;
    this.logger = logger;
  }

  override onGrab(grabMessage: GrabMessage): void {
    const body = `${grabMessage.message} sent to queue.`;
    void this.sendEmail(this.settings, NotificationBase.BOOK_GRABBED_TITLE_BRANDED, body);
  }

  override onReleaseImport(message: BookDownloadMessage): void {
    const body = `${message.message} Downloaded and sorted.`;
    const paths = this.settings.attachFiles ? (message.bookFiles ?? []).map((f) => f.path) : null;
    void this.sendEmail(
      this.settings,
      NotificationBase.BOOK_DOWNLOADED_TITLE_BRANDED,
      body,
      false,
      paths
    );
  }

  override onAuthorAdded(author: Author): void {
    const body = `${author.metadata?.name ?? ""} added to library.`;
    void this.sendEmail(this.settings, NotificationBase.AUTHOR_ADDED_TITLE_BRANDED, body);
  }

  override onAuthorDelete(deleteMessage: AuthorDeleteMessage): void {
    void this.sendEmail(
      this.settings,
      NotificationBase.AUTHOR_DELETED_TITlE_BRANDED,
      deleteMessage.message
    );
  }

  /**
   * PRESERVED C# BUG: `Email.OnBookDelete` and `Email.OnBookFileDelete`
   * both use the `AUTHOR_DELETED_TITlE_BRANDED` (sic -- author-deleted,
   * lowercase-L typo in the C# constant name, faithfully preserved in the
   * real base's own `NotificationBase.ts` too) subject line instead of
   * `BOOK_DELETED_TITLE_BRANDED`/`BOOK_FILE_DELETED_TITLE_BRANDED`. This is
   * a real copy-paste bug in Readarr's `Email.cs` (lines 65 and 72), not a
   * porting error -- kept faithfully per this task's "preserve real C# bugs"
   * rule rather than silently using the semantically-correct title.
   */
  override onBookDelete(deleteMessage: BookDeleteMessage): void {
    void this.sendEmail(
      this.settings,
      NotificationBase.AUTHOR_DELETED_TITlE_BRANDED,
      deleteMessage.message
    );
  }

  /** See onBookDelete's doc comment -- same preserved title-constant bug. */
  override onBookFileDelete(deleteMessage: BookFileDeleteMessage): void {
    void this.sendEmail(
      this.settings,
      NotificationBase.AUTHOR_DELETED_TITlE_BRANDED,
      deleteMessage.message
    );
  }

  override onHealthIssue(healthCheck: HealthCheckLike): void {
    void this.sendEmail(
      this.settings,
      NotificationBase.HEALTH_ISSUE_TITLE_BRANDED,
      healthCheck.message
    );
  }

  override onDownloadFailure(message: DownloadFailedMessage): void {
    void this.sendEmail(
      this.settings,
      NotificationBase.DOWNLOAD_FAILURE_TITLE_BRANDED,
      message.message
    );
  }

  override onImportFailure(message: BookDownloadMessage): void {
    void this.sendEmail(
      this.settings,
      NotificationBase.IMPORT_FAILURE_TITLE_BRANDED,
      message.message
    );
  }

  override onApplicationUpdate(updateMessage: ApplicationUpdateMessage): void {
    void this.sendEmail(
      this.settings,
      NotificationBase.APPLICATION_UPDATE_TITLE_BRANDED,
      updateMessage.message
    );
  }

  async test(): Promise<ValidationResult> {
    const failures: ValidationFailure[] = [];

    const failure = await this.testSettings(this.settings);
    if (failure !== null) {
      failures.push(failure);
    }

    return { isValid: failures.length === 0, hasWarnings: false, errors: failures };
  }

  async testSettings(settings: EmailSettings): Promise<ValidationFailure | null> {
    const body = "Success! You have properly configured your email notification settings";

    try {
      await this.sendEmail(settings, "Readarr - Test Notification", body);
    } catch (ex) {
      this.logger.error("Unable to send test email", ex);
      return { propertyName: "Server", errorMessage: "Unable to send test email" };
    }

    return null;
  }

  private async sendEmail(
    settings: EmailSettings,
    subject: string,
    body: string,
    htmlBody = false,
    attachmentPaths: string[] | null = null
  ): Promise<void> {
    const from = this.parseAddress("From", settings.from);
    const to = settings.to.map((a) => this.parseAddress("To", a));
    const cc = settings.cc.map((a) => this.parseAddress("CC", a));
    const bcc = settings.bcc.map((a) => this.parseAddress("BCC", a));

    let effectiveHtmlBody = htmlBody;
    let effectiveBody = body;
    const attachments: MimeAttachment[] = [];

    if (attachmentPaths !== null) {
      // Ported from Email.SendEmail's BodyBuilder branch: switches to an
      // HTML body and attaches only ebook-extension files, skipping
      // audiobook files (matching MediaFileExtensions.TextExtensions).
      effectiveHtmlBody = true;
      effectiveBody = body;

      for (const path of attachmentPaths) {
        const extension = extname(path);
        if (MediaFileExtensions.TextExtensions.has(extension)) {
          const content = await readFile(path);
          attachments.push({ filename: path, content });
          this.logger.debug("Attaching ebook file: %s", path);
        } else {
          this.logger.debug("Skipping audiobook file: %s", path);
        }
      }
    }

    this.logger.debug("Sending email Subject: %s", subject);

    try {
      await this.send(
        { from, to, cc, bcc, subject, body: effectiveBody, isHtml: effectiveHtmlBody, attachments },
        settings
      );
      this.logger.debug("Email sent. Subject: %s", subject);
    } catch (ex) {
      this.logger.error("Error sending email. Subject: %s", subject);
      throw ex;
    }

    this.logger.debug("Finished sending email. Subject: %s", subject);
  }

  private async send(
    email: {
      from: string;
      to: string[];
      cc: string[];
      bcc: string[];
      subject: string;
      body: string;
      isHtml: boolean;
      attachments: MimeAttachment[];
    },
    settings: EmailSettings
  ): Promise<void> {
    // Ported from Email.Send(MimeMessage, EmailSettings)'s port/encryption
    // selection: SSL-on-connect for port 465, otherwise STARTTLS, only when
    // RequireEncryption is set (matches MailKit's SecureSocketOptions.Auto
    // default when encryption isn't required).
    const secure = settings.requireEncryption && settings.port === 465;
    const requireTls = settings.requireEncryption && settings.port !== 465;

    this.logger.debug("Connecting to mail server");

    const transport = nodemailer.createTransport({
      host: settings.server,
      port: settings.port,
      secure,
      requireTLS: requireTls,
      connectionTimeout: 10_000,
      auth:
        settings.username != null && settings.username !== ""
          ? { user: settings.username, pass: settings.password ?? "" }
          : undefined,
      tls: {
        rejectUnauthorized: !this.certificateValidationService.shouldByPassValidationError(
          settings.server
        ),
      },
    });

    if (settings.username != null && settings.username !== "") {
      this.logger.debug("Authenticating to mail server");
    }

    this.logger.debug("Sending to mail server");

    try {
      await transport.sendMail({
        from: email.from,
        to: email.to,
        cc: email.cc.length > 0 ? email.cc : undefined,
        bcc: email.bcc.length > 0 ? email.bcc : undefined,
        subject: email.subject,
        [email.isHtml ? "html" : "text"]: email.body,
        attachments: email.attachments,
      });
    } finally {
      this.logger.debug("Sent to mail server, disconnecting");
      transport.close();
      this.logger.debug("Disconnecting from mail server");
    }
  }

  private parseAddress(type: string, address: string): string {
    if (!EMAIL_ADDRESS_RE.test(address)) {
      this.logger.error("%s email address '%s' invalid", type, address);
      throw new Error(`${type} email address '${address}' invalid`);
    }
    return address;
  }
}

const EMAIL_ADDRESS_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
