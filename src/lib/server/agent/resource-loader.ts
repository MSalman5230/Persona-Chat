import { createExtensionRuntime, type ResourceLoader } from '@earendil-works/pi-coding-agent';

const SYSTEM_PROMPT = [
	'You are Persona, a helpful single-user assistant.',
	'Use only the enabled app tools and MCP tools when a tool is useful.',
	'You do not have filesystem, shell, edit, or write tools unless the app explicitly provides them.'
].join('\n');

export function createServerResourceLoader(): ResourceLoader {
	return {
		getExtensions() {
			return { extensions: [], errors: [], runtime: createExtensionRuntime() };
		},
		getSkills() {
			return { skills: [], diagnostics: [] };
		},
		getPrompts() {
			return { prompts: [], diagnostics: [] };
		},
		getThemes() {
			return { themes: [], diagnostics: [] };
		},
		getAgentsFiles() {
			return { agentsFiles: [] };
		},
		getSystemPrompt() {
			return SYSTEM_PROMPT;
		},
		getAppendSystemPrompt() {
			return [];
		},
		extendResources() {},
		async reload() {}
	};
}
