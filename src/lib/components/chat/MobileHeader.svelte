<script lang="ts">
	interface Props {
		onOpenSidebar: () => void;
		onOpenSettings: () => void;
		onNewChat: () => void;
	}

	let { onOpenSidebar, onOpenSettings, onNewChat }: Props = $props();
</script>

<header class="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-border-subtle bg-background/80 px-4 backdrop-blur-md md:hidden">
	<button
		type="button"
		class="rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-container-high hover:text-primary"
		aria-label="Open sidebar"
		onclick={onOpenSidebar}
	>
		<span class="material-symbols-outlined" aria-hidden="true">menu</span>
	</button>
	<h1 class="font-headline-md text-headline-md text-primary">Persona</h1>
	<div class="flex items-center gap-1">
		<button
			type="button"
			class="rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-container-high hover:text-primary"
			aria-label="Session settings"
			title="Session settings"
			onclick={onOpenSettings}
		>
			<span class="material-symbols-outlined" aria-hidden="true">tune</span>
		</button>
		<button
			type="button"
			class="rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-container-high hover:text-primary"
			aria-label="New chat"
			title="New chat"
			onclick={onNewChat}
		>
			<span class="material-symbols-outlined" aria-hidden="true">add</span>
		</button>
	</div>
</header>
