import { Event, Student } from '@prisma/client';
import { isExist } from 'src/common/lib/light-lodash/is-exist';
import { PrismaService } from 'src/models/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { DgmuSubjectListWithEventList } from '../dgmu/types/dgmu-subject-list-with-event-list.type';

@Injectable()
export class RatingBySemesterService {
	constructor(private prisma: PrismaService) {}

	private calculateAverageMark(eventList: Pick<Event, 'mark'>[]) {
		let marksCount = 0;

		const marksSum = eventList.reduce((sum, { mark }) => {
			if (isExist(mark)) {
				marksCount++;

				return sum + mark;
			}

			return sum;
		}, 0);

		const averageMark = marksCount > 0 ? marksSum / marksCount : null;

		return averageMark;
	}

	private async findSubjectForUpdate(
		student: Pick<Student, 'id' | 'semester'>,
		subjectName: string
	) {
		const existingSubject = await this.prisma.subject.findFirst({
			where: {
				studentId: student.id,
				name: {
					name: subjectName
				},
				ratingBySemesterList: {
					some: {
						semester: student.semester
					}
				}
			},
			include: {
				grade: true,
				ratingBySemesterList: {
					include: {
						eventList: true
					}
				}
			}
		});

		if (existingSubject) {
			return existingSubject;
		}

		const eponymousSubjects = await this.prisma.subject.findMany({
			where: {
				studentId: student.id,
				name: {
					name: subjectName
				}
			},
			include: {
				grade: true,
				ratingBySemesterList: {
					include: {
						eventList: true
					}
				}
			}
		});

		if (eponymousSubjects.length) {
			const eponymousSubjectsSorted = eponymousSubjects
				.filter(item => item.grade.semester >= student.semester)
				.sort(
					(itemOne, itemTwo) => itemOne.grade.semester - itemTwo.grade.semester
				);

			return eponymousSubjectsSorted[0];
		}
	}

	async updateBySemester(
		student: Pick<Student, 'id' | 'semester'>,
		dgmuSubjectList: DgmuSubjectListWithEventList
	) {
		await Promise.all(
			dgmuSubjectList.map(async dgmuSubject => {
				const existingSubject = await this.findSubjectForUpdate(
					student,
					dgmuSubject.name
				);

				const existingRatingBySemester =
					existingSubject.ratingBySemesterList?.find(item => {
						return item.semester === student.semester;
					});

				if (!existingRatingBySemester) {
					await this.prisma.ratingBySemester.create({
						data: {
							subjectId: existingSubject.id,
							semester: student.semester,
							averageMark: this.calculateAverageMark(dgmuSubject.eventList),
							eventList: {
								createMany: {
									data: dgmuSubject.eventList.map(event => ({
										...event,
										isNew: true
									}))
								}
							}
						}
					});
				} else {
					await this.prisma.$transaction(
						dgmuSubject.eventList
							.map(dgmuEvent => {
								const existingEvent = existingRatingBySemester.eventList.find(
									item => {
										return item.date.getTime() === dgmuEvent.date.getTime();
									}
								);

								if (!existingEvent) {
									return this.prisma.event.create({
										data: {
											...dgmuEvent,
											isNew: true,
											ratingBySemesterId: existingRatingBySemester.id
										}
									});
								}

								if (existingEvent.status !== dgmuEvent.status) {
									return this.prisma.event.update({
										where: {
											date_ratingBySemesterId: {
												date: dgmuEvent.date,
												ratingBySemesterId: existingRatingBySemester.id
											}
										},
										data: {
											...dgmuEvent,
											isNew:
												existingEvent?.isNew ||
												existingEvent?.status !== dgmuEvent.status ||
												existingEvent?.mark !== dgmuEvent.mark
										}
									});
								}
							})
							.filter(item => item !== undefined)
					);
				}
			})
		);
	}
}
