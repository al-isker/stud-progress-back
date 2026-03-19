import { GradeStatus, Prisma, Student } from '@prisma/client';
import { ExternalPortalEvent } from 'src/models/external-portal/types/external-portal-subject-list-with-event-list.type';
import { ExternalPortalSubjectWithGrade } from 'src/models/external-portal/types/external-portal-subject-list-with-grade.type';
import { PrismaService } from 'src/models/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ProgressSyncRepository {
	constructor(private prisma: PrismaService) {}

	async findManySubjectForGradeSync(studentId: number, tx?: Prisma.TransactionClient) {
		return await (tx ?? this.prisma).subject.findMany({
			where: {
				studentId
			},
			include: {
				name: true,
				grade: true
			}
		});
	}

	async createSubjectWithGrade(
		student: Pick<Student, 'id'>,
		semester: number,
		externalPortalSubjectWithGrade: ExternalPortalSubjectWithGrade,
		tx?: Prisma.TransactionClient
	) {
		return await (tx ?? this.prisma).subject.create({
			data: {
				student: {
					connect: {
						id: student.id
					}
				},
				name: {
					connectOrCreate: {
						where: {
							name: externalPortalSubjectWithGrade.name
						},
						create: {
							name: externalPortalSubjectWithGrade.name
						}
					}
				},
				controlType: externalPortalSubjectWithGrade.controlType,
				grade: {
					create: {
						semester,
						date: externalPortalSubjectWithGrade.date,
						mark: externalPortalSubjectWithGrade.mark,
						status: externalPortalSubjectWithGrade.status,
						isNew: externalPortalSubjectWithGrade.status !== GradeStatus.EMPTY
					}
				}
			}
		});
	}

	async updateSubjectWithGrade(
		subjectId: number,
		externalPortalSubjectWithGrade: ExternalPortalSubjectWithGrade,
		tx?: Prisma.TransactionClient
	) {
		return await (tx ?? this.prisma).subject.update({
			where: {
				id: subjectId
			},
			data: {
				controlType: externalPortalSubjectWithGrade.controlType,
				grade: {
					update: {
						date: externalPortalSubjectWithGrade.date,
						mark: externalPortalSubjectWithGrade.mark,
						status: externalPortalSubjectWithGrade.status,
						isNew: true
					}
				}
			}
		});
	}

	async findManySubjectForRatingSync(studentId: number, tx?: Prisma.TransactionClient) {
		return await (tx ?? this.prisma).subject.findMany({
			where: {
				studentId
			},
			include: {
				name: true,
				grade: true,
				ratingBySemesterList: {
					include: {
						eventList: true
					}
				}
			}
		});
	}

	async createRatingBySemester(
		subjectId: number,
		semester: number,
		externalPortalEventList: ExternalPortalEvent[],
		averageMark: number | null,
		tx?: Prisma.TransactionClient
	) {
		return await (tx ?? this.prisma).ratingBySemester.create({
			data: {
				subjectId,
				semester,
				averageMark,
				eventList: {
					createMany: {
						data: externalPortalEventList.map(event => ({
							...event,
							isNew: false
						}))
					}
				}
			}
		});
	}

	async createEvent(
		ratingBySemesterId: number,
		externalPortalEvent: ExternalPortalEvent,
		tx?: Prisma.TransactionClient
	) {
		return await (tx ?? this.prisma).event.create({
			data: {
				ratingBySemesterId,
				status: externalPortalEvent.status,
				date: externalPortalEvent.date,
				mark: externalPortalEvent.mark,
				isNew: true
			}
		});
	}

	async updateEvent(
		ratingBySemesterId: number,
		externalPortalEvent: ExternalPortalEvent,
		tx?: Prisma.TransactionClient
	) {
		return await (tx ?? this.prisma).event.update({
			where: {
				date_ratingBySemesterId: {
					date: externalPortalEvent.date,
					ratingBySemesterId
				}
			},
			data: {
				status: externalPortalEvent.status,
				date: externalPortalEvent.date,
				mark: externalPortalEvent.mark,
				isNew: true
			}
		});
	}

	async updateAverageMarkBySemester(
		ratingBySemesterId: number,
		averageMark: number | null,
		tx?: Prisma.TransactionClient
	) {
		return await (tx ?? this.prisma).ratingBySemester.update({
			where: {
				id: ratingBySemesterId
			},
			data: {
				averageMark
			}
		});
	}
}
