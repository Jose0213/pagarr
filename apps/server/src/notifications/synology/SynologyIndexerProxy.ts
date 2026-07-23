import type { IProcessProvider } from "../ProcessProvider.js";
import { SynologyException } from "./SynologyException.js";

const SYNO_INDEX_PATH = "/usr/syno/bin/synoindex";

/** Minimal logger surface SynologyIndexerProxy needs, matching this port's per-module logger convention (see e.g. `indexers/indexerBase.ts`'s `IndexerLogger`). */
export interface SynologyIndexerProxyLogger {
  warn(message: string, ...args: unknown[]): void;
}

/** Ported from NzbDrone.Core/Notifications/Synology/SynologyIndexerProxy.cs. */
export interface ISynologyIndexerProxy {
  test(): Promise<boolean>;
  addFile(filepath: string): Promise<void>;
  deleteFile(filepath: string): Promise<void>;
  addFolder(folderpath: string): Promise<void>;
  deleteFolder(folderpath: string): Promise<void>;
  updateFolder(folderpath: string): Promise<void>;
  updateLibrary(): Promise<void>;
}

export class SynologyIndexerProxy implements ISynologyIndexerProxy {
  constructor(
    private readonly processProvider: IProcessProvider,
    private readonly logger: SynologyIndexerProxyLogger
  ) {}

  async test(): Promise<boolean> {
    try {
      await this.executeCommand("--help", false);
      return true;
    } catch (ex) {
      this.logger.warn("synoindex not available", ex);
      return false;
    }
  }

  async addFile(filePath: string): Promise<void> {
    await this.executeCommand("-a " + this.escape(filePath));
  }

  async deleteFile(filePath: string): Promise<void> {
    await this.executeCommand("-d " + this.escape(filePath));
  }

  async addFolder(folderPath: string): Promise<void> {
    await this.executeCommand("-A " + this.escape(folderPath));
  }

  async deleteFolder(folderPath: string): Promise<void> {
    await this.executeCommand("-D " + this.escape(folderPath));
  }

  async updateFolder(folderPath: string): Promise<void> {
    await this.executeCommand("-R " + this.escape(folderPath));
  }

  async updateLibrary(): Promise<void> {
    await this.executeCommand("-R video");
  }

  private async executeCommand(args: string, throwOnStdOut = true): Promise<void> {
    const output = await this.processProvider.startAndCapture(SYNO_INDEX_PATH, args);

    if (output.standard.length !== 0 && throwOnStdOut) {
      throw new SynologyException("synoindex returned an error: {0}", {
        args: [output.standard.map((l) => l.content).join("\n")],
      });
    }

    if (output.error.length !== 0) {
      throw new SynologyException("synoindex returned an error: {0}", {
        args: [output.error.map((l) => l.content).join("\n")],
      });
    }
  }

  private escape(arg: string): string {
    return `"${arg.replaceAll('"', '\\"')}"`;
  }
}
