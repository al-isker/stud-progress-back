import { ControlType, EventStatus, GradeStatus } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import {
	DgmuEvent,
	DgmuSubjectWithEventList
} from '../dgmu/types/dgmu-subject-list-with-event-list.type';
import { DgmuSubjectWithGrade } from '../dgmu/types/dgmu-subject-list-with-grade.type';
import { FcmService } from '../fcm/fcm.service';
import {
	PushNotificationDataEventCreated,
	PushNotificationDataEventUpdated,
	PushNotificationDataGradeUpdated,
	PushNotificationTypeEnum
} from './types/push-notification-data';

@Injectable()
export class PushNotificationService {
	constructor(private fcmService: FcmService) {}

	async gradeUpdated(
		fcmToken: string,
		subjectId: number,
		dgmuSubject: DgmuSubjectWithGrade
	) {
		if (dgmuSubject.status !== GradeStatus.EMPTY) {
			let title: string;
			let body: string;

			const data: PushNotificationDataGradeUpdated = {
				type: PushNotificationTypeEnum.GRADE_UPDATED,
				subjectId: subjectId.toString()
			};

			if (dgmuSubject.status === GradeStatus.PASS) {
				if (dgmuSubject.controlType === ControlType.EXAM) {
					title = 'Экзамен сдан';
					body = `${dgmuSubject.name} − ${dgmuSubject.mark}, поздравляем!`;
				} else if (dgmuSubject.controlType === ControlType.GRADED_TEST) {
					title = 'Диф зачёт сдан';
					body = `${dgmuSubject.name} − ${dgmuSubject.mark}, поздравляем!`;
				} else if (dgmuSubject.controlType === ControlType.TEST) {
					title = 'Зачёт сдан';
					body = `${dgmuSubject.name} − зачтено, поздравляем!`;
				}
			} else if (dgmuSubject.status === GradeStatus.FAIL) {
				if (dgmuSubject.controlType === ControlType.EXAM) {
					title = 'Экзамен не сдан';
					body = `${dgmuSubject.name} − ${dgmuSubject.mark}, не расстраивайся!`;
				} else if (dgmuSubject.controlType === ControlType.GRADED_TEST) {
					title = 'Диф зачёт не сдан';
					body = `${dgmuSubject.name} − ${dgmuSubject.mark}, не расстраивайся!`;
				} else if (dgmuSubject.controlType === ControlType.TEST) {
					title = 'Зачёт не сдан';
					body = `${dgmuSubject.name} − не зачтено, не расстраивайся!`;
				}
			}

			return await this.fcmService.sendPushNotification(fcmToken, {
				data,
				notification: { title, body }
			});
		}
	}

	async eventCreated(
		fcmToken: string,
		subjectId: number,
		dgmuSubject: DgmuSubjectWithEventList,
		dgmuEvent: DgmuEvent
	) {
		const data: PushNotificationDataEventCreated = {
			type: PushNotificationTypeEnum.EVENT_CREATED,
			subjectId: subjectId.toString()
		};

		if (dgmuEvent.status === EventStatus.ABSENCE) {
			return await this.fcmService.sendPushNotification(fcmToken, {
				data,
				notification: {
					title: 'Пропуск',
					body: `${dgmuSubject.name} − нужно отработать`
				}
			});
		}

		if (dgmuEvent.status === EventStatus.MARK) {
			return await this.fcmService.sendPushNotification(fcmToken, {
				data,
				notification: {
					title: 'Новый балл',
					body: `${dgmuSubject.name} − ${dgmuEvent.mark}, посмотри свой средний балл`
				}
			});
		}
	}

	async eventUpdated(
		fcmToken: string,
		subjectId: number,
		dgmuSubject: DgmuSubjectWithEventList,
		dgmuEvent: DgmuEvent
	) {
		const data: PushNotificationDataEventUpdated = {
			type: PushNotificationTypeEnum.EVENT_UPDATED,
			subjectId: subjectId.toString()
		};

		if (dgmuEvent.status === EventStatus.UPWORKED) {
			return await this.fcmService.sendPushNotification(fcmToken, {
				data,
				notification: {
					title: 'Пропуск отработан',
					body: `${dgmuSubject.name} − можно расслабиться`
				}
			});
		}

		if (dgmuEvent.status === EventStatus.MARK) {
			return await this.fcmService.sendPushNotification(fcmToken, {
				data,
				notification: {
					title: 'Балл изменился',
					body: `${dgmuSubject.name} − ${dgmuEvent.mark}, посмотри свой средний балл`
				}
			});
		}
	}
}
