<script lang="ts">
	import { getAppSidebarContext } from '$lib/components/chat/sidebar-context';

	type Tab = 'providers' | 'mcp';

	interface Props {
		activeTab: Tab;
		onSelectTab: (tab: Tab) => void;
	}

	let { activeTab, onSelectTab }: Props = $props();
	const sidebar = getAppSidebarContext();
</script>

<header class="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-5">
	<div class="flex items-center gap-3">
		<button
			type="button"
			class="flex h-9 w-9 items-center justify-center rounded-lg border border-border-subtle bg-surface-container-low text-text-muted transition-colors hover:bg-surface-container-high hover:text-primary md:hidden"
			aria-label="Open sidebar"
			onclick={sidebar.openSidebar}
		>
			<span class="material-symbols-outlined !text-[20px]" aria-hidden="true">menu</span>
		</button>
		<div>
			<h1 class="font-headline-md text-headline-md text-primary">Admin Settings</h1>
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
