import type {
  IProviderConfig,
  ValidationFailure,
  ValidationResult,
} from "../../thingi-provider/index.js";

/**
 * Ported from NzbDrone.Core/Notifications/Telegram/TelegramSettings.cs.
 *
 * DEVIATION -- validation: same FluentValidation-to-plain-function
 * deviation documented on `discord/DiscordSettings.ts`.
 */
export interface TelegramSettings extends IProviderConfig {
  botToken: string;
  chatId: string;
  /** Ported from `int? TopicId`. Null/undefined means "general topic". */
  topicId: number | null;
  sendSilently: boolean;
}

export function createTelegramSettings(
  overrides: Partial<TelegramSettings> = {}
): TelegramSettings {
  return {
    botToken: "",
    chatId: "",
    topicId: null,
    sendSilently: false,
    validate(): ValidationResult {
      return validateTelegramSettings(this);
    },
    ...overrides,
  };
}

/** Ported from TelegramSettingsValidator. */
export function validateTelegramSettings(settings: TelegramSettings): ValidationResult {
  const errors: ValidationFailure[] = [];

  if (!settings.botToken || settings.botToken.trim() === "") {
    errors.push({ propertyName: "BotToken", errorMessage: "'Bot Token' must not be empty." });
  }

  if (!settings.chatId || settings.chatId.trim() === "") {
    errors.push({ propertyName: "ChatId", errorMessage: "'Chat ID' must not be empty." });
  }

  // Ported from `.Must(topicId => !topicId.HasValue || topicId > 1)`.
  if (settings.topicId !== null && settings.topicId !== undefined && !(settings.topicId > 1)) {
    errors.push({
      propertyName: "TopicId",
      errorMessage: "Topic ID must be greater than 1 or empty",
    });
  }

  return {
    isValid: errors.length === 0,
    hasWarnings: false,
    errors,
  };
}
