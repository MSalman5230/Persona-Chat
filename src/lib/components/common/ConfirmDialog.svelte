<script lang="ts">
	interface Props {
		open: boolean;
		title: string;
		description?: string;
		confirmLabel: string;
		cancelLabel?: string;
		variant?: 'default' | 'danger';
		onCancel: () => void;
		onConfirm: () => void | Promise<void>;
	}

	let {
		open,
		title,
		description = '',
		confirmLabel,
		cancelLabel = 'Cancel',
		variant = 'default',
		onCancel,
		onConfirm
	}: Props = $props();

	const uid = $props.id();
	const titleId = `${uid}-title`;
	const descriptionId = `${uid}-description`;

	let dialogElement: HTMLDivElement | undefined;
	let previouslyFocusedElement: HTMLElement | null = null;

	function dialogRef(node: HTMLDivElement) {
		dialogElement = node;
		previouslyFocusedElement =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		queueMicrotask(focusFirstControl);

		return () => {
			if (dialogElement === node) dialogElement = undefined;
			previouslyFocusedElement?.focus();
			previouslyFocusedElement = null;
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

	function focusFirstControl() {
		const firstControl = focusableElements()[0] ?? dialogElement;
		firstControl?.focus();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!open) return;

		if (event.key === 'Escape') {
			event.preventDefault();
			onCancel();
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

</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<div class="fixed inset-0 z-[90] flex items-center justify-center px-4 py-6" role="presentation">
		<button
			type="button"
			class="absolute inset-0 bg-black/70"
			aria-label="Cancel dialog"
			tabindex="-1"
			onclick={onCancel}
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
			<div class="flex items-start gap-3">
				<span
					class={[
						'material-symbols-outlined mt-0.5 !text-[20px]',
						variant === 'danger' ? 'text-error' : 'text-text-muted'
					]}
					aria-hidden="true"
				>
					{variant === 'danger' ? 'warning' : 'info'}
				</span>
				<div class="min-w-0 flex-1">
					<h2 id={titleId} class="font-body-md text-body-md font-semibold text-primary">{title}</h2>
					{#if description}
						<p id={descriptionId} class="mt-2 font-body-sm text-body-sm text-text-muted">
							{description}
						</p>
					{/if}
				</div>
			</div>

			<div class="mt-5 flex justify-end gap-2">
				<button
					type="button"
					class="inline-flex h-10 items-center justify-center rounded-lg border border-border-subtle px-4 font-body-sm text-body-sm text-text-muted transition-colors hover:bg-surface-container-high hover:text-primary"
					onclick={onCancel}
				>
					{cancelLabel}
				</button>
				<button
					type="button"
					class={[
						'inline-flex h-10 items-center justify-center rounded-lg px-4 font-body-sm text-body-sm font-semibold transition-opacity hover:opacity-90',
						variant === 'danger' ? 'bg-error text-on-error' : 'bg-primary text-background'
					]}
					onclick={() => void onConfirm()}
				>
					{confirmLabel}
				</button>
			</div>
		</div>
	</div>
{/if}
