<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import ChatSidebar from '$lib/components/chat/ChatSidebar.svelte';
	import {
		setAppSidebarContext,
		type AppSidebarSession,
		type NewChatHandler
	} from '$lib/components/chat/sidebar-context';
	import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
	import { responseErrorMessage } from '$lib/client/chat';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	let sidebarOpen = $state(false);
	let sessions: AppSidebarSession[] = $derived(data.sidebarSessions);
	let pendingDeleteChat = $state<AppSidebarSession | null>(null);
	let sidebarErrorText = $state('');
	let newChatHandler = $state<NewChatHandler | null>(null);

	const authenticated = $derived(Boolean(data.user));
	const activeSessionId = $derived(
		page.route.id === '/chat/[id]' ? (page.params.id ?? null) : null
	);

	function upsertSession(session: AppSidebarSession) {
		sessions = [
			{ id: session.id, title: session.title || 'New chat' },
			...sessions.filter((item) => item.id !== session.id)
		].slice(0, 30);
	}

	function removeSession(sessionId: string) {
		sessions = sessions.filter((item) => item.id !== sessionId);
	}

	function requestDeleteChat(chat: AppSidebarSession) {
		sidebarErrorText = '';
		pendingDeleteChat = chat;
	}

	async function confirmDeleteChat() {
		const chat = pendingDeleteChat;
		if (!chat) return;

		pendingDeleteChat = null;
		sidebarErrorText = '';

		try {
			const response = await fetch(resolve(`/api/chat-sessions/${chat.id}`), { method: 'DELETE' });
			if (!response.ok) {
				const fallback =
					response.status === 409
						? 'Wait for the response to finish before deleting this chat'
						: 'Unable to delete chat';
				throw new Error(await responseErrorMessage(response, fallback));
			}

			removeSession(chat.id);
			if (activeSessionId === chat.id) {
				await goto(resolve('/'), { replaceState: true });
			}
		} catch (error) {
			sidebarErrorText = error instanceof Error ? error.message : 'Unable to delete chat';
		}
	}

	async function startNewChat() {
		sidebarOpen = false;
		sidebarErrorText = '';

		if (newChatHandler) {
			await newChatHandler();
			return;
		}

		await goto(resolve('/'));
	}

	setAppSidebarContext({
		openSidebar: () => (sidebarOpen = true),
		closeSidebar: () => (sidebarOpen = false),
		registerNewChatHandler: (handler) => {
			newChatHandler = handler;
			return () => {
				if (newChatHandler === handler) newChatHandler = null;
			};
		},
		upsertSession,
		removeSession
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=Geist:wght@100..900&display=swap" rel="stylesheet" />
	<link
		href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

{#if authenticated}
	<div class="min-h-dvh bg-background text-text-primary">
		<ChatSidebar
			open={sidebarOpen}
			{sessions}
			{activeSessionId}
			activePath={page.url.pathname}
			user={data.user}
			isAdmin={data.isAdmin}
			onNewChat={startNewChat}
			onDeleteChat={requestDeleteChat}
			onClose={() => (sidebarOpen = false)}
		/>

		<main class="min-h-dvh md:ml-sidebar-width">
			{@render children()}
		</main>

		{#if sidebarErrorText}
			<div
				class="fixed left-4 right-4 top-4 z-[60] rounded-lg border border-error-container bg-error-container/95 px-4 py-3 font-body-sm text-body-sm text-error shadow-lg md:left-[calc(var(--spacing-sidebar-width)+1rem)]"
				role="status"
				aria-live="polite"
			>
				{sidebarErrorText}
			</div>
		{/if}

		<ConfirmDialog
			open={pendingDeleteChat !== null}
			title="Delete chat?"
			description={pendingDeleteChat ? `Delete "${pendingDeleteChat.title}"? This cannot be undone.` : ''}
			confirmLabel="Delete chat"
			variant="danger"
			onCancel={() => (pendingDeleteChat = null)}
			onConfirm={confirmDeleteChat}
		/>
	</div>
{:else}
	{@render children()}
{/if}
