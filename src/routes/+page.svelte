<script lang="ts">
	import {
		DEFAULT_MANUAL_TEMPERATURE,
		clampTemperature,
		consumeSseChunk,
		isRecord,
		mergeToolIntoAssistant,
		modelOptionsForProvider,
		presetIdForPrompt,
		responseErrorMessage,
		sortSystemPromptPresets,
		temperatureFromServer,
		uiMessageFromServer,
		type ChatProviderOption,
		type SystemPromptPresetOption,
		type UiMessage
	} from '$lib/client/chat';
	import ChatComposer from '$lib/components/chat/ChatComposer.svelte';
	import ChatSidebar from '$lib/components/chat/ChatSidebar.svelte';
	import DesktopHeader from '$lib/components/chat/DesktopHeader.svelte';
	import MessageList from '$lib/components/chat/MessageList.svelte';
	import MobileHeader from '$lib/components/chat/MobileHeader.svelte';
	import SessionSettingsDrawer from '$lib/components/chat/SessionSettingsDrawer.svelte';
	import { onMount, tick, untrack } from 'svelte';

	let { data } = $props();

	type PresetActionStatus = 'idle' | 'saving' | 'saved' | 'error';

	let message = $state('');
	let sidebarOpen = $state(false);
	let settingsOpen = $state(false);
	let isStreaming = $state(false);
	let activeSessionId = $state<string | null>(null);
	let selectedProviderIdOverride = $state<string | null>(null);
	let selectedModelOverride = $state<string | null>(null);
	let systemPromptPresets = $state<SystemPromptPresetOption[]>(
		untrack(() => data.systemPromptPresets)
	);
	let selectedSystemPromptPresetId = $state(untrack(() => data.defaultSystemPrompt?.id ?? ''));
	let systemPrompt = $state(untrack(() => data.defaultSystemPrompt?.prompt ?? ''));
	let temperatureAuto = $state(true);
	let temperatureValue = $state(DEFAULT_MANUAL_TEMPERATURE);
	let lastSavedSystemPrompt = $state(untrack(() => data.defaultSystemPrompt?.prompt ?? ''));
	let lastSavedTemperature = $state<number | null>(null);
	let settingsSaveStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	let presetActionStatus = $state<PresetActionStatus>('idle');
	let settingsErrorText = $state('');
	let errorText = $state('');
	let messages = $state<UiMessage[]>([]);
	let now = $state(Date.now());
	let focusChatInput: (() => void) | undefined;

	const providerOptions = $derived(data.providers as ChatProviderOption[]);
	const selectedProviderId = $derived(selectedProviderIdOverride ?? data.defaultProviderId ?? '');
	const selectedProvider = $derived(
		providerOptions.find((provider) => provider.id === selectedProviderId) ?? providerOptions[0]
	);
	const selectedModelOptions = $derived(modelOptionsForProvider(selectedProvider));
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
	const selectedSystemPromptPreset = $derived(
		systemPromptPresets.find((preset) => preset.id === selectedSystemPromptPresetId)
	);
	const defaultSystemPromptPreset = $derived(
		systemPromptPresets.find((preset) => preset.isDefault) ?? null
	);
	const defaultSystemPromptText = $derived(defaultSystemPromptPreset?.prompt ?? '');
	const settingsDirty = $derived(
		activeSessionId !== null &&
			(systemPrompt !== lastSavedSystemPrompt || currentTemperature !== lastSavedTemperature)
	);

	onMount(() => {
		const interval = window.setInterval(() => {
			if (hasActiveThought || hasActiveTool) now = Date.now();
		}, 250);

		return () => window.clearInterval(interval);
	});

	function resetSessionSettings(settings?: { systemPrompt?: string; temperature?: number | null }) {
		const nextSystemPrompt = settings?.systemPrompt ?? '';
		const nextTemperature = settings?.temperature ?? null;

		systemPrompt = nextSystemPrompt;
		selectedSystemPromptPresetId = presetIdForPrompt(systemPromptPresets, nextSystemPrompt);
		temperatureAuto = nextTemperature === null;
		temperatureValue = nextTemperature ?? DEFAULT_MANUAL_TEMPERATURE;
		lastSavedSystemPrompt = nextSystemPrompt;
		lastSavedTemperature = nextTemperature;
		settingsSaveStatus = 'idle';
		settingsErrorText = '';
	}

	function markSettingsChanged() {
		if (settingsSaveStatus === 'saved' || settingsSaveStatus === 'error') settingsSaveStatus = 'idle';
		if (presetActionStatus === 'saved' || presetActionStatus === 'error') presetActionStatus = 'idle';
		settingsErrorText = '';
	}

	function replaceLastAssistantMessage(payload: Record<string, unknown>) {
		const index = messages.length - 1;
		if (index < 0) return;
		messages[index] = uiMessageFromServer(payload, messages[index]);
	}

	function toggleThought(messageIndex: number, contentIndex: number) {
		const thought = messages[messageIndex]?.thoughts.find(
			(item) => item.contentIndex === contentIndex
		);
		if (thought) thought.expanded = !thought.expanded;
	}

	function openSettingsSidebar() {
		sidebarOpen = false;
		settingsOpen = true;
	}

	function newChat() {
		activeSessionId = null;
		messages = [];
		errorText = '';
		sidebarOpen = false;
		settingsOpen = false;
		resetSessionSettings({ systemPrompt: defaultSystemPromptText, temperature: null });
		tick().then(() => focusChatInput?.());
	}

	async function loadSession(id: string) {
		const response = await fetch(`/api/chat-sessions/${id}`);
		if (!response.ok) return;
		const payload = (await response.json()) as {
			session: {
				id: string;
				providerConnectionId: string | null;
				modelId: string | null;
				systemPrompt: string;
				temperature: number | null;
			};
			messages: Array<Record<string, unknown>>;
		};
		activeSessionId = payload.session.id;
		selectedProviderIdOverride = payload.session.providerConnectionId ?? selectedProviderId;
		selectedModelOverride = payload.session.modelId ?? selectedModel;
		resetSessionSettings({
			systemPrompt: payload.session.systemPrompt,
			temperature: temperatureFromServer(payload.session.temperature)
		});
		messages = payload.messages.map((item) => uiMessageFromServer(item));
		sidebarOpen = false;
	}

	function updateSystemPrompt(value: string) {
		systemPrompt = value;
		selectedSystemPromptPresetId = presetIdForPrompt(systemPromptPresets, systemPrompt);
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
		systemPrompt?: string;
		temperature?: number | null;
	}) {
		const savedSystemPrompt = payload.systemPrompt ?? systemPrompt;
		const savedTemperature =
			payload.temperature !== undefined ? temperatureFromServer(payload.temperature) : currentTemperature;

		systemPrompt = savedSystemPrompt;
		temperatureAuto = savedTemperature === null;
		temperatureValue = savedTemperature ?? temperatureValue;
		lastSavedSystemPrompt = savedSystemPrompt;
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
					systemPrompt,
					temperature: currentTemperature
				})
			});

			if (!response.ok) throw new Error('Settings save failed');

			const payload = (await response.json()) as {
				session: { systemPrompt?: string; temperature?: number | null };
			};
			updateSavedSessionSettings(payload.session);
			settingsSaveStatus = 'saved';
		} catch (error) {
			settingsSaveStatus = 'error';
			settingsErrorText = error instanceof Error ? error.message : 'Settings save failed';
		}
	}

	function applySystemPromptPresetUpdate(preset: SystemPromptPresetOption) {
		systemPromptPresets = sortSystemPromptPresets(
			systemPromptPresets.map((item) => ({
				...item,
				isDefault: preset.isDefault ? false : item.isDefault,
				...(item.id === preset.id ? preset : {})
			}))
		);
	}

	function selectSystemPromptPreset(id: string) {
		selectedSystemPromptPresetId = id;
		const preset = systemPromptPresets.find((item) => item.id === id);
		if (!preset) return;

		systemPrompt = preset.prompt;
		markSettingsChanged();
	}

	async function saveCurrentSystemPromptAsPreset() {
		if (presetActionStatus === 'saving') return;
		if (systemPrompt.trim().length === 0) {
			settingsErrorText = 'System prompt is required';
			presetActionStatus = 'error';
			return;
		}

		const name = window.prompt('Preset name');
		if (name === null) return;

		presetActionStatus = 'saving';
		settingsErrorText = '';

		try {
			const response = await fetch('/api/system-prompts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name, prompt: systemPrompt })
			});
			if (!response.ok) {
				throw new Error(await responseErrorMessage(response, 'Unable to save preset'));
			}

			const payload = (await response.json()) as { preset: SystemPromptPresetOption };
			systemPromptPresets = sortSystemPromptPresets([
				...systemPromptPresets.filter((preset) => preset.id !== payload.preset.id),
				payload.preset
			]);
			selectedSystemPromptPresetId = payload.preset.id;
			presetActionStatus = 'saved';
		} catch (error) {
			presetActionStatus = 'error';
			settingsErrorText = error instanceof Error ? error.message : 'Unable to save preset';
		}
	}

	async function toggleSelectedSystemPromptPresetDefault() {
		const preset = selectedSystemPromptPreset;
		if (!preset || presetActionStatus === 'saving') return;

		presetActionStatus = 'saving';
		settingsErrorText = '';

		try {
			const response = await fetch(`/api/system-prompts/${preset.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ isDefault: !preset.isDefault })
			});
			if (!response.ok) {
				throw new Error(await responseErrorMessage(response, 'Unable to update preset'));
			}

			const payload = (await response.json()) as { preset: SystemPromptPresetOption };
			applySystemPromptPresetUpdate(payload.preset);
			selectedSystemPromptPresetId = payload.preset.id;
			presetActionStatus = 'saved';
		} catch (error) {
			presetActionStatus = 'error';
			settingsErrorText = error instanceof Error ? error.message : 'Unable to update preset';
		}
	}

	async function deleteSelectedSystemPromptPreset() {
		const preset = selectedSystemPromptPreset;
		if (!preset || presetActionStatus === 'saving') return;
		if (!window.confirm(`Delete "${preset.name}"?`)) return;

		presetActionStatus = 'saving';
		settingsErrorText = '';

		try {
			const response = await fetch(`/api/system-prompts/${preset.id}`, { method: 'DELETE' });
			if (!response.ok) {
				throw new Error(await responseErrorMessage(response, 'Unable to delete preset'));
			}

			systemPromptPresets = systemPromptPresets.filter((item) => item.id !== preset.id);
			selectedSystemPromptPresetId = '';
			presetActionStatus = 'saved';
		} catch (error) {
			presetActionStatus = 'error';
			settingsErrorText = error instanceof Error ? error.message : 'Unable to delete preset';
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

	function mergeToolIntoLastAssistant(payload: Record<string, unknown>) {
		const lastAssistantIndex = messages.findLastIndex((item) => item.role === 'assistant');
		if (lastAssistantIndex < 0) return;

		messages[lastAssistantIndex] = mergeToolIntoAssistant(messages[lastAssistantIndex], payload);
	}

	async function sendMessage() {
		const prompt = message.trim();
		if (!prompt || !hasProviders) return;

		message = '';
		errorText = '';
		isStreaming = true;
		messages = [
			...messages,
			{ role: 'user', text: prompt, thoughts: [], tools: [] },
			{ role: 'assistant', text: '', thoughts: [], tools: [] }
		];

		await tick();
		focusChatInput?.();

		try {
			const response = await fetch('/api/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					sessionId: activeSessionId,
					message: prompt,
					providerConnectionId: selectedProviderId || null,
					modelId: selectedModel || null,
					systemPrompt,
					temperature: currentTemperature
				})
			});

			if (!response.ok || !response.body) throw new Error('Chat request failed');

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				buffer = consumeSseChunk(buffer, (eventName, dataText) => {
					const payload = JSON.parse(dataText) as Record<string, unknown>;
					if (eventName === 'session' && typeof payload.id === 'string') {
						activeSessionId = payload.id;
						updateSavedSessionSettings({
							systemPrompt: typeof payload.systemPrompt === 'string' ? payload.systemPrompt : systemPrompt,
							temperature: temperatureFromServer(payload.temperature)
						});
					}
					if (eventName === 'error') {
						errorText = String(payload.message ?? 'Chat request failed');
					}
					if (eventName === 'event' && payload.type === 'message_update') {
						const eventMessage = isRecord(payload.message) ? payload.message : undefined;
						if (eventMessage?.role === 'assistant') {
							replaceLastAssistantMessage(eventMessage);
						}
					}
					if (
						eventName === 'event' &&
						(payload.type === 'tool_execution_start' ||
							payload.type === 'tool_execution_update' ||
							payload.type === 'tool_execution_end')
					) {
						mergeToolIntoLastAssistant(payload);
					}
					if (eventName === 'event' && payload.type === 'message_end') {
						const eventMessage = isRecord(payload.message) ? payload.message : undefined;
						if (eventMessage?.role === 'assistant') {
							replaceLastAssistantMessage(eventMessage);
						}
					}
				});
			}
		} catch (error) {
			errorText = error instanceof Error ? error.message : 'Chat request failed';
		} finally {
			isStreaming = false;
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
			sessions={data.sessions}
			{activeSessionId}
			onNewChat={newChat}
			onLoadSession={(id) => void loadSession(id)}
			onClose={() => (sidebarOpen = false)}
		/>

		<main
			class={[
				'relative flex h-full flex-1 flex-col transition-[margin] duration-300 md:ml-sidebar-width',
				settingsOpen ? 'md:mr-[320px]' : 'md:mr-0'
			]}
		>
			<DesktopHeader
				{providerOptions}
				{selectedProviderId}
				{selectedModelOptions}
				{selectedModel}
				{settingsOpen}
				onSelectProvider={selectProvider}
				onSelectModel={selectModel}
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
			{systemPromptPresets}
			{selectedSystemPromptPresetId}
			{selectedSystemPromptPreset}
			{systemPrompt}
			{temperatureAuto}
			{temperatureValue}
			{settingsErrorText}
			{settingsDirty}
			{settingsSaveStatus}
			{presetActionStatus}
			onClose={() => (settingsOpen = false)}
			onSelectSystemPromptPreset={selectSystemPromptPreset}
			onSystemPromptInput={updateSystemPrompt}
			onTemperatureAutoChange={updateTemperatureAuto}
			onTemperatureValueChange={updateTemperatureValue}
			onSaveSessionSettings={saveSessionSettings}
			onSaveCurrentSystemPromptAsPreset={saveCurrentSystemPromptAsPreset}
			onToggleSelectedSystemPromptPresetDefault={toggleSelectedSystemPromptPresetDefault}
			onDeleteSelectedSystemPromptPreset={deleteSelectedSystemPromptPreset}
		/>
	</div>
</div>
