/** Ported from NzbDrone.Core/Notifications/SendGrid/SendGridPayload.cs. */

export interface SendGridContent {
  type: string;
  value: string;
}

export interface SendGridEmail {
  email: string;
}

export interface SendGridPersonalization {
  to: SendGridEmail[];
  subject: string;
}

export interface SendGridPayload {
  content: SendGridContent[];
  from: SendGridEmail | null;
  personalizations: SendGridPersonalization[];
}

/** Ported from SendGridPayload's parameterless constructor (initializes the two list fields). */
export function createSendGridPayload(): SendGridPayload {
  return {
    content: [],
    from: null,
    personalizations: [],
  };
}

/** Ported from SendGridPersonalization's parameterless constructor. */
export function createSendGridPersonalization(): SendGridPersonalization {
  return {
    to: [],
    subject: "",
  };
}

/** Ported from NzbDrone.Core/Notifications/SendGrid/SendGridPayload.cs's SendGridSenderResponse/SendGridSender (unused by this worktree's ported code paths, kept for shape fidelity). */
export interface SendGridSender {
  from: SendGridEmail;
  nickname: string;
}

export interface SendGridSenderResponse {
  result: SendGridSender[];
}
