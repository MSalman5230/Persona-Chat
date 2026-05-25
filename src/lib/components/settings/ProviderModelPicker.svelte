<script lang="ts">
	import SelectField from '$lib/components/common/SelectField.svelte';
	import type { SettingsModelOption, SettingsSelectOption } from '$lib/client/settings';

	interface Props {
		defaultLabel: string;
		favoriteLabel: string;
		defaultModel: string;
		selectedDefaultModel: string;
		favoriteModels: string[];
		modelOptions: SettingsModelOption[];
		defaultOptions: SettingsSelectOption[];
		defaultBadge: string;
	}

	let {
		defaultLabel,
		favoriteLabel,
		defaultModel,
		selectedDefaultModel,
		favoriteModels,
		modelOptions,
		defaultOptions,
		defaultBadge
	}: Props = $props();
</script>

<label class="space-y-1">
	<span class="font-label-md text-label-md uppercase text-text-muted">{defaultLabel}</span>
	<SelectField name="defaultModel" value={selectedDefaultModel} options={defaultOptions} />
</label>

<div class="space-y-2 sm:col-span-2">
	<span class="font-label-md text-label-md uppercase text-text-muted">{favoriteLabel}</span>
	{#if modelOptions.length > 0}
		<div class="settings-model-list">
			{#each modelOptions as model (model.id)}
				<label class="settings-model-favorite">
					<input
						class="settings-model-favorite-input"
						type="checkbox"
						name="favoriteModels"
						value={model.id}
						checked={favoriteModels.includes(model.id)}
					/>
					<span class="settings-favorite-toggle" aria-hidden="true">
						<span class="material-symbols-outlined settings-favorite-icon">star</span>
					</span>
					<span class="settings-model-name">{model.name}</span>
					{#if model.id === defaultModel}
						<span class="settings-model-badge">{defaultBadge}</span>
					{/if}
				</label>
			{/each}
		</div>
	{:else}
		<div class="rounded-lg border border-border-subtle bg-surface-container p-3 text-text-muted">
			No models configured.
		</div>
	{/if}
</div>
