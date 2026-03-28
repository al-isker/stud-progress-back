import { Event } from '@prisma/client';
import { ExternalPortalEvent } from 'src/models/external-portal/types/external-portal-subject-list-with-event-list.type';

export interface DifferentCreatedEvent {
	externalPortalEvent: ExternalPortalEvent;
}

export interface DifferentUpdatedEvent {
	existingEvent: Event;
	externalPortalEvent: ExternalPortalEvent;
}

export interface DifferentDeletedEvent {
	existingEvent: Event;
}
