import { createExtensionRuntime, type ResourceLoader } from '@earendil-works/pi-coding-agent';

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
			return undefined;
		},
		getAppendSystemPrompt() {
			return [];
		},
		extendResources() {},
		async reload() {}
	};
}
