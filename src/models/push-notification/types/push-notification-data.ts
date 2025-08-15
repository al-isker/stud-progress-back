import { BaseMessage } from 'firebase-admin/lib/messaging/messaging-api';
import { PushNotificationTypeEnum } from './push-notification-type';

type BaseData = BaseMessage['data'];

export interface PushNotificationDataGradeUpdated extends BaseData {
	type: PushNotificationTypeEnum.GRADE_UPDATED;
	subjectId: string;
}

export interface PushNotificationDataEventCreated extends BaseData {
	type: PushNotificationTypeEnum.EVENT_CREATED;
	subjectId: string;
}

export interface PushNotificationDataEventUpdated extends BaseData {
	type: PushNotificationTypeEnum.EVENT_UPDATED;
	subjectId: string;
}
