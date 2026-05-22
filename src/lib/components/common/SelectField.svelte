<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import type { ClassValue } from 'svelte/elements';

	type SelectOption = {
		value: string;
		label: string;
		disabled?: boolean;
	};

	interface Props {
		id?: string;
		name?: string;
		value: string;
		options: readonly SelectOption[];
		ariaLabel?: string;
		disabled?: boolean;
		placeholder?: string;
		class?: ClassValue;
		onChange?: (value: string) => void;
	}

	const componentId = $props.id();
	let {
		id,
		name,
		value,
		options,
		ariaLabel,
		disabled = false,
		placeholder,
		class: className,
		onChange
	}: Props = $props();

	let root: HTMLDivElement | undefined = $state();
	let open = $state(false);
	let activeIndex = $state(-1);

	const allOptions = $derived([
		...(placeholder !== undefined ? [{ value: '', label: placeholder }] : []),
		...options
	]);
	const selectedOption = $derived(
		allOptions.find((option) => option.value === value) ?? allOptions[0]
	);
	const buttonId = $derived(id ?? `${componentId}-button`);
	const listboxId = $derived(`${componentId}-listbox`);
	const stableMinWidth = $derived.by(() => {
		const longestLabelLength = Math.max(...allOptions.map((option) => option.label.length), 0);
		const widthCh = Math.min(Math.max(longestLabelLength + 5, 8), 32);

		return `${widthCh}ch`;
	});

	function enabledOptionIndex(startIndex: number, direction: 1 | -1): number {
		if (allOptions.length === 0) return -1;

		for (let offset = 0; offset < allOptions.length; offset += 1) {
			const index = (startIndex + offset * direction + allOptions.length) % allOptions.length;
			if (!allOptions[index]?.disabled) return index;
		}

		return -1;
	}

	function openList() {
		if (disabled) return;

		const selectedIndex = allOptions.findIndex((option) => option.value === value);
		activeIndex = enabledOptionIndex(selectedIndex >= 0 ? selectedIndex : 0, 1);
		open = true;
	}

	function closeList() {
		open = false;
		activeIndex = -1;
	}

	function chooseOption(option: SelectOption) {
		if (option.disabled || disabled) return;
		onChange?.(option.value);
		closeList();
	}

	function handleButtonKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			if (!open) {
				openList();
				return;
			}

			const direction = event.key === 'ArrowDown' ? 1 : -1;
			activeIndex = enabledOptionIndex(activeIndex + direction, direction);
		}

		if (event.key === 'Escape') closeList();
	}

	function handleOptionKeydown(event: KeyboardEvent, option: SelectOption) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			chooseOption(option);
		}

		handleButtonKeydown(event);
	}

	function handleWindowClick(event: MouseEvent) {
		if (!open || root?.contains(event.target as Node)) return;
		closeList();
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') closeList();
	}

	const assignRoot: Attachment<HTMLDivElement> = (node) => {
		root = node;

		return () => {
			if (root === node) root = undefined;
		};
	};
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleWindowKeydown} />

<div
	{@attach assignRoot}
	class={['relative min-w-[var(--select-field-min-width)]', className]}
	style:--select-field-min-width={stableMinWidth}
>
	{#if name && !disabled}
		<input type="hidden" {name} {value} />
	{/if}
	<button
		id={buttonId}
		type="button"
		class={[
			'flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface-container px-3 text-left font-body-sm text-body-sm text-text-primary outline-none transition-colors hover:bg-surface-container-high focus:border-outline disabled:opacity-35',
			open ? 'border-outline bg-surface-container-high' : ''
		]}
		aria-label={ariaLabel}
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-controls={listboxId}
		{disabled}
		onclick={() => (open ? closeList() : openList())}
		onkeydown={handleButtonKeydown}
	>
		<span class="min-w-0 flex-1 truncate">{selectedOption?.label ?? ''}</span>
		<span
			class={[
				'material-symbols-outlined !text-[20px] text-text-muted transition-transform',
				open ? 'rotate-180' : ''
			]}
			aria-hidden="true"
		>
			expand_more
		</span>
	</button>

	{#if open}
		<div
			id={listboxId}
			class="absolute left-0 top-full z-50 mt-1 max-h-64 min-w-full overflow-y-auto rounded-lg border border-border-subtle bg-surface-container-low p-1 shadow-xl shadow-black/30 backdrop-blur-md"
			role="listbox"
			aria-labelledby={buttonId}
			tabindex="-1"
		>
			{#each allOptions as option, index (option.value)}
				<button
					id={`${componentId}-option-${index}`}
					type="button"
					class={[
						'flex min-h-9 w-full min-w-0 items-center rounded-md px-2.5 text-left font-body-sm text-body-sm transition-colors',
						option.value === value ? 'bg-surface-container-high text-primary' : 'text-text-muted',
						index === activeIndex ? 'bg-surface-container-high text-primary' : '',
						option.disabled ? 'cursor-not-allowed opacity-40' : 'hover:bg-surface-container-high hover:text-primary'
					]}
					role="option"
					aria-selected={option.value === value}
					disabled={option.disabled}
					tabindex={index === activeIndex ? 0 : -1}
					onclick={() => chooseOption(option)}
					onkeydown={(event) => handleOptionKeydown(event, option)}
				>
					<span class="min-w-0 flex-1 break-words">{option.label}</span>
				</button>
			{/each}
		</div>
	{/if}
</div>
