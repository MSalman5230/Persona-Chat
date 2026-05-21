<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ChatProviderOption, ModelOption } from '$lib/client/chat';

	interface Props {
		providerOptions: ChatProviderOption[];
		selectedProviderId: string;
		selectedModelOptions: ModelOption[];
		selectedModel: string;
		settingsOpen: boolean;
		onSelectProvider: (id: string) => void;
		onSelectModel: (id: string) => void;
		onToggleSettings: () => void;
	}

	let {
		providerOptions,
		selectedProviderId,
		selectedModelOptions,
		selectedModel,
		settingsOpen,
		onSelectProvider,
		onSelectModel,
		onToggleSettings
	}: Props = $props();
</script>

<header class="sticky top-0 z-30 hidden h-16 w-full items-center justify-between border-b border-border-subtle bg-background/80 px-gutter backdrop-blur-md md:flex">
	<div class="flex items-center gap-2">
		<select
			class="rounded border border-border-subtle bg-surface-container-high px-2.5 py-1 text-[13px] font-medium text-text-primary outline-none transition-colors hover:bg-surface-variant"
			value={selectedProviderId}
			onchange={(event) => onSelectProvider((event.currentTarget as HTMLSelectElement).value)}
			aria-label="Provider"
		>
			{#each providerOptions as provider (provider.id)}
				<option value={provider.id}>{provider.name}</option>
			{/each}
		</select>
		<select
			class="w-56 rounded border border-border-subtle bg-surface-container-high px-2.5 py-1 text-[13px] font-medium text-text-primary outline-none transition-colors hover:bg-surface-variant disabled:opacity-50"
			value={selectedModel}
			onchange={(event) => onSelectModel((event.currentTarget as HTMLSelectElement).value)}
			aria-label="Model"
			disabled={selectedModelOptions.length === 0}
		>
			{#each selectedModelOptions as model (model.id)}
				<option value={model.id}>{model.name}</option>
			{/each}
		</select>
	</div>
	<div class="flex items-center gap-1">
		<button
			type="button"
			class={[
				'rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-container-high hover:text-primary',
				settingsOpen ? 'bg-surface-container-high text-primary' : ''
			]}
			aria-label="Session settings"
			title="Session settings"
			aria-pressed={settingsOpen}
			onclick={onToggleSettings}
		>
			<span class="material-symbols-outlined" aria-hidden="true">tune</span>
		</button>
		<a
			href={resolve('/settings')}
			class="rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-container-high hover:text-primary"
			aria-label="Settings"
			title="Settings"
		>
			<span class="material-symbols-outlined" aria-hidden="true">settings</span>
		</a>
	</div>
</header>
