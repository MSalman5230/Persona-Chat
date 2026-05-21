<script lang="ts">
	import {
		supportedProviderFor,
		type McpServerOption,
		type SavedProviderOption,
		type SupportedProviderOption
	} from '$lib/client/settings';
	import McpPanel from '$lib/components/settings/McpPanel.svelte';
	import ProvidersPanel from '$lib/components/settings/ProvidersPanel.svelte';
	import SettingsHeader from '$lib/components/settings/SettingsHeader.svelte';
	import '$lib/components/settings/settings.css';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type Tab = 'providers' | 'mcp';
	const CUSTOM_PROVIDER_ID = '__custom__';

	let activeTab = $state<Tab>('providers');
	let selectedSupportedProviderId = $state<string | null>(null);
	let selectedDefaultModelOverride = $state<string | null>(null);

	const providers = $derived(data.providers as SavedProviderOption[]);
	const supportedProviders = $derived(data.supportedProviders as SupportedProviderOption[]);
	const mcpServers = $derived(data.mcpServers as McpServerOption[]);
	const selectedProviderId = $derived(selectedSupportedProviderId ?? supportedProviders[0]?.id ?? CUSTOM_PROVIDER_ID);
	const selectedSupportedProvider = $derived(
		supportedProviderFor(supportedProviders, selectedProviderId) ?? supportedProviders[0]
	);
	const selectedSupportedModels = $derived(selectedSupportedProvider?.models ?? []);
	const selectedDefaultModel = $derived(
		selectedDefaultModelOverride ?? selectedSupportedProvider?.defaultModel ?? ''
	);

	function selectSupportedProvider(providerId: string) {
		selectedSupportedProviderId = providerId;
		selectedDefaultModelOverride = null;
	}

	function selectDefaultModel(modelId: string) {
		selectedDefaultModelOverride = modelId;
	}
</script>

<svelte:head>
	<title>Settings - Persona</title>
</svelte:head>

<div class="custom-scrollbar h-dvh overflow-y-auto bg-background text-text-primary">
	<div class="mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
		<SettingsHeader {activeTab} onSelectTab={(tab) => (activeTab = tab)} />

		{#if form?.error}
			<div class="mb-4 rounded-lg border border-error-container bg-error-container/25 px-4 py-3 text-error">
				{form.error}
			</div>
		{:else if data.loadError}
			<div class="mb-4 rounded-lg border border-error-container bg-error-container/25 px-4 py-3 text-error">
				{data.loadError}
			</div>
		{:else if form?.message}
			<div class="mb-4 rounded-lg border border-outline-variant bg-surface-container-low px-4 py-3 text-text-primary">
				{form.message}
			</div>
		{/if}

		{#if activeTab === 'providers'}
			<ProvidersPanel
				{providers}
				{supportedProviders}
				{selectedProviderId}
				{selectedDefaultModel}
				{selectedSupportedModels}
				onSelectProvider={selectSupportedProvider}
				onSelectDefaultModel={selectDefaultModel}
			/>
		{:else}
			<McpPanel {mcpServers} mcpJson={data.mcpJson} formMcpJson={form?.mcpJson} />
		{/if}
	</div>
</div>
