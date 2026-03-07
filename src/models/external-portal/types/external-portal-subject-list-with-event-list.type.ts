import { EventStatus } from '@prisma/client';

export interface ExternalPortalEvent {
	date: Date;
	status: EventStatus;
	mark: number;
}

export interface ExternalPortalSubjectWithEventList {
	name: string;
	eventList: ExternalPortalEvent[];
}

export type ExternalPortalSubjectListWithEventList =
	ExternalPortalSubjectWithEventList[];
