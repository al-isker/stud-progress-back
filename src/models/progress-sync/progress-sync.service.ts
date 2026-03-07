import { Prisma, Student } from '@prisma/client';
import { ExternalPortalProgress } from 'src/models/external-portal/types/external-portal-progress.type';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ExternalPortalSubjectListWithEventList } from '../external-portal/types/external-portal-subject-list-with-event-list.type';
import { ExternalPortalSubjectListWithGrade } from '../external-portal/types/external-portal-subject-list-with-grade.type';
import { PushNotificationService } from '../push-notification/push-notification.service';
import { ProgressSyncHelperService } from './progress-sync-helper.service';
import { ProgressSyncRepository } from './progress-sync.repository';

@Injectable()
export class ProgressSyncService {
	constructor(
		private progressSyncRepository: ProgressSyncRepository,
		private pushNotificationService: PushNotificationService,
		private progressSyncHelperService: ProgressSyncHelperService
	) {}

	private async createManySubjectWithGrade(
		student: Pick<Student, 'id'>,
		semester: number,
		externalPortalSubjectListWithGrade: ExternalPortalSubjectListWithGrade,
		tx?: Prisma.TransactionClient
	) {
		for (const externalPortalSubjectWithGrade of externalPortalSubjectListWithGrade) {
			await this.progressSyncRepository.createSubjectWithGrade(
				student,
				semester,
				externalPortalSubjectWithGrade,
				tx
			);
		}
	}

	private async createManyRating(
		student: Pick<Student, 'id'>,
		semester: number,
		externalPortalSubjectListWithEventList: ExternalPortalSubjectListWithEventList,
		tx?: Prisma.TransactionClient
	) {
		const subjects =
			await this.progressSyncRepository.findManySubjectForRatingSync(
				student.id,
				tx
			);

		for (const externalPortalSubjectWithEventList of externalPortalSubjectListWithEventList) {
			const matchingSubject =
				this.progressSyncHelperService.findMatchingSubjectForRatingSync(
					subjects,
					semester,
					externalPortalSubjectWithEventList.name
				);

			if (!matchingSubject) {
				throw new InternalServerErrorException(
					`Subject "${externalPortalSubjectWithEventList.name}" not found for initial rating sync`
				);
			}

			await this.progressSyncRepository.createRatingBySemester(
				matchingSubject.id,
				semester,
				externalPortalSubjectWithEventList.eventList,
				this.progressSyncHelperService.calculateAverageMark(
					externalPortalSubjectWithEventList.eventList.map(item => item.mark)
				),
				tx
			);
		}
	}

	private async updateManyGrade(
		student: Pick<Student, 'id' | 'expoPushToken'>,
		semester: number,
		externalPortalSubjectListWithGrade: ExternalPortalSubjectListWithGrade,
		tx?: Prisma.TransactionClient
	) {
		const notificationCallbacks = Array<() => void>();

		const subjects =
			await this.progressSyncRepository.findManySubjectForGradeSync(
				student.id,
				semester,
				tx
			);

		for (const externalPortalSubjectWithGrade of externalPortalSubjectListWithGrade) {
			const matchingSubject =
				this.progressSyncHelperService.findMatchingSubjectForGradeSync(
					subjects,
					externalPortalSubjectWithGrade.name
				);

			if (!matchingSubject?.grade) {
				throw new InternalServerErrorException(
					`Subject "${externalPortalSubjectWithGrade.name}" not found for grade sync`
				);
			}

			const hasGradeChanged = this.progressSyncHelperService.hasGradeChanged(
				matchingSubject.grade,
				externalPortalSubjectWithGrade
			);

			if (!hasGradeChanged) {
				continue;
			}

			await this.progressSyncRepository.updateSubjectWithGrade(
				matchingSubject.id,
				externalPortalSubjectWithGrade,
				tx
			);

			notificationCallbacks.push(() => {
				this.pushNotificationService.gradeUpdated(
					student.expoPushToken,
					matchingSubject.id,
					externalPortalSubjectWithGrade
				);
			});
		}

		return { notificationCallbacks };
	}

	private async updateManyRating(
		student: Pick<Student, 'id' | 'expoPushToken'>,
		semester: number,
		externalPortalSubjectListWithEventList: ExternalPortalSubjectListWithEventList,
		tx?: Prisma.TransactionClient
	) {
		const notificationCallbacks = Array<() => void>();

		const subjects =
			await this.progressSyncRepository.findManySubjectForRatingSync(
				student.id,
				tx
			);

		for (const externalPortalSubjectWithEventList of externalPortalSubjectListWithEventList) {
			const matchingSubject =
				this.progressSyncHelperService.findMatchingSubjectForRatingSync(
					subjects,
					semester,
					externalPortalSubjectWithEventList.name
				);

			if (!matchingSubject) {
				throw new InternalServerErrorException(
					`Subject "${externalPortalSubjectWithEventList.name}" not found for rating sync`
				);
			}

			const ratingByCurrentSemester = matchingSubject.ratingBySemesterList.find(
				item => item.semester === semester
			);

			const averageMark = this.progressSyncHelperService.calculateAverageMark(
				externalPortalSubjectWithEventList.eventList.map(item => item.mark)
			);

			if (!ratingByCurrentSemester) {
				await this.progressSyncRepository.createRatingBySemester(
					matchingSubject.id,
					semester,
					externalPortalSubjectWithEventList.eventList,
					averageMark,
					tx
				);

				continue;
			}

			const externalPortalDifferentEvents =
				this.progressSyncHelperService.differentEvents(
					ratingByCurrentSemester.eventList,
					externalPortalSubjectWithEventList.eventList
				);

			for (const externalPortalCreatedEvent of externalPortalDifferentEvents.created) {
				await this.progressSyncRepository.createEvent(
					ratingByCurrentSemester.id,
					externalPortalCreatedEvent,
					tx
				);

				notificationCallbacks.push(() => {
					this.pushNotificationService.eventCreated(
						student.expoPushToken,
						matchingSubject.id,
						externalPortalSubjectWithEventList.name,
						externalPortalCreatedEvent
					);
				});
			}

			for (const externalPortalUpdatedEvent of externalPortalDifferentEvents.updated) {
				await this.progressSyncRepository.updateEvent(
					ratingByCurrentSemester.id,
					externalPortalUpdatedEvent,
					tx
				);

				notificationCallbacks.push(() => {
					this.pushNotificationService.eventUpdated(
						student.expoPushToken,
						matchingSubject.id,
						externalPortalSubjectWithEventList.name,
						externalPortalUpdatedEvent
					);
				});
			}

			await this.progressSyncRepository.updateAverageMarkBySemester(
				ratingByCurrentSemester.id,
				averageMark,
				tx
			);
		}

		return { notificationCallbacks };
	}

	async init(
		student: Pick<Student, 'id'>,
		semester: number,
		externalPortalProgress: ExternalPortalProgress<{
			subjectListWithGradeByAllSemesters: true;
			subjectListWithEventList: true;
		}>,
		tx?: Prisma.TransactionClient
	) {
		for (const subjectListWithGradeBySemester of externalPortalProgress.subjectListWithGradeByAllSemesters) {
			await this.createManySubjectWithGrade(
				student,
				subjectListWithGradeBySemester.semester,
				subjectListWithGradeBySemester.subjectList,
				tx
			);
		}

		await this.createManyRating(
			student,
			semester,
			externalPortalProgress.subjectListWithEventList,
			tx
		);
	}

	async update(
		student: Pick<Student, 'id' | 'expoPushToken'>,
		semester: number,
		externalPortalProgress: ExternalPortalProgress<{
			subjectListWithGrade: true;
			subjectListWithEventList: true;
		}>,
		tx?: Prisma.TransactionClient
	) {
		const gradeUpdateResult = await this.updateManyGrade(
			student,
			semester,
			externalPortalProgress.subjectListWithGrade,
			tx
		);

		const ratingUpdateResult = await this.updateManyRating(
			student,
			semester,
			externalPortalProgress.subjectListWithEventList,
			tx
		);

		const notificationCallbacks = [
			...gradeUpdateResult.notificationCallbacks,
			...ratingUpdateResult.notificationCallbacks
		];

		return { notificationCallbacks };
	}
}
