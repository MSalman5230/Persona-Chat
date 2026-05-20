export function tryParseJsonObject(value: string | undefined, label: string): Record<string, unknown> {
	if (!value) return {};
	const parsed = JSON.parse(value) as unknown;
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error(`${label} must be a JSON object`);
	}
	return parsed as Record<string, unknown>;
}
