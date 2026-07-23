import { describe, expect, it } from "vitest";
import { ProcessProvider } from "../ProcessProvider.js";

const isWindows = process.platform === "win32";

describe("ProcessProvider.startAndCapture", () => {
  it("captures stdout lines and a zero exit code for a successful command", async () => {
    const provider = new ProcessProvider();
    const cmd = isWindows ? "cmd" : "echo";
    const args = isWindows ? "/c echo hello" : "hello";

    const result = await provider.startAndCapture(cmd, args);

    expect(result.exitCode).toBe(0);
    expect(result.standard.some((l) => l.content.includes("hello"))).toBe(true);
    expect(result.error).toHaveLength(0);
  });

  it("reports a non-zero exit code without throwing", async () => {
    const provider = new ProcessProvider();
    const cmd = isWindows ? "cmd" : "sh";
    const args = isWindows ? "/c exit 3" : '-c "exit 3"';

    const result = await provider.startAndCapture(cmd, args);

    expect(result.exitCode).toBe(3);
  });

  it("passes environment variables through to the child process", async () => {
    const provider = new ProcessProvider();
    const cmd = isWindows ? "cmd" : "sh";
    const args = isWindows ? "/c echo %PAGARR_TEST_VAR%" : '-c "echo $PAGARR_TEST_VAR"';

    const result = await provider.startAndCapture(cmd, args, { PAGARR_TEST_VAR: "hello-env" });

    expect(result.standard.some((l) => l.content.includes("hello-env"))).toBe(true);
  });

  it("splits standard vs error output lines correctly", async () => {
    const provider = new ProcessProvider();
    const cmd = isWindows ? "cmd" : "sh";
    const args = isWindows ? "/c echo out&&echo err 1>&2" : '-c "echo out; echo err 1>&2"';

    const result = await provider.startAndCapture(cmd, args);

    expect(result.standard.some((l) => l.content.includes("out"))).toBe(true);
    expect(result.error.some((l) => l.content.includes("err"))).toBe(true);
  });
});
