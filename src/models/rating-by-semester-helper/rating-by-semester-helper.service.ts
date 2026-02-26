import { Event, Prisma, Student } from '@prisma/client';
import { PrismaService } from 'src/models/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { DgmuSubjectListWithEventList } from '../dgmu/types/dgmu-subject-list-with-event-list.type';
import { PushNotificationService } from '../push-notification/push-notification.service';

@Injectable()
export class RatingBySemesterHelperService {
	constructor(
		private prisma: PrismaService,
		private pushNotificationService: PushNotificationService
	) {}

	private calculateAverageMark(eventList: Pick<Event, 'mark'>[]) {
		let markCount = 0;

		const markSum = eventList.reduce((sum, { mark }) => {
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

	private async findSubjectForUpdate(
		student: Pick<Student, 'id' | 'semester'>,
		subjectName: string,
		tx?: Prisma.TransactionClient
	) {
		const prismaContext = tx ?? this.prisma;

		const isEllipsis = subjectName.endsWith('...');
		const subjectNameWithoutEllipsis = subjectName.slice(0, -3);

		const existingSubject = await prismaContext.subject.findFirst({
			where: {
				studentId: student.id,
				name: {
					name: isEllipsis
						? { startsWith: subjectNameWithoutEllipsis }
						: subjectName
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

		const eponymousSubjects = await prismaContext.subject.findMany({
			where: {
				studentId: student.id,
				name: {
					name: isEllipsis
						? { startsWith: subjectNameWithoutEllipsis }
						: subjectName
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
			const eponymousSubjectsSorted = eponymousSubjects.sort(
				(itemOne, itemTwo) => itemOne.grade.semester - itemTwo.grade.semester
			);

			const nextSubject = eponymousSubjectsSorted.find(
				item => item.grade.semester >= student.semester
			);

			if (nextSubject) {
				return nextSubject;
			}

			const prevSubject = eponymousSubjectsSorted
				.reverse()
				.find(item => item.grade.semester < student.semester);

			return prevSubject;
		}
	}

	async createBySemester(
		student: Pick<Student, 'id' | 'semester'>,
		dgmuSubjectList: DgmuSubjectListWithEventList,
		tx?: Prisma.TransactionClient
	) {
		const prismaContext = tx ?? this.prisma;

		await Promise.all(
			dgmuSubjectList.map(async dgmuSubject => {
				const existingSubject = await this.findSubjectForUpdate(
					student,
					dgmuSubject.name,
					tx
				);

				await prismaContext.ratingBySemester.create({
					data: {
						subjectId: existingSubject.id,
						semester: student.semester,
						averageMark: this.calculateAverageMark(dgmuSubject.eventList),
						eventList: {
							createMany: {
								data: dgmuSubject.eventList.map(event => ({
									...event,
									isNew: false
								}))
							}
						}
					}
				});
			})
		);
	}

	async updateBySemester(
		student: Pick<Student, 'id' | 'semester' | 'expoPushToken'>,
		dgmuSubjectList: DgmuSubjectListWithEventList,
		tx?: Prisma.TransactionClient
	) {
		const prismaContext = tx ?? this.prisma;

		await Promise.all(
			dgmuSubjectList.map(async dgmuSubject => {
				const existingSubject = await this.findSubjectForUpdate(
					student,
					dgmuSubject.name,
					tx
				);

				const existingRatingBySemester =
					existingSubject.ratingBySemesterList?.find(item => {
						return item.semester === student.semester;
					});

				if (!existingRatingBySemester) {
					await prismaContext.ratingBySemester.create({
						data: {
							subjectId: existingSubject.id,
							semester: student.semester,
							averageMark: this.calculateAverageMark(dgmuSubject.eventList),
							eventList: {
								createMany: {
									data: dgmuSubject.eventList.map(event => ({
										...event,
										isNew: false
									}))
								}
							}
						}
					});
				} else {
					await Promise.all(
						dgmuSubject.eventList
							.map(dgmuEvent => {
								const existingEvent = existingRatingBySemester.eventList.find(
									item => {
										return item.date.getTime() === dgmuEvent.date.getTime();
									}
								);

								if (!existingEvent) {
									this.pushNotificationService.eventCreated(
										student.expoPushToken,
										existingSubject.id,
										dgmuSubject,
										dgmuEvent
									);

									return prismaContext.event.create({
										data: {
											ratingBySemesterId: existingRatingBySemester.id,
											status: dgmuEvent.status,
											date: dgmuEvent.date,
											mark: dgmuEvent.mark,
											isNew: true
										}
									});
								}

								if (
									existingEvent?.status !== dgmuEvent.status ||
									existingEvent?.mark !== dgmuEvent.mark
								) {
									this.pushNotificationService.eventUpdated(
										student.expoPushToken,
										existingSubject.id,
										dgmuSubject,
										dgmuEvent
									);

									return prismaContext.event.update({
										where: {
											date_ratingBySemesterId: {
												date: dgmuEvent.date,
												ratingBySemesterId: existingRatingBySemester.id
											}
										},
										data: {
											status: dgmuEvent.status,
											date: dgmuEvent.date,
											mark: dgmuEvent.mark,
											isNew: true
										}
									});
								}
							})
							.filter(item => item !== undefined)
					);

					await prismaContext.ratingBySemester.update({
						where: {
							id: existingRatingBySemester.id
						},
						data: {
							averageMark: this.calculateAverageMark(dgmuSubject.eventList)
						}
					});
				}
			})
		);
	}
}
