<script lang="ts">
	import type { SavedProviderOption, SettingsModelOption, SupportedProviderOption } from '$lib/client/settings';
	import AddProviderForm from './AddProviderForm.svelte';
	import ProviderCard from './ProviderCard.svelte';

	interface Props {
		providers: SavedProviderOption[];
		supportedProviders: SupportedProviderOption[];
		canManage: boolean;
		selectedProviderId: string;
		selectedDefaultModel: string;
		selectedSupportedModels: SettingsModelOption[];
		onSelectProvider: (id: string) => void;
		onSelectDefaultModel: (id: string) => void;
	}

	let {
		providers,
		supportedProviders,
		canManage,
		selectedProviderId,
		selectedDefaultModel,
		selectedSupportedModels,
		onSelectProvider,
		onSelectDefaultModel
	}: Props = $props();
</script>

<section class={['grid flex-1 gap-6', canManage ? 'lg:grid-cols-[minmax(0,1fr)_390px]' : '']}>
	<div class="space-y-3">
		{#each providers as provider (provider.id)}
			<ProviderCard {provider} {supportedProviders} {canManage} />
		{:else}
			<div class="rounded-lg border border-border-subtle bg-surface-container-low p-6 text-text-muted">
				No providers saved.
			</div>
		{/each}
	</div>

	{#if canManage}
		<AddProviderForm
			{supportedProviders}
			{selectedProviderId}
			{selectedDefaultModel}
			{selectedSupportedModels}
			onSelectProvider={onSelectProvider}
			onSelectDefaultModel={onSelectDefaultModel}
		/>
	{/if}
</section>
