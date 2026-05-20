import { Marked, type RendererObject, type TokenizerObject } from 'marked';

const STRICT_STRIKETHROUGH_REGEX =
	/^(~~)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/;
const UNSAFE_URL_PROTOCOL_REGEX = /^(?:javascript|vbscript|data):/;

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function isUnsafeUrl(value: string): boolean {
	const normalized = value.replace(/[\u0000-\u001F\u007F\s]+/g, '').toLowerCase();
	return UNSAFE_URL_PROTOCOL_REGEX.test(normalized);
}

const tokenizer: TokenizerObject = {
	del(src) {
		const match = STRICT_STRIKETHROUGH_REGEX.exec(src);
		if (!match) return undefined;

		const text = match[2];
		return {
			type: 'del',
			raw: match[0],
			text,
			tokens: this.lexer.inlineTokens(text)
		};
	}
};

const renderer: RendererObject = {
	html({ text }) {
		return escapeHtml(text);
	},
	link({ href, title, tokens }) {
		const safeHref = href.trim();
		const label = this.parser.parseInline(tokens);
		if (isUnsafeUrl(safeHref)) return label;

		const titleAttribute = title ? ` title="${escapeHtml(title)}"` : '';
		return `<a href="${escapeHtml(safeHref)}"${titleAttribute} target="_blank" rel="noreferrer">${label}</a>`;
	},
	image({ href, title, text }) {
		const safeHref = href.trim();
		if (isUnsafeUrl(safeHref)) return escapeHtml(text);

		const titleAttribute = title ? ` title="${escapeHtml(title)}"` : '';
		return `<img src="${escapeHtml(safeHref)}" alt="${escapeHtml(text)}"${titleAttribute}>`;
	},
	codespan({ text }) {
		return `<code>${escapeHtml(text)}</code>`;
	}
};

const markdownParser = new Marked({
	async: false,
	breaks: true,
	gfm: true,
	renderer,
	tokenizer
});

export function renderAssistantMarkdown(markdown: string): string {
	if (!markdown.trim()) return '';
	return markdownParser.parse(markdown, { async: false });
}
