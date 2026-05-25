import { stringFromForm } from '$lib/server/forms';
import { getSupportedProviders } from '$lib/server/providers/catalog';
import type { SupportedProvider } from '$lib/server/providers/catalog';
import { createProviderRuntime } from '$lib/server/providers/runtime';
import { providerPayloadFromForm } from '$lib/server/providers/settings-form';
import {
	createProviderConnection,
	deleteProviderConnection,
	getProviderConnection,
	listProviderConnections,
	updateProviderConnection
} from '$lib/server/repositories/providers';
import type { PublicProviderConnection } from '$lib/server/repositories/providers';

export function getAdminSupportedProviders(): SupportedProvider[] {
	return getSupportedProviders();
}

export async function listAdminProviderConnections(): Promise<PublicProviderConnection[]> {
	return listProviderConnections();
}

export async function saveAdminProviderFromForm(
	form: FormData
): Promise<PublicProviderConnection> {
	const id = stringFromForm(form, 'id');
	const supportedProviders = getSupportedProviders();

	if (!id) {
		return createProviderConnection(
			providerPayloadFromForm(form, { update: false, supportedProviders })
		);
	}

	const current = await getProviderConnection(id);
	if (!current) throw new Error('Provider connection not found');

	return updateProviderConnection(
		id,
		providerPayloadFromForm(form, {
			update: true,
			existingBaseUrl: current.baseUrl,
			existingProviderId: current.providerId,
			supportedProviders
		})
	);
}

export async function deleteAdminProvider(id: string): Promise<void> {
	await deleteProviderConnection(id);
}

export async function testAdminProvider(id: string): Promise<string> {
	if (!id) throw new Error('Provider ID is required');

	const runtime = await createProviderRuntime({ providerConnectionId: id });
	return `${runtime.row.name} can load ${runtime.row.providerId}/${runtime.model.id}`;
}
