import { ControlType, EventStatus, GradeStatus } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { ExpoService } from '../expo/expo.service';
import { ExternalPortalEvent } from '../external-portal/types/external-portal-subject-list-with-event-list.type';
import { ExternalPortalSubjectWithGrade } from '../external-portal/types/external-portal-subject-list-with-grade.type';
import {
	PushNotificationEventCreatedData,
	PushNotificationEventUpdatedData,
	PushNotificationGradeUpdatedData
} from './types/push-notification-data';
import { PushNotificationTypeEnum } from './types/push-notification-type';

@Injectable()
export class PushNotificationService {
	constructor(private expoService: ExpoService) {}

	gradeUpdated(
		expoPushToken: string,
		subjectId: number,
		externalPortalSubjectWithGrade: ExternalPortalSubjectWithGrade
	) {
		if (externalPortalSubjectWithGrade.status !== GradeStatus.EMPTY) {
			let title: string;
			let body: string;

			const data: PushNotificationGradeUpdatedData = {
				type: PushNotificationTypeEnum.GRADE_UPDATED,
				subjectId: subjectId.toString()
			};

			if (externalPortalSubjectWithGrade.status === GradeStatus.PASS) {
				switch (externalPortalSubjectWithGrade.controlType) {
					case ControlType.EXAM: {
						title = 'Экзамен сдан';
						body = `${externalPortalSubjectWithGrade.name} − ${externalPortalSubjectWithGrade.mark}, поздравляем!`;
						break;
					}
					case ControlType.GRADED_TEST: {
						title = 'Диф зачёт сдан';
						body = `${externalPortalSubjectWithGrade.name} − ${externalPortalSubjectWithGrade.mark}, поздравляем!`;
						break;
					}
					case ControlType.TEST: {
						title = 'Зачёт сдан';
						body = `${externalPortalSubjectWithGrade.name} − зачтено, поздравляем!`;
						break;
					}
				}
			} else if (externalPortalSubjectWithGrade.status === GradeStatus.FAIL) {
				switch (externalPortalSubjectWithGrade.controlType) {
					case ControlType.EXAM: {
						title = 'Экзамен не сдан';
						body = `${externalPortalSubjectWithGrade.name} − ${externalPortalSubjectWithGrade.mark}, не расстраивайся!`;
						break;
					}
					case ControlType.GRADED_TEST: {
						title = 'Диф зачёт не сдан';
						body = `${externalPortalSubjectWithGrade.name} − ${externalPortalSubjectWithGrade.mark}, не расстраивайся!`;
						break;
					}
					case ControlType.TEST: {
						title = 'Зачёт не сдан';
						body = `${externalPortalSubjectWithGrade.name} − не зачтено, не расстраивайся!`;
						break;
					}
				}
			}

			this.expoService
				.sendPushNotification(expoPushToken, { title, body, data })
				.catch(() => {});
		}
	}

	eventCreated(
		expoPushToken: string,
		subjectId: number,
		externalPortalSubjectName: string,
		externalPortalEvent: ExternalPortalEvent
	) {
		const data: PushNotificationEventCreatedData = {
			type: PushNotificationTypeEnum.EVENT_CREATED,
			subjectId: subjectId.toString()
		};

		if (externalPortalEvent.status === EventStatus.ABSENCE) {
			this.expoService
				.sendPushNotification(expoPushToken, {
					title: 'Пропуск',
					body: `${externalPortalSubjectName} − нужно отработать`,
					data
				})
				.catch(() => {});
		}

		if (externalPortalEvent.status === EventStatus.MARK) {
			this.expoService
				.sendPushNotification(expoPushToken, {
					title: 'Новый балл',
					body: `${externalPortalSubjectName} − ${externalPortalEvent.mark}, посмотри свой средний балл`,
					data
				})
				.catch(() => {});
		}
	}

	eventUpdated(
		expoPushToken: string,
		subjectId: number,
		externalPortalSubjectName: string,
		externalPortalEvent: ExternalPortalEvent
	) {
		const data: PushNotificationEventUpdatedData = {
			type: PushNotificationTypeEnum.EVENT_UPDATED,
			subjectId: subjectId.toString()
		};

		if (externalPortalEvent.status === EventStatus.UPWORKED) {
			this.expoService
				.sendPushNotification(expoPushToken, {
					title: 'Пропуск отработан',
					body: `${externalPortalSubjectName} − можно расслабиться`,
					data
				})
				.catch(() => {});
		}

		if (externalPortalEvent.status === EventStatus.MARK) {
			this.expoService
				.sendPushNotification(expoPushToken, {
					title: 'Балл изменился',
					body: `${externalPortalSubjectName} − ${externalPortalEvent.mark}, посмотри свой средний балл`,
					data
				})
				.catch(() => {});
		}
	}
}
