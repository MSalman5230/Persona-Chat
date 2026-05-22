<script lang="ts">
	import type { SettingsModelOption, SupportedProviderOption } from '$lib/client/settings';
	import SelectField from '$lib/components/common/SelectField.svelte';

	const CUSTOM_PROVIDER_ID = '__custom__';

	interface Props {
		supportedProviders: SupportedProviderOption[];
		selectedProviderId: string;
		selectedDefaultModel: string;
		selectedSupportedModels: SettingsModelOption[];
		onSelectProvider: (id: string) => void;
		onSelectDefaultModel: (id: string) => void;
	}

	let {
		supportedProviders,
		selectedProviderId,
		selectedDefaultModel,
		selectedSupportedModels,
		onSelectProvider,
		onSelectDefaultModel
	}: Props = $props();

	const isCustomProvider = $derived(selectedProviderId === CUSTOM_PROVIDER_ID);
	const providerSelectOptions = $derived([
		...supportedProviders.map((provider) => ({ value: provider.id, label: provider.name })),
		{ value: CUSTOM_PROVIDER_ID, label: 'Custom provider' }
	]);
	const defaultModelSelectOptions = $derived(
		selectedSupportedModels.map((model) => ({ value: model.id, label: model.name }))
	);
</script>

<form class="h-fit rounded-lg border border-border-subtle bg-surface-container-low p-4" method="POST" action="?/saveProvider">
	<h2 class="mb-4 font-body-md text-body-md font-semibold text-primary">Add Provider</h2>
	<div class="grid gap-3">
		<input type="hidden" name="providerMode" value={isCustomProvider ? CUSTOM_PROVIDER_ID : 'built_in'} />
		{#if !isCustomProvider}
			<input type="hidden" name="providerId" value={selectedProviderId} />
		{/if}

		<label class="space-y-1">
			<span class="font-label-md text-label-md uppercase text-text-muted">Provider</span>
			<SelectField
				value={selectedProviderId}
				options={providerSelectOptions}
				onChange={onSelectProvider}
			/>
		</label>

		{#if isCustomProvider}
			<label class="space-y-1">
				<span class="font-label-md text-label-md uppercase text-text-muted">Name</span>
				<input class="settings-field" name="name" autocomplete="off" />
			</label>
			<label class="space-y-1">
				<span class="font-label-md text-label-md uppercase text-text-muted">Provider ID</span>
				<input class="settings-field" name="providerId" autocomplete="off" placeholder="local-openai" />
			</label>
			<label class="space-y-1">
				<span class="font-label-md text-label-md uppercase text-text-muted">API</span>
				<input class="settings-field" name="api" autocomplete="off" placeholder="openai-completions" />
			</label>
			<label class="space-y-1">
				<span class="font-label-md text-label-md uppercase text-text-muted">Base URL</span>
				<input class="settings-field" name="baseUrl" type="url" autocomplete="off" placeholder="http://localhost:11434/v1" />
			</label>
			<label class="space-y-1">
				<span class="font-label-md text-label-md uppercase text-text-muted">Default Model</span>
				<input class="settings-field" name="defaultModel" autocomplete="off" placeholder="llama-3.1-8b" />
			</label>
			<label class="space-y-1">
				<span class="font-label-md text-label-md uppercase text-text-muted">Models</span>
				<textarea class="settings-field min-h-20" name="models" placeholder="llama-3.1-8b"></textarea>
			</label>
		{:else}
			<label class="space-y-1">
				<span class="font-label-md text-label-md uppercase text-text-muted">Default Model</span>
				<SelectField
					name="defaultModel"
					value={selectedDefaultModel}
					options={defaultModelSelectOptions}
					onChange={onSelectDefaultModel}
				/>
			</label>
		{/if}

		<label class="space-y-1">
			<span class="font-label-md text-label-md uppercase text-text-muted">API Key</span>
			<input
				class="settings-field"
				name="apiKey"
				type="password"
				autocomplete="off"
				placeholder={isCustomProvider ? 'Required' : 'Optional'}
			/>
		</label>
		<div class="flex flex-wrap gap-4">
			<label class="settings-toggle">
				<input type="checkbox" name="enabled" checked />
				<span>Enabled</span>
			</label>
			<label class="settings-toggle">
				<input type="checkbox" name="isDefault" />
				<span>Default</span>
			</label>
			{#if isCustomProvider}
				<label class="settings-toggle">
					<input type="checkbox" name="authHeader" checked />
					<span>Auth header</span>
				</label>
			{/if}
		</div>
		<button class="settings-primary-button">Add Provider</button>
	</div>
</form>
