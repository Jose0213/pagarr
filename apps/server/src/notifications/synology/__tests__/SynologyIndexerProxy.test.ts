import { describe, expect, it, vi } from "vitest";
import { SynologyIndexerProxy } from "../SynologyIndexerProxy.js";
import { SynologyException } from "../SynologyException.js";
import type { IProcessProvider, ProcessOutput } from "../../ProcessProvider.js";
import { noopLogger } from "../../__tests__/testFixtures.js";

function output(exitCode: number, standard: string[] = [], error: string[] = []): ProcessOutput {
  const lines = [
    ...standard.map((content) => ({ level: "standard" as const, content })),
    ...error.map((content) => ({ level: "error" as const, content })),
  ];
  return {
    exitCode,
    lines,
    get standard() {
      return lines.filter((l) => l.level === "standard");
    },
    get error() {
      return lines.filter((l) => l.level === "error");
    },
  };
}

function fakeProcessProvider(result: ProcessOutput): IProcessProvider {
  return { startAndCapture: vi.fn(async () => result) };
}

describe("SynologyIndexerProxy", () => {
  it("addFile quotes and escapes the path, passing -a", async () => {
    const provider = fakeProcessProvider(output(0));
    const proxy = new SynologyIndexerProxy(provider, noopLogger());

    await proxy.addFile('/music/Author "Weird" Name/book.mp3');

    expect(provider.startAndCapture).toHaveBeenCalledWith(
      "/usr/syno/bin/synoindex",
      '-a "/music/Author \\"Weird\\" Name/book.mp3"'
    );
  });

  it("test() returns true when --help succeeds with no output", async () => {
    const provider = fakeProcessProvider(output(0));
    const proxy = new SynologyIndexerProxy(provider, noopLogger());

    expect(await proxy.test()).toBe(true);
  });

  it("test() returns false and logs a warning when synoindex is unavailable", async () => {
    const provider: IProcessProvider = {
      startAndCapture: vi.fn(async () => {
        throw new Error("ENOENT");
      }),
    };
    const logger = noopLogger();
    const warnSpy = vi.spyOn(logger, "warn");
    const proxy = new SynologyIndexerProxy(provider, logger);

    expect(await proxy.test()).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("throws SynologyException when stdout has content (throwOnStdOut default true)", async () => {
    const provider = fakeProcessProvider(output(0, ["some unexpected output"]));
    const proxy = new SynologyIndexerProxy(provider, noopLogger());

    await expect(proxy.addFile("/x.mp3")).rejects.toThrow(SynologyException);
  });

  it("throws SynologyException when stderr has content", async () => {
    const provider = fakeProcessProvider(output(1, [], ["boom"]));
    const proxy = new SynologyIndexerProxy(provider, noopLogger());

    await expect(proxy.addFile("/x.mp3")).rejects.toThrow("synoindex returned an error");
  });

  it("test()'s --help call does not throw on stdout content (throwOnStdOut=false)", async () => {
    const provider = fakeProcessProvider(output(0, ["Usage: synoindex ..."]));
    const proxy = new SynologyIndexerProxy(provider, noopLogger());

    expect(await proxy.test()).toBe(true);
  });

  it("updateLibrary calls with '-R video' (hardcoded, no path)", async () => {
    const provider = fakeProcessProvider(output(0));
    const proxy = new SynologyIndexerProxy(provider, noopLogger());

    await proxy.updateLibrary();

    expect(provider.startAndCapture).toHaveBeenCalledWith("/usr/syno/bin/synoindex", "-R video");
  });
});
