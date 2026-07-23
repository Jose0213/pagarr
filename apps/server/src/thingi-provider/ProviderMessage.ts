/**
 * Ported from NzbDrone.Core/ThingiProvider/ProviderMessage.cs.
 */
export enum ProviderMessageType {
  Info = "Info",
  Warning = "Warning",
  Error = "Error",
}

export class ProviderMessage {
  message: string;
  type: ProviderMessageType;

  constructor(message: string, type: ProviderMessageType) {
    this.message = message;
    this.type = type;
  }
}
