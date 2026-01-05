import { ExpoPushMessage } from 'expo-server-sdk';
import { PushNotificationTypeEnum } from './push-notification-type';

type BaseData = ExpoPushMessage['data'];

export interface PushNotificationGradeUpdatedData extends BaseData {
	type: PushNotificationTypeEnum.GRADE_UPDATED;
	subjectId: string;
}

export interface PushNotificationEventCreatedData extends BaseData {
	type: PushNotificationTypeEnum.EVENT_CREATED;
	subjectId: string;
}

export interface PushNotificationEventUpdatedData extends BaseData {
	type: PushNotificationTypeEnum.EVENT_UPDATED;
	subjectId: string;
}
