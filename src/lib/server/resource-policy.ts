export type ResourceFilter = {
	enabledOnly: boolean;
};

type ManagementResourceEvent = {
	locals: Pick<App.Locals, 'isAdmin'>;
};

export function runtimeResourceFilter(): ResourceFilter {
	return { enabledOnly: true };
}

export function managementResourceFilter(event: ManagementResourceEvent): ResourceFilter {
	return { enabledOnly: !event.locals.isAdmin };
}
