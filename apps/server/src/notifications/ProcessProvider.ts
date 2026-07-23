import { exec, type ExecException } from "node:child_process";

/**
 * Forward-ref + local implementation for the narrow slice of
 * NzbDrone.Common/Processes/ProcessProvider.cs (`IProcessProvider`) this
 * module's two process-spawning notifiers (Synology's `synoindex` CLI calls,
 * CustomScript's arbitrary script execution) actually use: `StartAndCapture`.
 * `NzbDrone.Common.Processes` is a large (~15-method) cross-cutting module
 * covering process enumeration/kill/priority/pidfiles that belongs to a
 * dedicated Common port, not this one -- narrowed the same way
 * `root-folders/disk-provider.ts`'s doc comment narrows `IDiskProvider` to
 * only the methods its own module needs.
 *
 * DEVIATION -- argument passing: C#'s `ProcessStartInfo(path, args)` takes
 * `args` as a single raw command-line string that the OS's process-creation
 * API (Win32 `CreateProcess`, or .NET's own POSIX argv splitter on
 * Linux/macOS) tokenizes itself, honoring platform-specific quoting rules.
 * Node's `child_process.execFile` wants a pre-split `argv` array, not a raw
 * string, and treats its first argument as a literal executable path even
 * under `shell: true` (verified against Node's own `execFile` overload
 * signatures) -- it does NOT hand a combined command line to the shell the
 * way `exec` does. This port therefore uses `child_process.exec` instead,
 * passing the combined `"${path}" ${args}` command line as a single string
 * for the platform shell (`cmd.exe` / `/bin/sh`, `exec`'s default behavior,
 * no extra option needed) to tokenize -- the same practical effect (the
 * caller supplies one pre-quoted string, the OS splits it) with well-tested
 * splitting semantics, at the cost of shell metacharacters in `args` being
 * interpreted by the shell rather than passed through literally. Both real
 * callers in this module's scope (SynologyIndexerProxy, which builds its own
 * quoted argument string via `Escape()`, and CustomScript, whose settings
 * validator forbids `Arguments` entirely) already assume shell-style
 * quoting/escaping is happening somewhere in the pipeline, so this is a
 * faithful behavioral match, not just a convenient substitute.
 */
export interface ProcessOutputLine {
  level: "standard" | "error";
  content: string;
}

export interface ProcessOutput {
  exitCode: number;
  lines: ProcessOutputLine[];
  readonly standard: ProcessOutputLine[];
  readonly error: ProcessOutputLine[];
}

function makeProcessOutput(exitCode: number, lines: ProcessOutputLine[]): ProcessOutput {
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

export interface IProcessProvider {
  startAndCapture(
    path: string,
    args?: string | null,
    environmentVariables?: Record<string, string> | null
  ): Promise<ProcessOutput>;
}

export class ProcessProvider implements IProcessProvider {
  async startAndCapture(
    path: string,
    args: string | null = null,
    environmentVariables: Record<string, string> | null = null
  ): Promise<ProcessOutput> {
    const lines: ProcessOutputLine[] = [];

    const exitCode = await new Promise<number>((resolve, reject) => {
      const child = exec(
        args ? `"${path}" ${args}` : `"${path}"`,
        {
          env: environmentVariables ? { ...process.env, ...environmentVariables } : process.env,
          windowsHide: true,
        },
        (error: ExecException | null) => {
          if (error && typeof error.code !== "number") {
            // Process failed to even spawn (ENOENT etc) -- no exit code to report.
            reject(error);
            return;
          }

          resolve(typeof error?.code === "number" ? error.code : 0);
        }
      );

      child.stdout?.on("data", (chunk: Buffer) => {
        for (const line of splitLines(chunk.toString("utf8"))) {
          lines.push({ level: "standard", content: line });
        }
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        for (const line of splitLines(chunk.toString("utf8"))) {
          lines.push({ level: "error", content: line });
        }
      });
    });

    return makeProcessOutput(exitCode, lines);
  }
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/).filter((l) => l.trim() !== "");
}
