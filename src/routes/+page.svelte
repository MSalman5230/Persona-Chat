<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { tick } from 'svelte';

	type Suggestion = {
		title: string;
		prompt: string;
		icon: string;
	};

	type MenuItem = {
		label: string;
		icon: string;
	};

	const modelName = 'GPT-4.0';

	const recentChats = ['Project Deep Dive 2024', 'Python script debugging'];

	const suggestions: Suggestion[] = [
		{
			title: 'Help me write...',
			prompt: 'Draft a professional LinkedIn post about AI trends.',
			icon: 'edit_note'
		},
		{
			title: 'Brainstorm ideas...',
			prompt: 'Generate 10 catchy names for my new tech startup.',
			icon: 'lightbulb'
		},
		{
			title: 'Summarize text...',
			prompt: 'Give me the key takeaways from this lengthy article.',
			icon: 'summarize'
		},
		{
			title: 'Code solution...',
			prompt: 'Write a Python script to automate my spreadsheet data.',
			icon: 'terminal'
		}
	];

	const footerItems: MenuItem[] = [
		{ label: 'Settings', icon: 'settings' },
		{ label: 'Profile', icon: 'account_circle' },
		{ label: 'Sign Out', icon: 'logout' }
	];

	let message = $state('');
	let sidebarOpen = $state(false);
	let focusChatInput: (() => void) | undefined;

	const canSend = $derived(message.trim().length > 0);

	function resizeTextarea(node: HTMLTextAreaElement) {
		node.style.height = 'auto';
		node.style.height = `${Math.min(node.scrollHeight, 192)}px`;
	}

	const autosize: Attachment<HTMLTextAreaElement> = (node) => {
		resizeTextarea(node);
		const focus = () => {
			resizeTextarea(node);
			node.focus();
		};
		focusChatInput = focus;

		return () => {
			if (focusChatInput === focus) {
				focusChatInput = undefined;
			}
		};
	};

	function handleMessageInput(event: Event) {
		resizeTextarea(event.currentTarget as HTMLTextAreaElement);
	}

	async function useSuggestion(prompt: string) {
		message = prompt;
		sidebarOpen = false;

		await tick();
		focusChatInput?.();
	}

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!canSend) return;
	}

</script>

<svelte:head>
	<title>Persona Chat - Modern Intelligence</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Geist:wght@100..900&display=swap"
		rel="stylesheet"
	/>
	<link
		href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div
	class="min-h-dvh overflow-hidden bg-background text-text-primary selection:bg-primary-container selection:text-on-primary-container"
>
	<header
		class="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-border-subtle bg-background/80 px-4 backdrop-blur-md md:hidden"
	>
		<button
			type="button"
			class="rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-container-high hover:text-primary"
			aria-label="Open sidebar"
			onclick={() => (sidebarOpen = true)}
		>
			<span class="material-symbols-outlined" aria-hidden="true">menu</span>
		</button>
		<h1 class="font-headline-md text-headline-md text-primary">Persona Chat</h1>
		<button
			type="button"
			class="rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-container-high hover:text-primary"
			aria-label="New chat"
		>
			<span class="material-symbols-outlined" aria-hidden="true">add</span>
		</button>
	</header>

	<div class="flex h-[calc(100dvh-4rem)] w-full overflow-hidden md:h-dvh">
		<aside
			class={[
				'fixed left-0 top-0 z-50 flex h-dvh w-sidebar-width flex-col border-r border-border-subtle bg-surface-container-low py-4 transition-transform duration-300 ease-in-out md:translate-x-0',
				sidebarOpen ? 'translate-x-0' : '-translate-x-full'
			]}
			aria-label="Sidebar"
		>
			<div class="mb-8 px-gutter">
				<div class="mb-1 flex items-center gap-3">
					<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-background">
						<span class="material-symbols-outlined filled !text-[20px]" aria-hidden="true">
							neurology
						</span>
					</div>
					<h2 class="font-headline-md text-headline-md font-bold text-primary">Persona</h2>
				</div>
				<p class="font-body-sm text-body-sm text-text-muted">Modern Intelligence</p>
			</div>

			<nav class="custom-scrollbar flex-1 space-y-1 overflow-y-auto px-3" aria-label="Main">
				<button
					type="button"
					class="flex w-full items-center gap-3 rounded-lg border-l-2 border-primary bg-surface-container px-4 py-2.5 text-left text-primary transition-colors duration-200"
				>
					<span class="material-symbols-outlined" aria-hidden="true">add</span>
					<span class="font-body-sm text-body-sm font-medium">New Chat</span>
				</button>

				<div class="px-4 pb-2 pt-6">
					<p class="text-[10px] font-bold uppercase tracking-widest text-text-muted/50">
						Recent Chats
					</p>
				</div>

				<div class="space-y-1">
					{#each recentChats as chat (chat)}
						<button
							type="button"
							class="flex w-full items-center gap-3 truncate rounded-lg px-4 py-2 text-left text-text-muted transition-colors duration-200 hover:bg-surface-container-high hover:text-primary"
						>
							<span class="truncate font-body-sm text-body-sm">{chat}</span>
						</button>
					{/each}
				</div>
			</nav>

			<div class="space-y-1 border-t border-border-subtle px-3 pt-4">
				{#each footerItems as item (item.label)}
					<button
						type="button"
						class="flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-left text-text-muted transition-colors duration-200 hover:bg-surface-container-high hover:text-primary"
					>
						<span class="material-symbols-outlined" aria-hidden="true">{item.icon}</span>
						<span class="font-body-sm text-body-sm">{item.label}</span>
					</button>
				{/each}
			</div>
		</aside>

		<button
			type="button"
			class={[
				'fixed inset-0 z-40 bg-black/60 md:hidden',
				sidebarOpen ? 'block' : 'hidden'
			]}
			aria-label="Close sidebar"
			aria-hidden={!sidebarOpen}
			onclick={() => (sidebarOpen = false)}
		></button>

		<main class="relative flex h-full flex-1 flex-col md:ml-sidebar-width">
			<header
				class="sticky top-0 z-30 hidden h-16 w-full items-center justify-between border-b border-border-subtle bg-background/80 px-gutter backdrop-blur-md md:flex"
			>
				<button
					type="button"
					class="flex items-center gap-1.5 rounded border border-border-subtle bg-surface-container-high px-2.5 py-1 text-[13px] font-medium text-text-primary transition-colors hover:bg-surface-variant"
					aria-label="Select model"
				>
					<span>{modelName}</span>
					<span class="material-symbols-outlined !text-[16px]" aria-hidden="true">
						keyboard_arrow_down
					</span>
				</button>

				<button
					type="button"
					class="rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-container-high hover:text-primary"
					aria-label="More options"
				>
					<span class="material-symbols-outlined" aria-hidden="true">more_vert</span>
				</button>
			</header>

			<section
				class="custom-scrollbar flex flex-1 flex-col items-center overflow-y-auto px-4 pb-48 pt-8 md:justify-center md:pb-44 md:pt-0"
			>
				<div class="mx-auto w-full max-w-container-max-width">
					<div class="mb-6 text-center sm:mb-8 md:mb-12">
						<div
							class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-border-subtle bg-surface-container-high text-primary shadow-[0_18px_50px_rgba(0,0,0,0.22)] sm:mb-6 sm:h-16 sm:w-16 sm:rounded-2xl"
						>
							<span class="material-symbols-outlined !text-[32px]" aria-hidden="true">
								neurology
							</span>
						</div>
						<h2 class="mb-2 font-headline-md text-headline-md text-primary sm:font-headline-lg sm:text-headline-lg">
							How can I help you today?
						</h2>
						<p class="mx-auto max-w-md font-body-sm text-body-sm text-text-muted sm:font-body-md sm:text-body-md">
							Ask me anything—from coding complex scripts to drafting the perfect email or
							brainstorming your next big idea.
						</p>
					</div>

					<div class="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
						{#each suggestions as suggestion (suggestion.title)}
							<button
								type="button"
								class="group relative flex h-24 flex-col justify-between overflow-hidden rounded-xl border border-border-subtle bg-surface-container-low p-4 text-left transition-all duration-300 hover:border-outline-variant hover:bg-surface-container-high sm:h-32"
								onclick={() => useSuggestion(suggestion.prompt)}
							>
								<span class="relative z-10 block pr-8">
									<span class="mb-1 block font-body-md text-body-md font-semibold text-primary">
										{suggestion.title}
									</span>
									<span class="block font-body-sm text-body-sm text-text-muted">
										{suggestion.prompt}
									</span>
								</span>
								<span class="absolute bottom-4 right-4 z-10 flex justify-end">
									<span
										class="material-symbols-outlined !text-[20px] text-text-muted transition-colors group-hover:text-primary"
										aria-hidden="true"
									>
										{suggestion.icon}
									</span>
								</span>
							</button>
						{/each}
					</div>
				</div>
			</section>

			<div
				class="fixed bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-background via-background/95 to-transparent px-4 pb-4 pt-12 md:left-sidebar-width md:pb-6"
			>
				<div class="mx-auto max-w-container-max-width">
					<form
						class="glass-effect rounded-2xl border border-border-subtle bg-surface-container-low p-2 pl-4 shadow-[0_24px_80px_rgba(0,0,0,0.32)] transition-all duration-300 focus-within:border-outline"
						onsubmit={handleSubmit}
					>
						<div class="flex items-end gap-2">
							<button
								type="button"
								class="rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-container-high hover:text-primary"
								aria-label="Attach file"
							>
								<span class="material-symbols-outlined !text-[22px]" aria-hidden="true">
									attach_file
								</span>
							</button>

							<textarea
								bind:value={message}
								class="custom-scrollbar max-h-48 min-h-11 flex-1 resize-none border-none bg-transparent py-2.5 font-body-md text-body-md text-text-primary outline-none placeholder:text-text-muted focus:ring-0"
								placeholder="Message Persona..."
								rows="1"
								aria-label="Message Persona"
								oninput={handleMessageInput}
								{@attach autosize}
							></textarea>

							<button
								type="submit"
								class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-background transition-all hover:opacity-90 active:scale-95 disabled:scale-100 disabled:opacity-30"
								disabled={!canSend}
								aria-label="Send message"
							>
								<span class="material-symbols-outlined !text-[22px] font-bold" aria-hidden="true">
									arrow_upward
								</span>
							</button>
						</div>
					</form>
					<p class="mt-3 text-center text-[10px] font-medium uppercase tracking-wide text-text-muted/60">
						Persona can make mistakes. Check important info.
					</p>
				</div>
			</div>
		</main>
	</div>
</div>
