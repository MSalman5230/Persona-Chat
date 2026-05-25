import { tryParseStringRecord } from './json';

export function stringFromForm(form: FormData, key: string): string | undefined {
	const value = form.get(key);
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

export function booleanFromForm(form: FormData, key: string, fallback = false): boolean {
	const value = form.get(key);
	if (typeof value !== 'string') return fallback;
	return ['1', 'true', 'yes', 'on'].includes(value);
}

export function stringsFromForm(form: FormData, key: string): string[] {
	return form.getAll(key).filter((value): value is string => typeof value === 'string');
}

export function listFromLines(value: string | undefined): string[] {
	return (value ?? '')
		.split(/\r?\n|,/)
		.map((item) => item.trim())
		.filter(Boolean);
}

export function recordFromJson(value: string | undefined, label: string): Record<string, string> {
	return tryParseStringRecord(value, label);
}
