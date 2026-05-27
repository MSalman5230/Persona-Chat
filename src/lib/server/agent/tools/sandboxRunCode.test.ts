import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import {
	buildSandboxCommand,
	executeSandboxRunCode,
	isSupportedSandboxHost,
	normalizeSandboxRunCodeInput,
	SANDBOX_ALLOWED_DOMAINS
} from './sandboxRunCode';

function sandboxManagerMock() {
	return {
		checkDependencies: vi.fn(() => true),
		initialize: vi.fn(async () => undefined),
		reset: vi.fn(async () => undefined),
		wrapWithSandbox: vi.fn(async () => 'wrapped command')
	};
}

function spawnMock(options: {
	stdout?: string;
	stderr?: string;
	exitCode?: number;
	signal?: string | null;
}) {
	return vi.fn(() => {
		const child = new EventEmitter() as EventEmitter & {
			pid: number;
			stdout: EventEmitter;
			stderr: EventEmitter;
			stdin: Writable;
			kill: ReturnType<typeof vi.fn>;
		};
		child.pid = 1234;
		child.stdout = new EventEmitter();
		child.stderr = new EventEmitter();
		child.stdin = new Writable({
			write(_chunk, _encoding, callback) {
				callback();
			}
		});
		child.kill = vi.fn();

		setImmediate(() => {
			if (options.stdout) child.stdout.emit('data', Buffer.from(options.stdout));
			if (options.stderr) child.stderr.emit('data', Buffer.from(options.stderr));
			child.emit('close', options.exitCode ?? 0, options.signal ?? null);
		});

		return child;
	});
}

describe('sandbox_run_code tool helpers', () => {
	it('normalizes input, deduplicates packages, and clamps timeout', () => {
		expect(
			normalizeSandboxRunCodeInput({
				language: 'python',
				code: 'print(1)',
				stdin: 'input',
				packages: [' pandas==2.2.0 ', 'pandas==2.2.0', 'requests>=2,<3'],
				timeoutSeconds: 999
			})
		).toEqual({
			language: 'python',
			code: 'print(1)',
			stdin: 'input',
			packages: ['pandas==2.2.0', 'requests>=2,<3'],
			timeoutSeconds: 60
		});
	});

	it('rejects unsafe package specs before constructing shell commands', () => {
		expect(() =>
			normalizeSandboxRunCodeInput({
				language: 'javascript',
				code: 'console.log(1)',
				packages: ['left-pad; rm -rf /']
			})
		).toThrow('package spec is not allowed');

		expect(() =>
			normalizeSandboxRunCodeInput({
				language: 'python',
				code: 'print(1)',
				packages: ['local@file:/tmp/package']
			})
		).toThrow('package spec is not allowed');

		expect(() =>
			normalizeSandboxRunCodeInput({
				language: 'python',
				code: 'print(1)',
				packages: ['git+https://github.com/org/package']
			})
		).toThrow('package spec is not allowed');
	});

	it('builds language-specific commands with package installation in the temp workspace', () => {
		expect(
			buildSandboxCommand({
				language: 'python',
				code: 'print(1)',
				packages: ['numpy'],
				stdin: '',
				timeoutSeconds: 15
			})
		).toContain('pip install --disable-pip-version-check --no-input --target python-packages');

		expect(
			buildSandboxCommand({
				language: 'javascript',
				code: 'console.log(1)',
				packages: ['lodash@^4.17.21'],
				stdin: '',
				timeoutSeconds: 15
			})
		).toContain('npm install --ignore-scripts --no-audit --no-fund --package-lock=false');
	});

	it('reports unsupported hosts without running unsandboxed code', async () => {
		const manager = sandboxManagerMock();
		const spawn = spawnMock({ stdout: 'should not run' });

		const result = await executeSandboxRunCode(
			{ language: 'python', code: 'print(1)' },
			{ platform: 'win32', sandboxManager: manager, spawn: spawn as never }
		);

		expect(result).toMatchObject({
			ok: false,
			hostPlatform: 'win32',
			error: expect.stringContaining('Linux/macOS')
		});
		expect(manager.initialize).not.toHaveBeenCalled();
		expect(spawn).not.toHaveBeenCalled();
	});

	it('initializes PI sandbox runtime, runs the wrapped command, and returns process output', async () => {
		const manager = sandboxManagerMock();
		const spawn = spawnMock({ stdout: '42\n', stderr: 'note\n', exitCode: 0 });

		const result = await executeSandboxRunCode(
			{
				language: 'javascript',
				code: 'console.log(42)',
				stdin: 'payload',
				packages: ['lodash'],
				timeoutSeconds: 2
			},
			{
				platform: 'linux',
				sandboxManager: manager,
				spawn: spawn as never,
				now: vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(1250)
			}
		);

		expect(result).toMatchObject({
			ok: true,
			exitCode: 0,
			stdout: '42\n',
			stderr: 'note\n',
			durationMs: 250,
			packages: ['lodash']
		});
		expect(manager.initialize).toHaveBeenCalledWith(
			expect.objectContaining({
				network: expect.objectContaining({
					allowedDomains: SANDBOX_ALLOWED_DOMAINS
				})
			})
		);
		expect(manager.wrapWithSandbox).toHaveBeenCalledWith(
			expect.stringContaining('npm install --ignore-scripts')
		);
		expect(spawn).toHaveBeenCalledWith(
			'bash',
			['-c', 'wrapped command'],
			expect.objectContaining({
				detached: true,
				env: expect.objectContaining({
					CI: '1',
					NO_COLOR: '1',
					npm_config_audit: 'false'
				}),
				stdio: ['pipe', 'pipe', 'pipe']
			})
		);
		expect(manager.reset).toHaveBeenCalledTimes(1);
	});

	it('returns non-zero exits to the agent without throwing', async () => {
		const result = await executeSandboxRunCode(
			{ language: 'python', code: 'raise SystemExit(7)' },
			{
				platform: 'darwin',
				sandboxManager: sandboxManagerMock(),
				spawn: spawnMock({ stderr: 'failed\n', exitCode: 7 }) as never
			}
		);

		expect(result).toMatchObject({
			ok: false,
			exitCode: 7,
			stderr: 'failed\n'
		});
		expect(result.error).toBeUndefined();
	});

	it('knows which host platforms PI sandbox-runtime supports', () => {
		expect(isSupportedSandboxHost('linux')).toBe(true);
		expect(isSupportedSandboxHost('darwin')).toBe(true);
		expect(isSupportedSandboxHost('win32')).toBe(false);
	});
});
