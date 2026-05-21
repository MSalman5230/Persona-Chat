<script lang="ts">
	import { resolve } from '$app/paths';

	type ChatSession = {
		id: string;
		title: string;
	};

	interface Props {
		open: boolean;
		sessions: ChatSession[];
		activeSessionId: string | null;
		onNewChat: () => void;
		onLoadSession: (id: string) => void;
		onClose: () => void;
	}

	let { open, sessions, activeSessionId, onNewChat, onLoadSession, onClose }: Props = $props();
</script>

<aside
	class={[
		'fixed left-0 top-0 z-50 flex h-dvh w-sidebar-width flex-col border-r border-border-subtle bg-surface-container-low py-4 transition-transform duration-300 ease-in-out md:translate-x-0',
		open ? 'translate-x-0' : '-translate-x-full'
	]}
	aria-label="Sidebar"
>
	<div class="mb-8 px-gutter">
		<div class="mb-1 flex items-center gap-3">
			<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-background">
				<span class="material-symbols-outlined filled !text-[20px]" aria-hidden="true">neurology</span>
			</div>
			<h2 class="font-headline-md text-headline-md font-bold text-primary">Persona</h2>
		</div>
		<p class="font-body-sm text-body-sm text-text-muted">Local agent runtime</p>
	</div>

	<nav class="custom-scrollbar flex-1 space-y-1 overflow-y-auto px-3" aria-label="Main">
		<button
			type="button"
			class="flex w-full items-center gap-3 rounded-lg border-l-2 border-primary bg-surface-container px-4 py-2.5 text-left text-primary transition-colors duration-200"
			onclick={onNewChat}
		>
			<span class="material-symbols-outlined" aria-hidden="true">add</span>
			<span class="font-body-sm text-body-sm font-medium">New Chat</span>
		</button>

		<div class="px-4 pb-2 pt-6">
			<p class="text-[10px] font-bold uppercase tracking-widest text-text-muted/50">Recent Chats</p>
		</div>

		<div class="space-y-1">
			{#each sessions as chat (chat.id)}
				<button
					type="button"
					class={[
						'flex w-full items-center gap-3 truncate rounded-lg px-4 py-2 text-left transition-colors duration-200',
						activeSessionId === chat.id
							? 'bg-surface-container text-primary'
							: 'text-text-muted hover:bg-surface-container-high hover:text-primary'
					]}
					onclick={() => onLoadSession(chat.id)}
				>
					<span class="truncate font-body-sm text-body-sm">{chat.title}</span>
				</button>
			{:else}
				<p class="px-4 py-2 font-body-sm text-body-sm text-text-muted">No chats yet.</p>
			{/each}
		</div>
	</nav>

	<div class="space-y-1 border-t border-border-subtle px-3 pt-4">
		<a
			href={resolve('/settings')}
			class="flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-left text-text-muted transition-colors duration-200 hover:bg-surface-container-high hover:text-primary"
		>
			<span class="material-symbols-outlined" aria-hidden="true">settings</span>
			<span class="font-body-sm text-body-sm">Settings</span>
		</a>
	</div>
</aside>

<button
	type="button"
	class={['fixed inset-0 z-40 bg-black/60 md:hidden', open ? 'block' : 'hidden']}
	aria-label="Close sidebar"
	aria-hidden={!open}
	onclick={onClose}
></button>
