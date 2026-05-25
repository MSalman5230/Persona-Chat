import type { PageServerLoad } from './$types';

import { loadChatPageData } from '$lib/server/chat/page-data';
import { authenticatedAccess } from '$lib/server/resource-policy';

export const load: PageServerLoad = async (event) => {
	return loadChatPageData(authenticatedAccess(event));
};
