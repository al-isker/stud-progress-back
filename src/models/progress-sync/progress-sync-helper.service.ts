import { Event, Grade, Prisma } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { ExternalPortalEvent } from '../external-portal/types/external-portal-subject-list-with-event-list.type';
import { ExternalPortalSubjectWithGrade } from '../external-portal/types/external-portal-subject-list-with-grade.type';

@Injectable()
export class ProgressSyncHelperService {
	calculateAverageMark(markList: Array<number | null>) {
		let markCount = 0;

		const markSum = markList.reduce((sum, mark) => {
			if (mark === null) {
				return sum;
			}

			markCount++;

			return sum + mark;
		}, 0);

		if (markSum === 0) {
			return null;
		}

		const averageMark = markSum / markCount;

		return Math.round(averageMark * 1000) / 1000;
	}

	findMatchingSubjectForGradeSync(
		subjects: Array<
			Prisma.SubjectGetPayload<{
				include: {
					name: true;
					grade: true;
				};
			}>
		>,
		subjectName: string
	) {
		const matchingSubject = subjects.find(
			subject => subject.name.name === subjectName
		);

		return matchingSubject ?? null;
	}

	findMatchingSubjectForRatingSync(
		subjects: Array<
			Prisma.SubjectGetPayload<{
				include: {
					name: true;
					grade: true;
					ratingBySemesterList: {
						include: {
							eventList: true;
						};
					};
				};
			}>
		>,
		semester: number,
		subjectName: string
	) {
		let sameNameSubjects: typeof subjects;

		const isEllipsis = subjectName.endsWith('...');

		if (isEllipsis) {
			const normalizeSubjectName = subjectName.slice(0, -3);

			sameNameSubjects = subjects.filter(subject => {
				return subject.name.name.startsWith(normalizeSubjectName);
			});
		} else {
			sameNameSubjects = subjects.filter(subject => {
				return subject.name.name === subjectName;
			});
		}

		const matchingSubjectCurrentSemester = sameNameSubjects.find(subject =>
			subject.ratingBySemesterList.some(item => item.semester === semester)
		);

		if (matchingSubjectCurrentSemester) {
			return matchingSubjectCurrentSemester;
		}

		const sortedSameNameSubjects = sameNameSubjects.toSorted(
			(subjectOne, subjectTwo) => {
				return subjectOne.grade.semester - subjectTwo.grade.semester;
			}
		);

		const matchingSubjectNextSemester = sortedSameNameSubjects.find(
			subject => subject.grade.semester >= semester
		);

		if (matchingSubjectNextSemester) {
			return matchingSubjectNextSemester;
		}

		const matchingSubjectPrevSemester = sortedSameNameSubjects.findLast(
			subject => subject.grade.semester < semester
		);

		return matchingSubjectPrevSemester ?? null;
	}

	hasGradeChanged(
		existingGrade: Pick<Grade, 'status' | 'mark' | 'date'>,
		externalPortalSubjectWithGrade: ExternalPortalSubjectWithGrade
	) {
		return (
			existingGrade.status !== externalPortalSubjectWithGrade.status ||
			existingGrade.mark !== externalPortalSubjectWithGrade.mark ||
			existingGrade.date?.getTime() !==
				externalPortalSubjectWithGrade.date?.getTime()
		);
	}

	differentEvents(
		existingEventList: Event[],
		externalPortalEventList: ExternalPortalEvent[]
	) {
		const created: ExternalPortalEvent[] = [];
		const updated: ExternalPortalEvent[] = [];

		for (const externalPortalEvent of externalPortalEventList) {
			const existingEvent = existingEventList.find(item => {
				return item.date.getTime() === externalPortalEvent.date.getTime();
			});

			if (!existingEvent) {
				created.push(externalPortalEvent);
				continue;
			}

			if (
				existingEvent.status !== externalPortalEvent.status ||
				existingEvent.mark !== externalPortalEvent.mark
			) {
				updated.push(externalPortalEvent);
			}
		}

		return { created, updated };
	}
}
