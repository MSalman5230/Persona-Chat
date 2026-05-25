import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createProviderConnection: vi.fn(),
	deleteProviderConnection: vi.fn(),
	getProviderConnection: vi.fn(),
	listProviderConnections: vi.fn(),
	updateProviderConnection: vi.fn(),
	createProviderRuntime: vi.fn(),
	getSupportedProviders: vi.fn(),
	providerPayloadFromForm: vi.fn()
}));

vi.mock('$lib/server/providers/catalog', () => ({
	getSupportedProviders: mocks.getSupportedProviders
}));

vi.mock('$lib/server/providers/runtime', () => ({
	createProviderRuntime: mocks.createProviderRuntime
}));

vi.mock('$lib/server/providers/settings-form', () => ({
	providerPayloadFromForm: mocks.providerPayloadFromForm
}));

vi.mock('$lib/server/repositories/providers', () => ({
	createProviderConnection: mocks.createProviderConnection,
	deleteProviderConnection: mocks.deleteProviderConnection,
	getProviderConnection: mocks.getProviderConnection,
	listProviderConnections: mocks.listProviderConnections,
	updateProviderConnection: mocks.updateProviderConnection
}));

import { saveAdminProviderFromForm, testAdminProvider } from './providers';

function formFromEntries(entries: Record<string, string | undefined>): FormData {
	const form = new FormData();
	for (const [key, value] of Object.entries(entries)) {
		if (value !== undefined) form.set(key, value);
	}
	return form;
}

describe('admin provider settings use cases', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getSupportedProviders.mockReturnValue([{ id: 'openai', name: 'OpenAI', models: [] }]);
	});

	it('creates a provider connection from form data', async () => {
		const form = formFromEntries({ name: 'OpenAI' });
		const payload = { name: 'OpenAI', providerId: 'openai', defaultModel: 'gpt-test' };
		const provider = { id: 'provider-1', name: 'OpenAI' };
		mocks.providerPayloadFromForm.mockReturnValue(payload);
		mocks.createProviderConnection.mockResolvedValue(provider);

		await expect(saveAdminProviderFromForm(form)).resolves.toBe(provider);

		expect(mocks.providerPayloadFromForm).toHaveBeenCalledWith(form, {
			update: false,
			supportedProviders: [{ id: 'openai', name: 'OpenAI', models: [] }]
		});
		expect(mocks.createProviderConnection).toHaveBeenCalledWith(payload);
	});

	it('updates a provider connection using existing immutable fields', async () => {
		const form = formFromEntries({ id: 'provider-1', name: 'Local' });
		const payload = { name: 'Local', providerId: 'local', defaultModel: 'local-small' };
		const provider = { id: 'provider-1', name: 'Local' };
		mocks.getProviderConnection.mockResolvedValue({
			baseUrl: 'http://localhost:1234/v1',
			providerId: 'local'
		});
		mocks.providerPayloadFromForm.mockReturnValue(payload);
		mocks.updateProviderConnection.mockResolvedValue(provider);

		await expect(saveAdminProviderFromForm(form)).resolves.toBe(provider);

		expect(mocks.providerPayloadFromForm).toHaveBeenCalledWith(form, {
			update: true,
			existingBaseUrl: 'http://localhost:1234/v1',
			existingProviderId: 'local',
			supportedProviders: [{ id: 'openai', name: 'OpenAI', models: [] }]
		});
		expect(mocks.updateProviderConnection).toHaveBeenCalledWith('provider-1', payload);
	});

	it('rejects updates for missing provider connections', async () => {
		const form = formFromEntries({ id: 'missing-provider' });
		mocks.getProviderConnection.mockResolvedValue(undefined);

		await expect(saveAdminProviderFromForm(form)).rejects.toThrow('Provider connection not found');
		expect(mocks.updateProviderConnection).not.toHaveBeenCalled();
	});

	it('returns the provider runtime test message', async () => {
		mocks.createProviderRuntime.mockResolvedValue({
			model: { id: 'gpt-test' },
			row: { name: 'OpenAI', providerId: 'openai' }
		});

		await expect(testAdminProvider('provider-1')).resolves.toBe('OpenAI can load openai/gpt-test');
		expect(mocks.createProviderRuntime).toHaveBeenCalledWith({
			providerConnectionId: 'provider-1'
		});
	});

	it('rejects provider runtime tests without an id', async () => {
		await expect(testAdminProvider('')).rejects.toThrow('Provider ID is required');
		expect(mocks.createProviderRuntime).not.toHaveBeenCalled();
	});
});
