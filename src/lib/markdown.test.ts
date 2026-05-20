import { describe, expect, it } from 'vitest';

import { renderAssistantMarkdown } from './markdown';

describe('renderAssistantMarkdown', () => {
	it('renders common assistant markdown blocks', () => {
		const html = renderAssistantMarkdown(
			'**My Capabilities:**\n\n1. **Answer Questions**\n2. `Current Date/Time`\n\n```ts\nconst ok = true;\n```'
		);

		expect(html).toContain('<strong>My Capabilities:</strong>');
		expect(html).toContain('<ol>');
		expect(html).toContain('<li><strong>Answer Questions</strong></li>');
		expect(html).toContain('<code>Current Date/Time</code>');
		expect(html).toContain('<pre><code class="language-ts">');
		expect(html).toContain('const ok = true;');
	});

	it('escapes raw html instead of rendering it', () => {
		const html = renderAssistantMarkdown('<script>alert("x")</script>\n\n<img src=x onerror=alert(1)>');

		expect(html).not.toContain('<script>');
		expect(html).not.toContain('<img src=x');
		expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
		expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
	});

	it('degrades unsafe markdown links and images', () => {
		const html = renderAssistantMarkdown(
			'[bad](javascript:alert(1))\n\n![bad image](data:image/png;base64,abc)'
		);

		expect(html).toContain('bad');
		expect(html).toContain('bad image');
		expect(html).not.toContain('href=');
		expect(html).not.toContain('src=');
		expect(html).not.toContain('javascript:');
		expect(html).not.toContain('data:image');
	});

	it('keeps safe markdown links', () => {
		const html = renderAssistantMarkdown('[docs](https://example.com/search?q=a&lang=en "Docs")');

		expect(html).toContain(
			'<a href="https://example.com/search?q=a&amp;lang=en" title="Docs" target="_blank" rel="noreferrer">docs</a>'
		);
	});
});
