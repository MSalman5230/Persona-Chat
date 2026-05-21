<script lang="ts">
	interface Props {
		open: boolean;
		title: string;
		label: string;
		confirmLabel: string;
		description?: string;
		cancelLabel?: string;
		placeholder?: string;
		onCancel: () => void;
		onConfirm: (value: string) => void | Promise<void>;
	}

	let {
		open,
		title,
		label,
		confirmLabel,
		description = '',
		cancelLabel = 'Cancel',
		placeholder = '',
		onCancel,
		onConfirm
	}: Props = $props();

	const uid = $props.id();
	const titleId = `${uid}-title`;
	const descriptionId = `${uid}-description`;
	const inputId = `${uid}-input`;
	const errorId = `${uid}-error`;

	let dialogElement: HTMLDivElement | undefined;
	let inputElement: HTMLInputElement | undefined;
	let previouslyFocusedElement: HTMLElement | null = null;
	let value = $state('');
	let validationError = $state('');

	function dialogRef(node: HTMLDivElement) {
		dialogElement = node;
		previouslyFocusedElement =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		queueMicrotask(() => focusableElements()[0]?.focus());

		return () => {
			if (dialogElement === node) dialogElement = undefined;
			previouslyFocusedElement?.focus();
			previouslyFocusedElement = null;
		};
	}

	function inputRef(node: HTMLInputElement) {
		inputElement = node;

		return () => {
			if (inputElement === node) inputElement = undefined;
		};
	}

	function focusableElements() {
		if (!dialogElement) return [];

		return Array.from(
			dialogElement.querySelectorAll<HTMLElement>(
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
			)
		).filter((element) => {
			const control = element as HTMLButtonElement | HTMLInputElement;
			return !control.disabled && element.tabIndex >= 0;
		});
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!open) return;

		if (event.key === 'Escape') {
			event.preventDefault();
			cancelPrompt();
			return;
		}

		if (event.key !== 'Tab') return;

		const controls = focusableElements();
		if (controls.length === 0) {
			event.preventDefault();
			dialogElement?.focus();
			return;
		}

		const firstControl = controls[0];
		const lastControl = controls[controls.length - 1];
		const activeElement = document.activeElement;

		if (event.shiftKey && activeElement === firstControl) {
			event.preventDefault();
			lastControl.focus();
		} else if (!event.shiftKey && activeElement === lastControl) {
			event.preventDefault();
			firstControl.focus();
		}
	}

	function submitPrompt() {
		const nextValue = value.trim();
		if (nextValue.length === 0) {
			validationError = `${label} is required`;
			inputElement?.focus();
			return;
		}

		validationError = '';
		value = '';
		void onConfirm(nextValue);
	}

	function cancelPrompt() {
		value = '';
		validationError = '';
		onCancel();
	}

</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<div class="fixed inset-0 z-[90] flex items-center justify-center px-4 py-6" role="presentation">
		<button
			type="button"
			class="absolute inset-0 bg-black/70"
			aria-label="Cancel dialog"
			tabindex="-1"
			onclick={cancelPrompt}
		></button>

		<div
			{@attach dialogRef}
			class="relative z-10 w-full max-w-sm rounded-lg border border-border-subtle bg-surface-container-low p-5 shadow-2xl outline-none"
			role="dialog"
			aria-modal="true"
			aria-labelledby={titleId}
			aria-describedby={description ? descriptionId : undefined}
			tabindex="-1"
		>
			<form
			onsubmit={(event) => {
				event.preventDefault();
				submitPrompt();
			}}
		>
			<h2 id={titleId} class="font-body-md text-body-md font-semibold text-primary">{title}</h2>
			{#if description}
				<p id={descriptionId} class="mt-2 font-body-sm text-body-sm text-text-muted">
					{description}
				</p>
			{/if}

			<label class="mt-5 block space-y-2" for={inputId}>
				<span class="font-label-md text-label-md uppercase text-text-muted">{label}</span>
				<input
					{@attach inputRef}
					id={inputId}
					class="h-10 w-full rounded-lg border border-border-subtle bg-surface-container px-3 font-body-sm text-body-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-outline"
					value={value}
					{placeholder}
					aria-invalid={validationError ? 'true' : undefined}
					aria-describedby={validationError ? errorId : undefined}
					oninput={(event) => {
						value = event.currentTarget.value;
						if (validationError) validationError = '';
					}}
				/>
			</label>

			{#if validationError}
				<p id={errorId} class="mt-2 font-body-sm text-body-sm text-error">{validationError}</p>
			{/if}

			<div class="mt-5 flex justify-end gap-2">
				<button
					type="button"
					class="inline-flex h-10 items-center justify-center rounded-lg border border-border-subtle px-4 font-body-sm text-body-sm text-text-muted transition-colors hover:bg-surface-container-high hover:text-primary"
					onclick={cancelPrompt}
				>
					{cancelLabel}
				</button>
				<button
					type="submit"
					class="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 font-body-sm text-body-sm font-semibold text-background transition-opacity hover:opacity-90"
				>
					{confirmLabel}
				</button>
			</div>
			</form>
		</div>
	</div>
{/if}
