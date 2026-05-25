<script lang="ts">
	import type { ChatThinkingSelection } from '$lib/client/chat';
	import SelectField from '$lib/components/common/SelectField.svelte';

	interface Props {
		open: boolean;
		activeSessionId: string | null;
		thinkingOptions: readonly ChatThinkingSelection[];
		selectedThinking: ChatThinkingSelection;
		temperatureAuto: boolean;
		temperatureValue: number;
		settingsErrorText: string;
		settingsDirty: boolean;
		settingsSaveStatus: 'idle' | 'saving' | 'saved' | 'error';
		onClose: () => void;
		onThinkingChange: (value: ChatThinkingSelection) => void;
		onTemperatureAutoChange: (checked: boolean) => void;
		onTemperatureValueChange: (value: number) => void;
		onSaveSessionSettings: () => void | Promise<void>;
	}

	let {
		open,
		activeSessionId,
		thinkingOptions,
		selectedThinking,
		temperatureAuto,
		temperatureValue,
		settingsErrorText,
		settingsDirty,
		settingsSaveStatus,
		onClose,
		onThinkingChange,
		onTemperatureAutoChange,
		onTemperatureValueChange,
		onSaveSessionSettings
	}: Props = $props();

	function optionLabel(value: ChatThinkingSelection): string {
		return value === 'auto' ? 'Auto' : value;
	}

	const thinkingSelectOptions = $derived(
		thinkingOptions.map((option) => ({ value: option, label: optionLabel(option) }))
	);
</script>

<button
	type="button"
	class={['fixed inset-0 z-40 bg-black/60 md:hidden', open ? 'block' : 'hidden']}
	aria-label="Close session settings"
	aria-hidden={!open}
	onclick={onClose}
></button>

<aside
	class={[
		'fixed right-0 top-0 z-50 flex h-dvh w-full max-w-[320px] flex-col border-l border-border-subtle bg-surface-container-low transition-transform duration-300 ease-in-out',
		open ? 'translate-x-0' : 'translate-x-full'
	]}
	aria-label="Session settings"
>
	<div class="flex h-16 items-center justify-between border-b border-border-subtle px-gutter">
		<div class="flex items-center gap-2">
			<span class="material-symbols-outlined text-text-muted" aria-hidden="true">tune</span>
			<h2 class="font-body-sm text-body-sm font-semibold text-primary">Session Settings</h2>
		</div>
		<button
			type="button"
			class="rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-container-high hover:text-primary"
			aria-label="Close session settings"
			title="Close session settings"
			onclick={onClose}
		>
			<span class="material-symbols-outlined" aria-hidden="true">close</span>
		</button>
	</div>

	<form
		class="custom-scrollbar flex flex-1 flex-col overflow-y-auto"
		onsubmit={(event) => {
			event.preventDefault();
			void onSaveSessionSettings();
		}}
	>
		<div class="flex-1 space-y-6 px-gutter py-5">
			<label class="block space-y-2">
				<span class="font-label-md text-label-md uppercase text-text-muted">Thinking</span>
				<SelectField
					value={selectedThinking}
					options={thinkingSelectOptions}
					ariaLabel="Thinking"
					onChange={(value) => onThinkingChange(value as ChatThinkingSelection)}
				/>
			</label>

			<div class="space-y-4">
				<div class="flex items-center justify-between gap-4">
					<label for="temperature-auto" class="font-label-md text-label-md uppercase text-text-muted">
						Temperature
					</label>
					<label class="flex cursor-pointer items-center gap-2 font-body-sm text-body-sm text-text-primary">
						<input
							id="temperature-auto"
							type="checkbox"
							class="sr-only"
							checked={temperatureAuto}
							onchange={(event) =>
								onTemperatureAutoChange((event.currentTarget as HTMLInputElement).checked)}
						/>
						<span>Auto</span>
						<span
							class={[
								'relative h-6 w-11 rounded-full transition-colors',
								temperatureAuto ? 'bg-primary' : 'bg-surface-container-high'
							]}
						>
							<span
								class={[
									'absolute left-1 top-1 h-4 w-4 rounded-full transition-transform',
									temperatureAuto ? 'translate-x-5 bg-background' : 'bg-text-muted'
								]}
							></span>
						</span>
					</label>
				</div>

				<div class="grid grid-cols-[1fr_4.75rem] items-center gap-3">
					<input
						type="range"
						min="0"
						max="2"
						step="0.1"
						value={temperatureValue}
						disabled={temperatureAuto}
						class="h-2 w-full accent-primary disabled:opacity-35"
						aria-label="Temperature"
						oninput={(event) =>
							onTemperatureValueChange((event.currentTarget as HTMLInputElement).valueAsNumber)}
					/>
					<input
						type="number"
						min="0"
						max="2"
						step="0.1"
						value={temperatureValue.toFixed(1)}
						disabled={temperatureAuto}
						class="h-10 rounded-lg border border-border-subtle bg-surface-container px-2 text-center font-body-sm text-body-sm text-text-primary outline-none transition-colors focus:border-outline disabled:opacity-35"
						aria-label="Temperature value"
						oninput={(event) =>
							onTemperatureValueChange((event.currentTarget as HTMLInputElement).valueAsNumber)}
					/>
				</div>
			</div>

			{#if settingsErrorText}
				<div class="rounded-lg border border-error-container bg-error-container/25 px-3 py-2 font-body-sm text-body-sm text-error">
					{settingsErrorText}
				</div>
			{/if}
		</div>

		<div class="border-t border-border-subtle px-gutter py-4">
			<button
				type="submit"
				class="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-body-sm text-body-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-35"
				disabled={!activeSessionId || !settingsDirty || settingsSaveStatus === 'saving'}
			>
				<span class="material-symbols-outlined !text-[18px]" aria-hidden="true">save</span>
				<span>
					{settingsSaveStatus === 'saving'
						? 'Saving'
						: settingsSaveStatus === 'saved'
							? 'Saved'
							: 'Save'}
				</span>
			</button>
		</div>
	</form>
</aside>
