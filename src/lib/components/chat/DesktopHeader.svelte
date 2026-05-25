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

	const agentAccessTooltip =
		"No agent: chat can use all app tools and all enabled MCP servers configured in Settings. Selecting an agent customizes access to that agent's tools and MCP servers.";
</script>

<header class="sticky top-0 z-30 hidden h-16 w-full items-center justify-between border-b border-border-subtle bg-background/80 px-gutter backdrop-blur-md md:flex">
	<div class="flex items-center gap-2">
		<div class="flex items-center gap-1.5">
			<SelectField
				class="w-auto max-w-44"
				value={selectedAgentId}
				options={agentSelectOptions}
				placeholder="No agent"
				ariaLabel="Agent"
				onChange={onSelectAgent}
			/>
			<span class="group relative inline-flex">
				<button
					type="button"
					class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted outline-none transition-colors hover:bg-surface-container-high hover:text-primary focus:bg-surface-container-high focus:text-primary focus:ring-1 focus:ring-outline"
					aria-label={agentAccessTooltip}
					aria-describedby="agent-access-tooltip"
				>
					<span class="material-symbols-outlined !text-[18px]" aria-hidden="true">info</span>
				</button>
				<span
					id="agent-access-tooltip"
					class="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg border border-border-subtle bg-surface-container-low px-3 py-2 font-body-sm text-body-sm text-text-primary opacity-0 shadow-xl shadow-black/30 backdrop-blur-md transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
					role="tooltip"
				>
					{agentAccessTooltip}
				</span>
			</span>
		</div>
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
