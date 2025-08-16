import { ControlType, EventStatus, GradeStatus } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import {
	DgmuEvent,
	DgmuSubjectWithEventList
} from '../dgmu/types/dgmu-subject-list-with-event-list.type';
import { DgmuSubjectWithGrade } from '../dgmu/types/dgmu-subject-list-with-grade.type';
import { FcmService } from '../fcm/fcm.service';
import {
	PushNotificationEventCreatedData,
	PushNotificationEventUpdatedData,
	PushNotificationGradeUpdatedData
} from './types/push-notification-data';
import { PushNotificationTypeEnum } from './types/push-notification-type';

@Injectable()
export class PushNotificationService {
	constructor(private fcmService: FcmService) {}

	gradeUpdated(
		fcmToken: string,
		subjectId: number,
		dgmuSubject: DgmuSubjectWithGrade
	) {
		if (dgmuSubject.status !== GradeStatus.EMPTY) {
			let title: string;
			let body: string;

			const data: PushNotificationGradeUpdatedData = {
				type: PushNotificationTypeEnum.GRADE_UPDATED,
				subjectId: subjectId.toString()
			};

			if (dgmuSubject.status === GradeStatus.PASS) {
				switch (dgmuSubject.controlType) {
					case ControlType.EXAM: {
						title = 'Экзамен сдан';
						body = `${dgmuSubject.name} − ${dgmuSubject.mark}, поздравляем!`;
						break;
					}
					case ControlType.GRADED_TEST: {
						title = 'Диф зачёт сдан';
						body = `${dgmuSubject.name} − ${dgmuSubject.mark}, поздравляем!`;
						break;
					}
					case ControlType.TEST: {
						title = 'Зачёт сдан';
						body = `${dgmuSubject.name} − зачтено, поздравляем!`;
						break;
					}
				}
			} else if (dgmuSubject.status === GradeStatus.FAIL) {
				switch (dgmuSubject.controlType) {
					case ControlType.EXAM: {
						title = 'Экзамен не сдан';
						body = `${dgmuSubject.name} − ${dgmuSubject.mark}, не расстраивайся!`;
						break;
					}
					case ControlType.GRADED_TEST: {
						title = 'Диф зачёт не сдан';
						body = `${dgmuSubject.name} − ${dgmuSubject.mark}, не расстраивайся!`;
						break;
					}
					case ControlType.TEST: {
						title = 'Зачёт не сдан';
						body = `${dgmuSubject.name} − не зачтено, не расстраивайся!`;
						break;
					}
				}
			}

			this.fcmService
				.sendPushNotification(fcmToken, {
					data,
					notification: { title, body }
				})
				.catch(() => {});
		}
	}

	eventCreated(
		fcmToken: string,
		subjectId: number,
		dgmuSubject: DgmuSubjectWithEventList,
		dgmuEvent: DgmuEvent
	) {
		const data: PushNotificationEventCreatedData = {
			type: PushNotificationTypeEnum.EVENT_CREATED,
			subjectId: subjectId.toString()
		};

		if (dgmuEvent.status === EventStatus.ABSENCE) {
			this.fcmService
				.sendPushNotification(fcmToken, {
					data,
					notification: {
						title: 'Пропуск',
						body: `${dgmuSubject.name} − нужно отработать`
					}
				})
				.catch(() => {});
		}

		if (dgmuEvent.status === EventStatus.MARK) {
			this.fcmService
				.sendPushNotification(fcmToken, {
					data,
					notification: {
						title: 'Новый балл',
						body: `${dgmuSubject.name} − ${dgmuEvent.mark}, посмотри свой средний балл`
					}
				})
				.catch(() => {});
		}
	}

	eventUpdated(
		fcmToken: string,
		subjectId: number,
		dgmuSubject: DgmuSubjectWithEventList,
		dgmuEvent: DgmuEvent
	) {
		const data: PushNotificationEventUpdatedData = {
			type: PushNotificationTypeEnum.EVENT_UPDATED,
			subjectId: subjectId.toString()
		};

		if (dgmuEvent.status === EventStatus.UPWORKED) {
			this.fcmService
				.sendPushNotification(fcmToken, {
					data,
					notification: {
						title: 'Пропуск отработан',
						body: `${dgmuSubject.name} − можно расслабиться`
					}
				})
				.catch(() => {});
		}

		if (dgmuEvent.status === EventStatus.MARK) {
			this.fcmService
				.sendPushNotification(fcmToken, {
					data,
					notification: {
						title: 'Балл изменился',
						body: `${dgmuSubject.name} − ${dgmuEvent.mark}, посмотри свой средний балл`
					}
				})
				.catch(() => {});
		}
	}
}
