function sanitizeToolSegment(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9_]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 48);
}

export function mcpToolName(serverSlug: string, toolName: string): string {
	return `mcp_${sanitizeToolSegment(serverSlug)}_${sanitizeToolSegment(toolName)}`;
}
