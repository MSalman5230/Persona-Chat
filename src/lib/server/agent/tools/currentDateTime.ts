import { defineTool } from '@earendil-works/pi-coding-agent';
import { Type } from '@earendil-works/pi-ai';

export const currentDateTimeTool = defineTool({
	name: 'current_datetime',
	label: 'Current Date Time',
	description: 'Returns the current ISO date-time, local time, and timezone metadata.',
	promptSnippet: 'current_datetime: get the current server date, time, and timezone.',
	parameters: Type.Object({}),
	executionMode: 'parallel',
	async execute() {
		const now = new Date();
		const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		const offsetMinutes = -now.getTimezoneOffset();
		const sign = offsetMinutes >= 0 ? '+' : '-';
		const abs = Math.abs(offsetMinutes);
		const offset = `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(
			abs % 60
		).padStart(2, '0')}`;
		const result = {
			iso: now.toISOString(),
			local: now.toLocaleString(),
			timeZone,
			offset
		};

		return {
			content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
			details: result
		};
	}
});
