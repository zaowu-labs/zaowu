import { constants } from 'node:fs';
import { access, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { readBoundedFile } from '@zaowu-labs/core';
import type { DoctorCheck } from './root-doctor.js';
import type { CommandRunner } from './types.js';

const SW_VERS = '/usr/bin/sw_vers';
const ARCH = '/usr/bin/arch';
const SYSCTL = '/usr/sbin/sysctl';
const XCODE_SELECT = '/usr/bin/xcode-select';
const APPLE_GIT = '/usr/bin/git';
const ARM_BREW = '/opt/homebrew/bin/brew';
const INTEL_BREW = '/usr/local/bin/brew';

export const MAC_DOCTOR_PROBES = [
  `${SW_VERS} -productVersion`,
  `${ARCH} -x86_64 ${SYSCTL} -in sysctl.proc_translated`,
  `${XCODE_SELECT} -p`,
];

interface Executable {
  path: string;
  target: string;
}

const executableAt = async (candidate: string): Promise<Executable | undefined> => {
  try {
    const target = await realpath(candidate);
    if (!(await stat(target)).isFile()) return undefined;
    await access(target, constants.X_OK);
    return { path: candidate, target };
  } catch {
    return undefined;
  }
};

const findExecutable = async (
  name: string,
  cwd: string,
  searchPath: string
): Promise<Executable | undefined> => {
  for (const directory of searchPath.split(path.delimiter)) {
    const executable = await executableAt(path.resolve(cwd, directory, name));
    if (executable) return executable;
  }
  return undefined;
};

const readDiagnostic = (
  run: CommandRunner,
  command: string,
  args: string[]
): string | undefined => {
  try {
    return run(command, args, { timeout: 5_000 }).trim();
  } catch {
    return undefined;
  }
};

const checkRuntime = (
  run: CommandRunner,
  architecture: NodeJS.Architecture,
  nodePath: string
): DoctorCheck => {
  const version = readDiagnostic(run, SW_VERS, ['-productVersion']);
  const translation =
    architecture === 'x64'
      ? readDiagnostic(run, ARCH, ['-x86_64', SYSCTL, '-in', 'sysctl.proc_translated'])
      : undefined;
  const translated = translation === '1';
  const hardware =
    architecture === 'arm64' || translated
      ? 'Apple Silicon'
      : translation === '0' || translation === ''
        ? 'Intel Mac'
        : undefined;
  return {
    name: 'macOS',
    status: translated ? 'warning' : 'ok',
    required: false,
    version: version && /^\d+(?:\.\d+)+$/.test(version) ? version : undefined,
    details: [hardware, `Node.js ${architecture}${translated ? ' via Rosetta' : ''}`, nodePath]
      .filter(Boolean)
      .join(' · '),
    fix: translated
      ? 'Open a native Apple Silicon terminal and select an arm64 Node.js. Verify with `node -p process.arch`.'
      : undefined,
  };
};

const checkHomebrew = async (
  brew: Executable | undefined,
  architecture: NodeJS.Architecture
): Promise<DoctorCheck> => {
  const expected = architecture === 'arm64' ? ARM_BREW : INTEL_BREW;
  const shellSetup = `Run \`eval "$(${expected} shellenv)"\` for this session.`;
  if (!brew) {
    const installed = await executableAt(expected);
    return {
      name: 'Homebrew',
      status: installed ? 'warning' : 'missing',
      required: false,
      details: installed ? `${installed.path} is outside PATH` : 'optional on macOS',
      fix: installed ? shellSetup : undefined,
    };
  }
  const armPrefix = brew.target.startsWith('/opt/homebrew/');
  const intelPrefix = brew.target === INTEL_BREW || brew.target.startsWith('/usr/local/Homebrew/');
  const mismatched = architecture === 'arm64' ? intelPrefix : armPrefix;
  const compatible = mismatched ? await executableAt(expected) : undefined;
  return {
    name: 'Homebrew',
    status: mismatched ? 'warning' : 'ok',
    required: false,
    details: brew.path,
    fix: mismatched
      ? `Check Homebrew PATH order for Node.js ${architecture}.${compatible ? ` ${shellSetup}` : ''}`
      : undefined,
  };
};

const readCliVersion = async (target: string): Promise<string | undefined> => {
  const directory = path.dirname(target);
  if (path.basename(directory) !== 'dist' || path.basename(target) !== 'index.js') return undefined;
  const error = {
    code: 'INTERNAL_ERROR',
    message: 'Could not inspect ZaoWu package metadata.',
    why: 'The package manifest is unavailable.',
    fix: 'Check the installed ZaoWu package.',
  } as const;
  try {
    const manifest = JSON.parse(
      (
        await readBoundedFile(path.join(directory, '..', 'package.json'), 64 * 1024, {
          failed: error,
          tooLarge: error,
        })
      ).toString('utf8')
    ) as { name?: unknown; version?: unknown };
    if (manifest.name === '@zaowu-labs/cli' && typeof manifest.version === 'string') {
      return /^\d+\.\d+\.\d+(?:[-+][\w.+-]+)?$/.test(manifest.version)
        ? manifest.version
        : undefined;
    }
  } catch {
    // Executable shims and unreadable metadata still have useful PATH information.
  }
  return undefined;
};

const checkCliOnPath = async (
  cli: Executable | undefined,
  runningVersion: string
): Promise<DoctorCheck> => {
  const version = cli && (await readCliVersion(cli.target));
  const mismatch = version !== undefined && version !== runningVersion;
  return {
    name: 'zw on PATH',
    status: cli ? (mismatch ? 'warning' : 'ok') : 'missing',
    required: false,
    version,
    details: cli
      ? `${cli.path}${mismatch ? ` · running build ${runningVersion}` : ''}`
      : 'direct invocation is available',
    fix: mismatch
      ? 'Run `type -a zw` in your shell and use the installation you intended.'
      : undefined,
  };
};

export const checkAppleGit = async (
  target: string | undefined,
  run: CommandRunner
): Promise<DoctorCheck | undefined> => {
  if (target !== APPLE_GIT) return undefined;
  const developerDirectory = readDiagnostic(run, XCODE_SELECT, ['-p']);
  if (
    developerDirectory &&
    path.isAbsolute(developerDirectory) &&
    (await executableAt(path.join(developerDirectory, 'usr', 'bin', 'git')))
  )
    return undefined;
  return {
    name: 'Git',
    status: 'missing',
    details: 'Apple Command Line Tools or Xcode required for /usr/bin/git',
    fix: 'Run `xcode-select --install`, or put an independently installed Git on PATH.',
  };
};

export const checkMacEnvironment = async (options: {
  cwd: string;
  searchPath: string;
  architecture: NodeJS.Architecture;
  nodePath: string;
  runningVersion: string;
  commandRunner: CommandRunner;
}) => {
  const { cwd, searchPath, architecture, nodePath, runningVersion, commandRunner } = options;
  const [git, brew, cli] = await Promise.all(
    ['git', 'brew', 'zw'].map((name) => findExecutable(name, cwd, searchPath))
  );
  const [gitCheck, homebrew, pathCheck] = await Promise.all([
    checkAppleGit(git?.target, commandRunner),
    checkHomebrew(brew, architecture),
    checkCliOnPath(cli, runningVersion),
  ]);
  return {
    gitCheck,
    checks: [checkRuntime(commandRunner, architecture, nodePath), homebrew, pathCheck],
  };
};
