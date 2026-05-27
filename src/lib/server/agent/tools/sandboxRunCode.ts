import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import { SandboxManager, type SandboxRuntimeConfig } from '@anthropic-ai/sandbox-runtime';
import { StringEnum, Type } from '@earendil-works/pi-ai';
import { defineTool } from '@earendil-works/pi-coding-agent';

const LANGUAGE_VALUES = ['python', 'javascript'] as const;
const DEFAULT_TIMEOUT_SECONDS = 15;
const MAX_TIMEOUT_SECONDS = 60;
const MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_CODE_BYTES = 256 * 1024;
const MAX_STDIN_BYTES = 256 * 1024;
const MAX_PACKAGE_COUNT = 20;
const MAX_PACKAGE_SPEC_LENGTH = 120;
const SAFE_PACKAGE_SPEC_REGEX = /^[A-Za-z0-9@._/+:[\],<>=!~^-]+$/;
const UNSAFE_PACKAGE_SPEC_PARTS = ['file:', 'link:', 'workspace:', 'git+', 'ssh:', 'http:', 'https:'];

export type SandboxRunLanguage = (typeof LANGUAGE_VALUES)[number];

export type SandboxRunCodeInput = {
	language: SandboxRunLanguage;
	code: string;
	stdin?: string;
	packages?: string[];
	timeoutSeconds?: number;
};

export type SandboxRunCodeDetails = {
	ok: boolean;
	language: SandboxRunLanguage;
	exitCode: number | null;
	signal: string | null;
	timedOut: boolean;
	aborted: boolean;
	durationMs: number;
	stdout: string;
	stderr: string;
	stdoutTruncated: boolean;
	stderrTruncated: boolean;
	packages: string[];
	error?: string;
	hostPlatform: NodeJS.Platform;
};

type SandboxManagerLike = Pick<
	typeof SandboxManager,
	'checkDependencies' | 'initialize' | 'reset' | 'wrapWithSandbox'
>;

type SpawnFn = typeof spawn;

type SandboxRunCodeDependencies = {
	platform?: NodeJS.Platform;
	sandboxManager?: SandboxManagerLike;
	spawn?: SpawnFn;
	now?: () => number;
};

type ProcessResult = {
	exitCode: number | null;
	signal: string | null;
	timedOut: boolean;
	aborted: boolean;
	stdout: TruncatedOutputSnapshot;
	stderr: TruncatedOutputSnapshot;
	error?: string;
};

type TruncatedOutputSnapshot = {
	text: string;
	truncated: boolean;
	totalBytes: number;
	outputBytes: number;
};

export const SANDBOX_RUN_CODE_TOOL_NAME = 'sandbox_run_code';

export const SANDBOX_ALLOWED_DOMAINS = [
	'npmjs.org',
	'*.npmjs.org',
	'registry.npmjs.org',
	'registry.yarnpkg.com',
	'pypi.org',
	'*.pypi.org',
	'files.pythonhosted.org',
	'*.pythonhosted.org',
	'github.com',
	'*.github.com',
	'api.github.com',
	'raw.githubusercontent.com'
];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function byteLength(value: string): number {
	return Buffer.byteLength(value, 'utf8');
}

function normalizeTimeoutSeconds(value: unknown): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_TIMEOUT_SECONDS;
	return Math.min(MAX_TIMEOUT_SECONDS, Math.max(1, Math.round(value)));
}

function assertBoundedString(value: unknown, key: string, maxBytes: number): string {
	if (typeof value !== 'string') throw new Error(`${key} is required`);
	if (byteLength(value) > maxBytes) throw new Error(`${key} is too large`);
	return value;
}

function normalizePackages(value: unknown): string[] {
	if (value === undefined) return [];
	if (!Array.isArray(value)) throw new Error('packages must be an array');
	if (value.length > MAX_PACKAGE_COUNT) throw new Error(`packages can include at most ${MAX_PACKAGE_COUNT} items`);

	const packages: string[] = [];
	const seen = new Set<string>();
	for (const item of value) {
		if (typeof item !== 'string') throw new Error('packages must contain strings');
		const trimmed = item.trim();
		if (!trimmed) continue;
		if (trimmed.length > MAX_PACKAGE_SPEC_LENGTH) throw new Error(`package spec is too long: ${trimmed}`);
		if (trimmed.startsWith('-') || isUnsafePackageSpec(trimmed) || !SAFE_PACKAGE_SPEC_REGEX.test(trimmed)) {
			throw new Error(`package spec is not allowed: ${trimmed}`);
		}
		if (!seen.has(trimmed)) {
			seen.add(trimmed);
			packages.push(trimmed);
		}
	}
	return packages;
}

function isUnsafePackageSpec(packageSpec: string): boolean {
	const lower = packageSpec.toLowerCase();
	return (
		packageSpec.startsWith('/') ||
		packageSpec.startsWith('\\') ||
		packageSpec.includes('..') ||
		UNSAFE_PACKAGE_SPEC_PARTS.some((part) => lower.includes(part))
	);
}

export function normalizeSandboxRunCodeInput(params: unknown): SandboxRunCodeInput {
	if (!isRecord(params)) throw new Error('sandbox_run_code parameters are required');
	const language = params.language;
	if (language !== 'python' && language !== 'javascript') {
		throw new Error('language must be python or javascript');
	}

	return {
		language,
		code: assertBoundedString(params.code, 'code', MAX_CODE_BYTES),
		stdin:
			params.stdin === undefined
				? ''
				: assertBoundedString(params.stdin, 'stdin', MAX_STDIN_BYTES),
		packages: normalizePackages(params.packages),
		timeoutSeconds: normalizeTimeoutSeconds(params.timeoutSeconds)
	};
}

export function isSupportedSandboxHost(platform: NodeJS.Platform): boolean {
	return platform === 'darwin' || platform === 'linux';
}

function sandboxUnavailableDetails(
	language: SandboxRunLanguage,
	packages: string[],
	hostPlatform: NodeJS.Platform,
	error: string
): SandboxRunCodeDetails {
	return {
		ok: false,
		language,
		exitCode: null,
		signal: null,
		timedOut: false,
		aborted: false,
		durationMs: 0,
		stdout: '',
		stderr: '',
		stdoutTruncated: false,
		stderrTruncated: false,
		packages,
		error,
		hostPlatform
	};
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function buildSandboxCommand(input: SandboxRunCodeInput): string {
	const quotedPackages = input.packages?.map(shellQuote) ?? [];

	if (input.language === 'python') {
		return [
			'set -e',
			'mkdir -p .home .pip-cache python-packages',
			'if command -v python3 >/dev/null 2>&1; then PYTHON_BIN=python3; elif command -v python >/dev/null 2>&1; then PYTHON_BIN=python; else echo "Python interpreter not found" >&2; exit 127; fi',
			...(quotedPackages.length > 0
				? [
						`"$PYTHON_BIN" -m pip install --disable-pip-version-check --no-input --target python-packages ${quotedPackages.join(
							' '
						)}`
					]
				: []),
			'PYTHONPATH="$PWD/python-packages${PYTHONPATH:+:$PYTHONPATH}" "$PYTHON_BIN" main.py'
		].join('\n');
	}

	return [
		'set -e',
		'mkdir -p .home .npm-cache',
		'if ! command -v node >/dev/null 2>&1; then echo "Node.js runtime not found" >&2; exit 127; fi',
		...(quotedPackages.length > 0
			? [
					'if ! command -v npm >/dev/null 2>&1; then echo "npm is required to install JavaScript packages" >&2; exit 127; fi',
					`npm install --ignore-scripts --no-audit --no-fund --package-lock=false ${quotedPackages.join(
						' '
					)}`
				]
			: []),
		'node main.mjs'
	].join('\n');
}

function sandboxConfig(workDir: string): SandboxRuntimeConfig {
	const appRoot = process.cwd();
	const hostHome = homedir();
	const envFiles = [
		'.env',
		'.env.local',
		'.env.development',
		'.env.production',
		'.env.test',
		'.env.*'
	];

	return {
		network: {
			allowedDomains: SANDBOX_ALLOWED_DOMAINS,
			deniedDomains: [],
			allowUnixSockets: [],
			allowAllUnixSockets: false,
			allowLocalBinding: false
		},
		// The tool receives code/stdin explicitly, so snippets do not need the app checkout.
		filesystem: {
			denyRead: [
				...(appRoot === '/' ? [] : [appRoot]),
				'~/.ssh',
				'~/.aws',
				'~/.gnupg',
				...envFiles.flatMap((file) => [file, join(appRoot, file)])
			],
			allowWrite: [workDir],
			denyWrite: [
				...envFiles,
				'/tmp/claude',
				'/private/tmp/claude',
				join(hostHome, '.npm/_logs'),
				join(hostHome, '.claude/debug')
			]
		},
		enableWeakerNestedSandbox: false,
		allowPty: false
	};
}

function sandboxEnv(workDir: string): NodeJS.ProcessEnv {
	return {
		PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
		HOME: join(workDir, '.home'),
		TMPDIR: workDir,
		TEMP: workDir,
		TMP: workDir,
		LANG: process.env.LANG ?? 'C.UTF-8',
		LC_ALL: process.env.LC_ALL ?? 'C.UTF-8',
		NO_COLOR: '1',
		CI: '1',
		PYTHONUNBUFFERED: '1',
		PIP_CACHE_DIR: join(workDir, '.pip-cache'),
		npm_config_cache: join(workDir, '.npm-cache'),
		npm_config_update_notifier: 'false',
		npm_config_audit: 'false',
		npm_config_fund: 'false'
	};
}

class TruncatedOutput {
	private readonly chunks: Buffer[] = [];
	private keptBytes = 0;
	private totalBytes = 0;

	append(chunk: Buffer | string) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		this.totalBytes += buffer.length;
		this.chunks.push(buffer);
		this.keptBytes += buffer.length;

		while (this.keptBytes > MAX_OUTPUT_BYTES && this.chunks.length > 0) {
			const first = this.chunks[0];
			const overflow = this.keptBytes - MAX_OUTPUT_BYTES;
			if (first.length <= overflow) {
				this.chunks.shift();
				this.keptBytes -= first.length;
			} else {
				this.chunks[0] = first.subarray(overflow);
				this.keptBytes -= overflow;
			}
		}
	}

	snapshot(): TruncatedOutputSnapshot {
		const truncated = this.totalBytes > this.keptBytes;
		const text = Buffer.concat(this.chunks, this.keptBytes).toString('utf8');
		return {
			text: truncated ? `[truncated ${this.totalBytes - this.keptBytes} bytes]\n${text}` : text,
			truncated,
			totalBytes: this.totalBytes,
			outputBytes: this.keptBytes
		};
	}
}

function killProcessTree(child: ReturnType<SpawnFn>, platform: NodeJS.Platform) {
	if (!child.pid) {
		child.kill('SIGKILL');
		return;
	}

	if (platform !== 'win32') {
		try {
			process.kill(-child.pid, 'SIGKILL');
			return;
		} catch {
			child.kill('SIGKILL');
			return;
		}
	}

	child.kill('SIGKILL');
}

function runProcess(input: {
	command: string;
	cwd: string;
	stdin: string;
	timeoutSeconds: number;
	env: NodeJS.ProcessEnv;
	signal?: AbortSignal;
	spawnFn: SpawnFn;
	platform: NodeJS.Platform;
}): Promise<ProcessResult> {
	return new Promise((resolve) => {
		const stdout = new TruncatedOutput();
		const stderr = new TruncatedOutput();
		let settled = false;
		let timedOut = false;
		let aborted = input.signal?.aborted === true;

		const finish = (result: Omit<ProcessResult, 'stdout' | 'stderr'>) => {
			if (settled) return;
			settled = true;
			if (timeoutHandle) clearTimeout(timeoutHandle);
			input.signal?.removeEventListener('abort', onAbort);
			resolve({
				...result,
				stdout: stdout.snapshot(),
				stderr: stderr.snapshot()
			});
		};

		const child = input.spawnFn('bash', ['-c', input.command], {
			cwd: input.cwd,
			detached: input.platform !== 'win32',
			env: input.env,
			stdio: ['pipe', 'pipe', 'pipe'],
			windowsHide: true
		});

		const onAbort = () => {
			aborted = true;
			killProcessTree(child, input.platform);
		};

		const timeoutHandle = setTimeout(() => {
			timedOut = true;
			killProcessTree(child, input.platform);
		}, input.timeoutSeconds * 1000);

		child.stdout?.on('data', (chunk: Buffer) => stdout.append(chunk));
		child.stderr?.on('data', (chunk: Buffer) => stderr.append(chunk));
		child.on('error', (error) => {
			finish({
				exitCode: null,
				signal: null,
				timedOut,
				aborted,
				error: error instanceof Error ? error.message : 'Unable to start code process'
			});
		});
		child.on('close', (exitCode, signal) => {
			finish({
				exitCode,
				signal,
				timedOut,
				aborted
			});
		});

		if (input.signal && !input.signal.aborted) {
			input.signal.addEventListener('abort', onAbort, { once: true });
		}
		if (aborted) onAbort();

		child.stdin?.end(input.stdin);
	});
}

let sandboxQueue: Promise<void> = Promise.resolve();

function withSandboxQueue<T>(task: () => Promise<T>): Promise<T> {
	const run = sandboxQueue.then(task, task);
	sandboxQueue = run.then(
		() => undefined,
		() => undefined
	);
	return run;
}

async function prepareWorkDir(input: SandboxRunCodeInput): Promise<string> {
	const workDir = await mkdtemp(join(tmpdir(), 'personachat-sandbox-'));
	await mkdir(join(workDir, '.home'), { recursive: true });
	await mkdir(join(workDir, '.pip-cache'), { recursive: true });
	await mkdir(join(workDir, '.npm-cache'), { recursive: true });
	await writeFile(
		join(workDir, input.language === 'python' ? 'main.py' : 'main.mjs'),
		input.code,
		'utf8'
	);
	return workDir;
}

async function runSandboxedCode(
	input: SandboxRunCodeInput,
	dependencies: SandboxRunCodeDependencies = {},
	signal?: AbortSignal
): Promise<SandboxRunCodeDetails> {
	const hostPlatform = dependencies.platform ?? process.platform;
	const sandboxManager = dependencies.sandboxManager ?? SandboxManager;
	const spawnFn = dependencies.spawn ?? spawn;
	const now = dependencies.now ?? Date.now;

	if (!isSupportedSandboxHost(hostPlatform)) {
		return sandboxUnavailableDetails(
			input.language,
			input.packages ?? [],
			hostPlatform,
			`Sandboxed code execution is only supported on Linux/macOS hosts. This server is running ${hostPlatform}.`
		);
	}

	if (!sandboxManager.checkDependencies()) {
		return sandboxUnavailableDetails(
			input.language,
			input.packages ?? [],
			hostPlatform,
			hostPlatform === 'linux'
				? 'Sandbox dependencies are missing. Linux requires ripgrep (rg), bubblewrap (bwrap), and socat.'
				: 'Sandbox dependencies are missing. macOS requires ripgrep (rg).'
		);
	}

	let workDir: string | undefined;
	let initialized = false;
	const start = now();

	try {
		workDir = await prepareWorkDir(input);
		await sandboxManager.initialize(sandboxConfig(workDir));
		initialized = true;
		const command = buildSandboxCommand(input);
		const sandboxedCommand = await sandboxManager.wrapWithSandbox(command);
		const result = await runProcess({
			command: sandboxedCommand,
			cwd: workDir,
			stdin: input.stdin ?? '',
			timeoutSeconds: input.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS,
			env: sandboxEnv(workDir),
			signal,
			spawnFn,
			platform: hostPlatform
		});
		const durationMs = Math.max(0, now() - start);
		const error =
			result.error ??
			(result.timedOut
				? `Code execution timed out after ${input.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS} seconds`
				: result.aborted
					? 'Code execution aborted'
					: undefined);

		return {
			ok: result.exitCode === 0 && !result.timedOut && !result.aborted && !result.error,
			language: input.language,
			exitCode: result.exitCode,
			signal: result.signal,
			timedOut: result.timedOut,
			aborted: result.aborted,
			durationMs,
			stdout: result.stdout.text,
			stderr: result.stderr.text,
			stdoutTruncated: result.stdout.truncated,
			stderrTruncated: result.stderr.truncated,
			packages: input.packages ?? [],
			...(error ? { error } : {}),
			hostPlatform
		};
	} catch (error) {
		return sandboxUnavailableDetails(
			input.language,
			input.packages ?? [],
			hostPlatform,
			error instanceof Error ? error.message : 'Sandboxed code execution failed'
		);
	} finally {
		if (initialized) {
			try {
				await sandboxManager.reset();
			} catch {
				// Best-effort cleanup; the per-call temp directory cleanup still runs below.
			}
		}
		if (workDir) {
			await rm(workDir, { recursive: true, force: true });
		}
	}
}

export async function executeSandboxRunCode(
	params: unknown,
	dependencies: SandboxRunCodeDependencies = {},
	signal?: AbortSignal
): Promise<SandboxRunCodeDetails> {
	const input = normalizeSandboxRunCodeInput(params);
	return withSandboxQueue(() => runSandboxedCode(input, dependencies, signal));
}

function contentText(details: SandboxRunCodeDetails): string {
	return JSON.stringify(details, null, 2);
}

export const sandboxRunCodeTool = defineTool({
	name: SANDBOX_RUN_CODE_TOOL_NAME,
	label: 'Sandbox Run Code',
	description:
		'Runs short Python or JavaScript code in an OS-level sandbox and returns stdout, stderr, and exit metadata.',
	promptSnippet:
		'sandbox_run_code: execute short Python or JavaScript snippets for calculations, data transforms, or package-backed analysis. Use stdout for final computed values.',
	parameters: Type.Object(
		{
			language: StringEnum(LANGUAGE_VALUES, {
				description: 'Runtime to use for the snippet.'
			}),
			code: Type.String({
				description: 'Python or JavaScript source code to run.'
			}),
			stdin: Type.Optional(
				Type.String({
					description: 'Optional text passed to the program on stdin.'
				})
			),
			packages: Type.Optional(
				Type.Array(
					Type.String({
						description: 'Optional npm or pip package spec to install in the temporary workspace.'
					})
				)
			),
			timeoutSeconds: Type.Optional(
				Type.Number({
					description: `Execution timeout in seconds. Defaults to ${DEFAULT_TIMEOUT_SECONDS}, maximum ${MAX_TIMEOUT_SECONDS}.`
				})
			)
		},
		{ additionalProperties: false }
	),
	executionMode: 'sequential',
	async execute(_toolCallId, params, signal, onUpdate) {
		const normalized = normalizeSandboxRunCodeInput(params);
		onUpdate?.({
			content: [
				{
					type: 'text',
					text: `Running ${normalized.language} code in a sandbox...`
				}
			],
			details: { language: normalized.language, status: 'running' }
		});
		const details = await executeSandboxRunCode(normalized, {}, signal);
		return {
			content: [{ type: 'text', text: contentText(details) }],
			details
		};
	}
});
