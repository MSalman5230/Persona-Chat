<script lang="ts">
	import { THINKING_LEVELS, type SettingsModelOption, type SupportedProviderOption } from '$lib/client/settings';

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
</script>

<form class="h-fit rounded-lg border border-border-subtle bg-surface-container-low p-4" method="POST" action="?/saveProvider">
	<h2 class="mb-4 font-body-md text-body-md font-semibold text-primary">Add Provider</h2>
	{#if supportedProviders.length > 0}
		<div class="grid gap-3">
			<label class="space-y-1">
				<span class="font-label-md text-label-md uppercase text-text-muted">Provider</span>
				<select
					class="settings-field"
					name="providerId"
					value={selectedProviderId}
					onchange={(event) => onSelectProvider((event.currentTarget as HTMLSelectElement).value)}
				>
					{#each supportedProviders as provider (provider.id)}
						<option value={provider.id}>{provider.name}</option>
					{/each}
				</select>
			</label>
			<label class="space-y-1">
				<span class="font-label-md text-label-md uppercase text-text-muted">Default Model</span>
				<select
					class="settings-field"
					name="defaultModel"
					value={selectedDefaultModel}
					onchange={(event) => onSelectDefaultModel((event.currentTarget as HTMLSelectElement).value)}
				>
					{#each selectedSupportedModels as model (model.id)}
						<option value={model.id}>{model.name}</option>
					{/each}
				</select>
			</label>
			<label class="space-y-1">
				<span class="font-label-md text-label-md uppercase text-text-muted">Thinking</span>
				<select class="settings-field" name="defaultThinkingLevel">
					{#each THINKING_LEVELS as level (level)}
						<option value={level} selected={level === 'medium'}>{level}</option>
					{/each}
				</select>
			</label>
			<label class="space-y-1">
				<span class="font-label-md text-label-md uppercase text-text-muted">API Key</span>
				<input class="settings-field" name="apiKey" type="password" autocomplete="off" placeholder="Optional" />
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
			</div>
			<button class="settings-primary-button">Add Provider</button>
		</div>
	{:else}
		<div class="rounded-lg border border-border-subtle bg-surface-container p-4 text-text-muted">
			No supported providers found.
		</div>
	{/if}
</form>
