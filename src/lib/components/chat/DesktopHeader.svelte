<script lang="ts">
	import { resolve } from '$app/paths';
	import type {
		ChatAgentOption,
		ChatProviderOption,
		ChatThinkingSelection,
		ModelOption
	} from '$lib/client/chat';
	import SelectField from '$lib/components/common/SelectField.svelte';

	interface Props {
		agentOptions: ChatAgentOption[];
		selectedAgentId: string;
		providerOptions: ChatProviderOption[];
		selectedProviderId: string;
		selectedModelOptions: ModelOption[];
		selectedModel: string;
		thinkingOptions: readonly ChatThinkingSelection[];
		selectedThinking: ChatThinkingSelection;
		settingsOpen: boolean;
		onSelectAgent: (id: string) => void | Promise<void>;
		onSelectProvider: (id: string) => void;
		onSelectModel: (id: string) => void;
		onSelectThinking: (value: ChatThinkingSelection) => void;
		onToggleSettings: () => void;
	}

	let {
		agentOptions,
		selectedAgentId,
		providerOptions,
		selectedProviderId,
		selectedModelOptions,
		selectedModel,
		thinkingOptions,
		selectedThinking,
		settingsOpen,
		onSelectAgent,
		onSelectProvider,
		onSelectModel,
		onSelectThinking,
		onToggleSettings
	}: Props = $props();

	function optionLabel(value: ChatThinkingSelection): string {
		return value === 'auto' ? 'Auto' : value;
	}

	const providerSelectOptions = $derived(
		providerOptions.map((provider) => ({ value: provider.id, label: provider.name }))
	);
	const agentSelectOptions = $derived(
		agentOptions.map((agent) => ({
			value: agent.id,
			label: `${agent.isDefault ? 'Default - ' : ''}${agent.name}`
		}))
	);
	const modelSelectOptions = $derived(
		selectedModelOptions.map((model) => ({ value: model.id, label: model.name }))
	);
	const thinkingSelectOptions = $derived(
		thinkingOptions.map((option) => ({ value: option, label: optionLabel(option) }))
	);
</script>

<header class="sticky top-0 z-30 hidden h-16 w-full items-center justify-between border-b border-border-subtle bg-background/80 px-gutter backdrop-blur-md md:flex">
	<div class="flex items-center gap-2">
		<SelectField
			class="w-auto max-w-44"
			value={selectedAgentId}
			options={agentSelectOptions}
			ariaLabel="Agent"
			onChange={onSelectAgent}
		/>
		<SelectField
			class="w-auto max-w-44"
			value={selectedProviderId}
			options={providerSelectOptions}
			ariaLabel="Provider"
			onChange={onSelectProvider}
		/>
		<SelectField
			class="w-auto max-w-56"
			value={selectedModel}
			options={modelSelectOptions}
			ariaLabel="Model"
			disabled={selectedModelOptions.length === 0}
			onChange={onSelectModel}
		/>
		<SelectField
			class="w-auto"
			value={selectedThinking}
			options={thinkingSelectOptions}
			ariaLabel="Thinking"
			onChange={(value) => onSelectThinking(value as ChatThinkingSelection)}
		/>
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
