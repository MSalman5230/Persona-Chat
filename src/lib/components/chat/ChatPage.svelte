<script lang="ts">
	import {
		DEFAULT_MANUAL_TEMPERATURE,
		CHAT_THINKING_OPTIONS,
		chatThinkingSelectionFromServer,
		clampTemperature,
		createLocalUiMessage,
		isRecord,
		mergeToolEventIntoMessages,
		modelOptionsForProvider,
		presetIdForInstruction,
		responseErrorMessage,
		setConversationTurnThoughtExpanded,
		sortCustomInstructionPresets,
		temperatureFromServer,
		thinkingLevelForRequest,
		uiMessageFromServer,
		uiMessagesFromServerSnapshot,
		upsertUiMessageFromServer,
		type ChatAgentOption,
		type ChatThinkingSelection,
		type ChatProviderOption,
		type CustomInstructionPresetOption,
		type UiMessage
	} from '$lib/client/chat';
	import { afterNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ChatComposer from '$lib/components/chat/ChatComposer.svelte';
	import ChatSidebar from '$lib/components/chat/ChatSidebar.svelte';
	import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
	import DesktopHeader from '$lib/components/chat/DesktopHeader.svelte';
	import MessageList from '$lib/components/chat/MessageList.svelte';
	import MobileHeader from '$lib/components/chat/MobileHeader.svelte';
	import SessionSettingsDrawer from '$lib/components/chat/SessionSettingsDrawer.svelte';
	import TextPromptDialog from '$lib/components/common/TextPromptDialog.svelte';
	import { onMount, tick, untrack } from 'svelte';

	let { data } = $props();

	type PresetActionStatus = 'idle' | 'saving' | 'saved' | 'error';
	type ChatSessionSummary = { id: string; title: string };
	type PendingConfirmation =
		| { kind: 'chat'; chat: ChatSessionSummary }
		| { kind: 'preset'; preset: CustomInstructionPresetOption };
	type ChatSessionDetails = {
		id: string;
		title: string;
		agentId: string | null;
		providerConnectionId: string | null;
		modelId: string | null;
		thinkingLevel: string | null;
		customInstruction: string;
		temperature: number | null;
	};
	type ActiveRun = { id: string; sessionId: string; status: string; errorText: string | null };

	let message = $state('');
	let sidebarOpen = $state(false);
	let settingsOpen = $state(false);
	let pendingConfirmation = $state<PendingConfirmation | null>(null);
	let presetNameDialogOpen = $state(false);
	let sessions = $state<ChatSessionSummary[]>(untrack(() => data.sessions));
	let activeRun = $state<ActiveRun | null>(untrack(() => data.activeRun));
	let isStreaming = $state(Boolean(untrack(() => data.activeRun)));
	let activeSessionId = $state<string | null>(untrack(() => data.activeSession?.id ?? null));
	let loadedSessionId = $state<string | null>(untrack(() => data.activeSession?.id ?? null));
	let selectedAgentIdOverride = $state<string | null>(
		untrack(() =>
			data.activeSession ? (data.activeSession.agentId ?? '') : (data.defaultAgentId ?? '')
		)
	);
	let selectedProviderIdOverride = $state<string | null>(
		untrack(() => data.activeSession?.providerConnectionId ?? null)
	);
	let selectedModelOverride = $state<string | null>(untrack(() => data.activeSession?.modelId ?? null));
	let selectedThinking = $state<ChatThinkingSelection>(
		untrack(() => chatThinkingSelectionFromServer(data.activeSession?.thinkingLevel))
	);
	let customInstructionPresets = $state<CustomInstructionPresetOption[]>(
		untrack(() => data.customInstructionPresets)
	);
	let selectedCustomInstructionPresetId = $state(
		untrack(() =>
			presetIdForInstruction(
				data.customInstructionPresets,
				data.activeSession?.customInstruction ?? data.defaultCustomInstruction?.instruction ?? ''
			)
		)
	);
	let customInstruction = $state(
		untrack(() => data.activeSession?.customInstruction ?? data.defaultCustomInstruction?.instruction ?? '')
	);
	let temperatureAuto = $state(
		untrack(() => temperatureFromServer(data.activeSession?.temperature) === null)
	);
	let temperatureValue = $state(
		untrack(() => temperatureFromServer(data.activeSession?.temperature) ?? DEFAULT_MANUAL_TEMPERATURE)
	);
	let lastSavedCustomInstruction = $state(
		untrack(() => data.activeSession?.customInstruction ?? data.defaultCustomInstruction?.instruction ?? '')
	);
	let lastSavedTemperature = $state<number | null>(
		untrack(() => temperatureFromServer(data.activeSession?.temperature))
	);
	let settingsSaveStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	let presetActionStatus = $state<PresetActionStatus>('idle');
	let settingsErrorText = $state('');
	let errorText = $state(untrack(() => data.interruptedRun?.errorText ?? ''));
	let messages = $state<UiMessage[]>(
		untrack(() => data.messages.map((item: Record<string, unknown>) => uiMessageFromServer(item)))
	);
	let now = $state(Date.now());
	let focusChatInput: (() => void) | undefined;
	let eventSource: EventSource | null = null;
	let connectedRunId: string | null = null;

	const agentOptions = $derived(data.agents as ChatAgentOption[]);
	const selectedAgentId = $derived.by(() => {
		if (!selectedAgentIdOverride) return '';
		return agentOptions.some((agent) => agent.id === selectedAgentIdOverride)
			? selectedAgentIdOverride
			: '';
	});
	const providerOptions = $derived(data.providers as ChatProviderOption[]);
	const selectedProviderId = $derived(selectedProviderIdOverride ?? data.defaultProviderId ?? '');
	const selectedProvider = $derived(
		providerOptions.find((provider) => provider.id === selectedProviderId) ?? providerOptions[0]
	);
	const selectedModelOptions = $derived(modelOptionsForProvider(selectedProvider));
	const thinkingOptions = CHAT_THINKING_OPTIONS;
	const selectedModel = $derived.by(() => {
		if (selectedModelOverride && selectedModelOptions.some((model) => model.id === selectedModelOverride)) {
			return selectedModelOverride;
		}

		return selectedModelOptions[0]?.id ?? '';
	});
	const canSend = $derived(message.trim().length > 0 && !isStreaming && selectedModel.length > 0);
	const hasProviders = $derived(providerOptions.length > 0);
	const hasActiveThought = $derived(
		messages.some((item) => item.thoughts.some((thought) => thought.status === 'thinking'))
	);
	const hasActiveTool = $derived(
		messages.some((item) => item.tools.some((tool) => tool.status === 'running'))
	);
	const currentTemperature = $derived(temperatureAuto ? null : clampTemperature(temperatureValue));
	const selectedCustomInstructionPreset = $derived(
		customInstructionPresets.find((preset) => preset.id === selectedCustomInstructionPresetId)
	);
	const defaultCustomInstructionPreset = $derived(
		customInstructionPresets.find((preset) => preset.isDefault) ?? null
	);
	const defaultCustomInstructionText = $derived(defaultCustomInstructionPreset?.instruction ?? '');
	const settingsDirty = $derived(
		activeSessionId !== null &&
			(customInstruction !== lastSavedCustomInstruction ||
				currentTemperature !== lastSavedTemperature)
	);
	const confirmationDialog = $derived.by(() => {
		if (!pendingConfirmation) return null;

		if (pendingConfirmation.kind === 'chat') {
			return {
				title: 'Delete chat?',
				description: `Delete "${pendingConfirmation.chat.title}"? This cannot be undone.`,
				confirmLabel: 'Delete chat'
			};
		}

		return {
			title: 'Delete preset?',
			description: `Delete "${pendingConfirmation.preset.name}"?`,
			confirmLabel: 'Delete preset'
		};
	});

	onMount(() => {
		const interval = window.setInterval(() => {
			if (hasActiveThought || hasActiveTool) now = Date.now();
		}, 250);
		connectRunEvents();

		return () => {
			window.clearInterval(interval);
			closeRunEvents();
		};
	});

	afterNavigate(() => {
		syncPageData();
		connectRunEvents();
	});

	function syncPageData() {
		const nextSessionId = data.activeSession?.id ?? null;
		if (nextSessionId === loadedSessionId) return;

		const session = data.activeSession as ChatSessionDetails | null;
		loadedSessionId = nextSessionId;
		activeSessionId = nextSessionId;
		activeRun = data.activeRun;
		isStreaming = Boolean(data.activeRun);
		sessions = data.sessions;
		customInstructionPresets = data.customInstructionPresets;
		selectedAgentIdOverride = session ? (session.agentId ?? '') : (data.defaultAgentId ?? '');
		selectedProviderIdOverride = session?.providerConnectionId ?? null;
		selectedModelOverride = session?.modelId ?? null;
		selectedThinking = chatThinkingSelectionFromServer(session?.thinkingLevel);
		resetSessionSettings({
			customInstruction: session?.customInstruction ?? defaultCustomInstructionText,
			temperature: temperatureFromServer(session?.temperature)
		});
		messages = data.messages.map((item: Record<string, unknown>) => uiMessageFromServer(item));
		errorText = data.interruptedRun?.errorText ?? '';
	}

	function resetSessionSettings(settings?: {
		customInstruction?: string;
		temperature?: number | null;
	}) {
		const nextCustomInstruction = settings?.customInstruction ?? '';
		const nextTemperature = settings?.temperature ?? null;

		customInstruction = nextCustomInstruction;
		selectedCustomInstructionPresetId = presetIdForInstruction(
			customInstructionPresets,
			nextCustomInstruction
		);
		temperatureAuto = nextTemperature === null;
		temperatureValue = nextTemperature ?? DEFAULT_MANUAL_TEMPERATURE;
		lastSavedCustomInstruction = nextCustomInstruction;
		lastSavedTemperature = nextTemperature;
		settingsSaveStatus = 'idle';
		settingsErrorText = '';
	}

	function markSettingsChanged() {
		if (settingsSaveStatus === 'saved' || settingsSaveStatus === 'error') settingsSaveStatus = 'idle';
		if (presetActionStatus === 'saved' || presetActionStatus === 'error') presetActionStatus = 'idle';
		settingsErrorText = '';
	}

	function upsertStreamedMessage(payload: Record<string, unknown>) {
		messages = upsertUiMessageFromServer(messages, payload);
	}

	function toggleThought(turnKey: string, thoughtKey: string, expanded: boolean) {
		messages = setConversationTurnThoughtExpanded(messages, turnKey, thoughtKey, expanded);
	}

	function openSettingsSidebar() {
		sidebarOpen = false;
		settingsOpen = true;
	}

	function resetChatView() {
		activeSessionId = null;
		activeRun = null;
		isStreaming = false;
		messages = [];
		errorText = '';
		sidebarOpen = false;
		settingsOpen = false;
		selectedAgentIdOverride = data.defaultAgentId ?? '';
		selectedThinking = 'auto';
		resetSessionSettings({ customInstruction: defaultCustomInstructionText, temperature: null });
	}

	function newChat() {
		resetChatView();
		if (loadedSessionId !== null) {
			void goto(resolve('/'));
		}
		tick().then(() => focusChatInput?.());
	}

	function deleteChat(chat: ChatSessionSummary) {
		pendingConfirmation = { kind: 'chat', chat };
	}

	async function confirmDeleteChat(chat: ChatSessionSummary) {
		const wasActive = activeSessionId === chat.id;
		errorText = '';

		try {
			const response = await fetch(`/api/chat-sessions/${chat.id}`, { method: 'DELETE' });
			if (!response.ok) {
				const fallback =
					response.status === 409
						? 'Wait for the response to finish before deleting this chat'
						: 'Unable to delete chat';
				throw new Error(await responseErrorMessage(response, fallback));
			}

			sessions = sessions.filter((item) => item.id !== chat.id);

			if (wasActive) {
				closeRunEvents();
				resetChatView();
				await goto(resolve('/'), { replaceState: true });
				await tick();
				focusChatInput?.();
			}
		} catch (error) {
			errorText = error instanceof Error ? error.message : 'Unable to delete chat';
		}
	}

	function updateCustomInstruction(value: string) {
		customInstruction = value;
		selectedCustomInstructionPresetId = presetIdForInstruction(
			customInstructionPresets,
			customInstruction
		);
		markSettingsChanged();
	}

	function updateTemperatureAuto(checked: boolean) {
		temperatureAuto = checked;
		markSettingsChanged();
	}

	function updateTemperatureValue(value: number) {
		temperatureValue = clampTemperature(value);
		markSettingsChanged();
	}

	function updateSavedSessionSettings(payload: {
		agentId?: string | null;
		customInstruction?: string;
		temperature?: number | null;
	}) {
		const savedCustomInstruction = payload.customInstruction ?? customInstruction;
		const savedTemperature =
			payload.temperature !== undefined ? temperatureFromServer(payload.temperature) : currentTemperature;

		if (payload.agentId !== undefined) selectedAgentIdOverride = payload.agentId ?? '';
		customInstruction = savedCustomInstruction;
		temperatureAuto = savedTemperature === null;
		temperatureValue = savedTemperature ?? temperatureValue;
		lastSavedCustomInstruction = savedCustomInstruction;
		lastSavedTemperature = savedTemperature;
	}

	async function saveSessionSettings() {
		if (!activeSessionId || !settingsDirty || settingsSaveStatus === 'saving') return;

		settingsSaveStatus = 'saving';
		settingsErrorText = '';

		try {
			const response = await fetch(`/api/chat-sessions/${activeSessionId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					customInstruction,
					temperature: currentTemperature
				})
			});

			if (!response.ok) throw new Error('Settings save failed');

			const payload = (await response.json()) as {
				session: {
					agentId?: string | null;
					customInstruction?: string;
					temperature?: number | null;
				};
			};
			updateSavedSessionSettings(payload.session);
			settingsSaveStatus = 'saved';
		} catch (error) {
			settingsSaveStatus = 'error';
			settingsErrorText = error instanceof Error ? error.message : 'Settings save failed';
		}
	}

	function applyCustomInstructionPresetUpdate(preset: CustomInstructionPresetOption) {
		customInstructionPresets = sortCustomInstructionPresets(
			customInstructionPresets.map((item) => ({
				...item,
				isDefault: preset.isDefault ? false : item.isDefault,
				...(item.id === preset.id ? preset : {})
			}))
		);
	}

	function selectCustomInstructionPreset(id: string) {
		selectedCustomInstructionPresetId = id;
		const preset = customInstructionPresets.find((item) => item.id === id);
		if (!preset) return;

		customInstruction = preset.instruction;
		markSettingsChanged();
	}

	function saveCurrentCustomInstructionAsPreset() {
		if (presetActionStatus === 'saving') return;
		if (customInstruction.trim().length === 0) {
			settingsErrorText = 'Custom instruction is required';
			presetActionStatus = 'error';
			return;
		}

		presetNameDialogOpen = true;
	}

	async function confirmSaveCurrentCustomInstructionAsPreset(name: string) {
		presetNameDialogOpen = false;
		presetActionStatus = 'saving';
		settingsErrorText = '';

		try {
			const response = await fetch('/api/custom-instructions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name, instruction: customInstruction })
			});
			if (!response.ok) {
				throw new Error(await responseErrorMessage(response, 'Unable to save preset'));
			}

			const payload = (await response.json()) as { preset: CustomInstructionPresetOption };
			customInstructionPresets = sortCustomInstructionPresets([
				...customInstructionPresets.filter((preset) => preset.id !== payload.preset.id),
				payload.preset
			]);
			selectedCustomInstructionPresetId = payload.preset.id;
			presetActionStatus = 'saved';
		} catch (error) {
			presetActionStatus = 'error';
			settingsErrorText = error instanceof Error ? error.message : 'Unable to save preset';
		}
	}

	async function toggleSelectedCustomInstructionPresetDefault() {
		const preset = selectedCustomInstructionPreset;
		if (!preset || presetActionStatus === 'saving') return;

		presetActionStatus = 'saving';
		settingsErrorText = '';

		try {
			const response = await fetch(`/api/custom-instructions/${preset.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ isDefault: !preset.isDefault })
			});
			if (!response.ok) {
				throw new Error(await responseErrorMessage(response, 'Unable to update preset'));
			}

			const payload = (await response.json()) as { preset: CustomInstructionPresetOption };
			applyCustomInstructionPresetUpdate(payload.preset);
			selectedCustomInstructionPresetId = payload.preset.id;
			presetActionStatus = 'saved';
		} catch (error) {
			presetActionStatus = 'error';
			settingsErrorText = error instanceof Error ? error.message : 'Unable to update preset';
		}
	}

	async function deleteSelectedCustomInstructionPreset() {
		const preset = selectedCustomInstructionPreset;
		if (!preset || presetActionStatus === 'saving') return;

		pendingConfirmation = { kind: 'preset', preset };
	}

	async function confirmDeleteSelectedCustomInstructionPreset(preset: CustomInstructionPresetOption) {
		presetActionStatus = 'saving';
		settingsErrorText = '';

		try {
			const response = await fetch(`/api/custom-instructions/${preset.id}`, { method: 'DELETE' });
			if (!response.ok) {
				throw new Error(await responseErrorMessage(response, 'Unable to delete preset'));
			}

			customInstructionPresets = customInstructionPresets.filter((item) => item.id !== preset.id);
			selectedCustomInstructionPresetId = '';
			presetActionStatus = 'saved';
		} catch (error) {
			presetActionStatus = 'error';
			settingsErrorText = error instanceof Error ? error.message : 'Unable to delete preset';
		}
	}

	async function confirmPendingDeletion() {
		const confirmation = pendingConfirmation;
		if (!confirmation) return;

		pendingConfirmation = null;

		if (confirmation.kind === 'chat') {
			await confirmDeleteChat(confirmation.chat);
		} else {
			await confirmDeleteSelectedCustomInstructionPreset(confirmation.preset);
		}
	}

	async function selectAgent(id: string) {
		const previousAgentId = selectedAgentIdOverride ?? '';
		selectedAgentIdOverride = id;
		if (!activeSessionId) return;

		try {
			const response = await fetch(`/api/chat-sessions/${activeSessionId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ agentId: id || null })
			});

			if (!response.ok) {
				throw new Error(await responseErrorMessage(response, 'Agent save failed'));
			}

			const payload = (await response.json()) as {
				session: { agentId?: string | null };
			};
			updateSavedSessionSettings({ agentId: payload.session.agentId ?? null });
		} catch (error) {
			selectedAgentIdOverride = previousAgentId;
			errorText = error instanceof Error ? error.message : 'Agent save failed';
		}
	}

	function selectProvider(id: string) {
		selectedProviderIdOverride = id;
		selectedModelOverride =
			providerOptions.find((provider) => provider.id === id)?.defaultModel ?? selectedModel;
	}

	function selectModel(id: string) {
		selectedModelOverride = id;
	}

	function selectThinking(value: ChatThinkingSelection) {
		selectedThinking = value;
	}

	function mergeToolEvent(payload: Record<string, unknown>) {
		messages = mergeToolEventIntoMessages(messages, payload);
	}

	function activeRunFromPayload(payload: unknown): ActiveRun | null {
		if (!isRecord(payload) || typeof payload.id !== 'string' || typeof payload.sessionId !== 'string') {
			return null;
		}

		return {
			id: payload.id,
			sessionId: payload.sessionId,
			status: typeof payload.status === 'string' ? payload.status : 'running',
			errorText: typeof payload.errorText === 'string' ? payload.errorText : null
		};
	}

	function setActiveRun(nextRun: ActiveRun | null) {
		if (nextRun && activeRun?.id === nextRun.id) {
			isStreaming = true;
			return;
		}
		activeRun = nextRun;
		isStreaming = Boolean(nextRun);
		connectRunEvents();
	}

	function upsertSessionSummary(session: { id: string; title?: string }) {
		sessions = [
			{ id: session.id, title: session.title ?? 'New chat' },
			...sessions.filter((item) => item.id !== session.id)
		].slice(0, 30);
	}

	function applyRunEvent(eventName: string, payload: Record<string, unknown>) {
		if (eventName === 'session' && typeof payload.id === 'string') {
			activeSessionId = payload.id;
			upsertSessionSummary({
				id: payload.id,
				title: typeof payload.title === 'string' ? payload.title : 'New chat'
			});
			updateSavedSessionSettings({
				agentId: typeof payload.agentId === 'string' ? payload.agentId : null,
				customInstruction:
					typeof payload.customInstruction === 'string'
						? payload.customInstruction
						: customInstruction,
				temperature: temperatureFromServer(payload.temperature)
			});
			if ('thinkingLevel' in payload) {
				selectedThinking = chatThinkingSelectionFromServer(payload.thinkingLevel);
			}
		}

		if (eventName === 'snapshot') {
			if (Array.isArray(payload.messages)) {
				messages = uiMessagesFromServerSnapshot(payload.messages, messages);
			}
			const snapshotRun = activeRunFromPayload(payload.activeRun);
			if (snapshotRun) {
				setActiveRun(snapshotRun);
			} else {
				activeRun = null;
				isStreaming = false;
			}
		}

		if (eventName === 'event' && payload.type === 'message_update') {
			const eventMessage = isRecord(payload.message) ? payload.message : undefined;
			if (eventMessage?.role === 'assistant') {
				upsertStreamedMessage({ ...eventMessage, sequence: payload.sequence });
			}
		}

		if (
			eventName === 'event' &&
			(payload.type === 'tool_execution_start' ||
				payload.type === 'tool_execution_update' ||
				payload.type === 'tool_execution_end')
		) {
			mergeToolEvent(payload);
		}

		if (eventName === 'event' && payload.type === 'message_end') {
			const eventMessage = isRecord(payload.message) ? payload.message : undefined;
			if (eventMessage?.role === 'assistant') {
				upsertStreamedMessage({ ...eventMessage, sequence: payload.sequence });
			}
		}

		if (eventName === 'done') {
			setActiveRun(null);
		}

		if (eventName === 'run_error') {
			errorText = String(payload.message ?? 'Chat request failed');
			setActiveRun(null);
		}
	}

	function parseEventPayload(event: Event): Record<string, unknown> {
		try {
			const dataText = (event as MessageEvent<string>).data;
			const payload = JSON.parse(dataText) as unknown;
			return isRecord(payload) ? payload : {};
		} catch {
			return {};
		}
	}

	function closeRunEvents() {
		eventSource?.close();
		eventSource = null;
		connectedRunId = null;
	}

	function connectRunEvents() {
		const sessionId = activeSessionId;
		const runId = activeRun?.id;
		if (!sessionId || !runId) {
			closeRunEvents();
			return;
		}
		if (connectedRunId === runId) return;

		closeRunEvents();
		const source = new EventSource(resolve(`/api/chat-sessions/${sessionId}/events`));
		eventSource = source;
		connectedRunId = runId;
		const eventNames = ['session', 'snapshot', 'event', 'done', 'run_error'];
		for (const eventName of eventNames) {
			source.addEventListener(eventName, (event) => {
				applyRunEvent(eventName, parseEventPayload(event));
				if (eventName === 'done' || eventName === 'run_error') source.close();
			});
		}
		source.onerror = () => {
			if (activeRun?.id === runId) {
				errorText = 'Connection to streaming response was lost';
			}
		};
	}

	async function sendMessage() {
		const prompt = message.trim();
		if (!prompt || !hasProviders) return;

		const wasNewChat = activeSessionId === null;
		message = '';
		errorText = '';
		isStreaming = true;
		messages = [
			...messages,
			createLocalUiMessage('user', prompt),
			createLocalUiMessage('assistant')
		];

		await tick();
		focusChatInput?.();

		try {
			const response = await fetch('/api/chat-runs', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					sessionId: activeSessionId,
					message: prompt,
					agentId: selectedAgentId || null,
					providerConnectionId: selectedProviderId || null,
					modelId: selectedModel || null,
					thinkingLevel: thinkingLevelForRequest(selectedThinking),
					customInstruction,
					temperature: currentTemperature
				})
			});

			if (!response.ok) {
				throw new Error(await responseErrorMessage(response, 'Chat request failed'));
			}

			const payload = (await response.json()) as {
				run?: ActiveRun;
				session?: ChatSessionDetails;
			};
			if (!payload.run || !payload.session) throw new Error('Chat request failed');

			activeSessionId = payload.session.id;
			loadedSessionId = payload.session.id;
			setActiveRun(payload.run);
			upsertSessionSummary(payload.session);
			updateSavedSessionSettings({
				agentId: payload.session.agentId,
				customInstruction: payload.session.customInstruction,
				temperature: temperatureFromServer(payload.session.temperature)
			});
			selectedThinking = chatThinkingSelectionFromServer(payload.session.thinkingLevel);

			const href = resolve(`/chat/${payload.session.id}`);
			if (wasNewChat || activeSessionId !== payload.session.id) {
				await goto(href, { replaceState: wasNewChat });
			}
		} catch (error) {
			setActiveRun(null);
			errorText = error instanceof Error ? error.message : 'Chat request failed';
		}
	}
</script>

<svelte:head>
	<title>Persona Chat</title>
</svelte:head>

<div class="min-h-dvh overflow-hidden bg-background text-text-primary selection:bg-primary-container selection:text-on-primary-container">
	<MobileHeader
		onOpenSidebar={() => (sidebarOpen = true)}
		onOpenSettings={openSettingsSidebar}
		onNewChat={newChat}
	/>

	<div class="flex h-[calc(100dvh-4rem)] w-full overflow-hidden md:h-dvh">
		<ChatSidebar
			open={sidebarOpen}
			{sessions}
			{activeSessionId}
			onNewChat={newChat}
			onDeleteChat={deleteChat}
			onClose={() => (sidebarOpen = false)}
		/>

		<main
			class={[
				'relative flex h-full flex-1 flex-col transition-[margin] duration-300 md:ml-sidebar-width',
				settingsOpen ? 'md:mr-[320px]' : 'md:mr-0'
			]}
		>
			<DesktopHeader
				{agentOptions}
				{selectedAgentId}
				{providerOptions}
				{selectedProviderId}
				{selectedModelOptions}
				{selectedModel}
				{thinkingOptions}
				{selectedThinking}
				{settingsOpen}
				onSelectAgent={selectAgent}
				onSelectProvider={selectProvider}
				onSelectModel={selectModel}
				onSelectThinking={selectThinking}
				onToggleSettings={() => (settingsOpen = !settingsOpen)}
			/>

			<MessageList
				{hasProviders}
				loadError={data.loadError}
				{messages}
				{errorText}
				{isStreaming}
				{now}
				onToggleThought={toggleThought}
			/>

			<ChatComposer
				bind:message
				{hasProviders}
				{isStreaming}
				{canSend}
				{settingsOpen}
				onSubmit={sendMessage}
				onFocusReady={(focus) => (focusChatInput = focus)}
			/>
		</main>

		<SessionSettingsDrawer
			open={settingsOpen}
			{activeSessionId}
			{customInstructionPresets}
			{selectedCustomInstructionPresetId}
			{selectedCustomInstructionPreset}
			{customInstruction}
			{thinkingOptions}
			{selectedThinking}
			{temperatureAuto}
			{temperatureValue}
			{settingsErrorText}
			{settingsDirty}
			{settingsSaveStatus}
			{presetActionStatus}
			onClose={() => (settingsOpen = false)}
			onSelectCustomInstructionPreset={selectCustomInstructionPreset}
			onCustomInstructionInput={updateCustomInstruction}
			onThinkingChange={selectThinking}
			onTemperatureAutoChange={updateTemperatureAuto}
			onTemperatureValueChange={updateTemperatureValue}
			onSaveSessionSettings={saveSessionSettings}
			onSaveCurrentCustomInstructionAsPreset={saveCurrentCustomInstructionAsPreset}
			onToggleSelectedCustomInstructionPresetDefault={toggleSelectedCustomInstructionPresetDefault}
			onDeleteSelectedCustomInstructionPreset={deleteSelectedCustomInstructionPreset}
		/>
	</div>

	<ConfirmDialog
		open={confirmationDialog !== null}
		title={confirmationDialog?.title ?? ''}
		description={confirmationDialog?.description ?? ''}
		confirmLabel={confirmationDialog?.confirmLabel ?? 'Delete'}
		variant="danger"
		onCancel={() => (pendingConfirmation = null)}
		onConfirm={confirmPendingDeletion}
	/>

	<TextPromptDialog
		open={presetNameDialogOpen}
		title="Save preset"
		description="Name this custom instruction preset."
		label="Preset name"
		confirmLabel="Save preset"
		onCancel={() => (presetNameDialogOpen = false)}
		onConfirm={(name) => void confirmSaveCurrentCustomInstructionAsPreset(name)}
	/>
</div>
