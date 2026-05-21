export function uniqueTrimmedStrings(values: Iterable<string>): string[] {
	const seen = new Set<string>();
	const result: string[] = [];

	for (const value of values) {
		const trimmed = value.trim();
		if (!trimmed || seen.has(trimmed)) continue;
		seen.add(trimmed);
		result.push(trimmed);
	}

	return result;
}
