<script lang="ts">
	import { resolve } from '$app/paths';

	type Tab = 'providers' | 'mcp';

	interface Props {
		activeTab: Tab;
		onSelectTab: (tab: Tab) => void;
	}

	let { activeTab, onSelectTab }: Props = $props();
</script>

<header class="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-5">
	<div class="flex items-center gap-3">
		<a
			href={resolve('/')}
			class="flex h-9 w-9 items-center justify-center rounded-lg border border-border-subtle bg-surface-container-low text-text-muted transition-colors hover:bg-surface-container-high hover:text-primary"
			aria-label="Back to chat"
		>
			<span class="material-symbols-outlined !text-[20px]" aria-hidden="true">arrow_back</span>
		</a>
		<div>
			<h1 class="font-headline-md text-headline-md text-primary">Settings</h1>
			<p class="font-body-sm text-body-sm text-text-muted">Providers and MCP servers</p>
		</div>
	</div>

	<div class="flex rounded-lg border border-border-subtle bg-surface-container-low p-1">
		<button
			type="button"
			class={[
				'rounded-md px-3 py-1.5 font-body-sm text-body-sm transition-colors',
				activeTab === 'providers'
					? 'bg-primary text-background'
					: 'text-text-muted hover:bg-surface-container-high hover:text-primary'
			]}
			onclick={() => onSelectTab('providers')}
		>
			Providers
		</button>
		<button
			type="button"
			class={[
				'rounded-md px-3 py-1.5 font-body-sm text-body-sm transition-colors',
				activeTab === 'mcp'
					? 'bg-primary text-background'
					: 'text-text-muted hover:bg-surface-container-high hover:text-primary'
			]}
			onclick={() => onSelectTab('mcp')}
		>
			MCP
		</button>
	</div>
</header>
