import { EventStatus } from '@prisma/client';

export interface DgmuEvent {
	date: Date;
	status: EventStatus;
	mark: number;
}

export interface DgmuSubjectWithEventList {
	name: string;
	eventList: DgmuEvent[];
}

export type DgmuSubjectListWithEventList = DgmuSubjectWithEventList[];
