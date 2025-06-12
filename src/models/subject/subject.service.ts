import { PrismaService } from 'src/models/prisma/prisma.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { StudentService } from '../student/student.service';

@Injectable()
export class SubjectService {
	constructor(
		private prisma: PrismaService,
		private studentService: StudentService
	) {}

	async getAllWithGrade(studentId: number) {
		const student = await this.studentService.findById(studentId);

		const subjectList = await this.prisma.subject.findMany({
			where: {
				studentId: student.id,
				grade: {
					semester: student.semester
				}
			},
			orderBy: [
				{
					grade: { isNew: 'desc' }
				},
				{
					controlType: 'asc'
				},
				{
					name: { name: 'asc' }
				}
			],
			include: {
				name: true,
				ratingBySemesterList: {
					orderBy: {
						semester: 'asc'
					}
				},
				grade: true
			}
		});

		return subjectList.map(subject => ({
			id: subject.id,
			name: subject.name.name,
			controlType: subject.controlType,
			ratingBySemesterList: subject.ratingBySemesterList.map(
				ratingBySemester => ({
					id: ratingBySemester.id,
					semester: ratingBySemester.semester,
					averageMark: ratingBySemester.averageMark
				})
			),
			grade: {
				id: subject.grade.id,
				semester: subject.grade.semester,
				status: subject.grade.status,
				date: subject.grade.date,
				mark: subject.grade.mark,
				isNew: subject.grade.isNew
			}
		}));
	}

	async getCountGradeNews(studentId: number) {
		const student = await this.studentService.findById(studentId);

		const count = await this.prisma.grade.count({
			where: {
				subject: { studentId },
				semester: student.semester,
				isNew: true
			}
		});

		return { count };
	}

	async getAllWithRating(studentId: number) {
		const student = await this.studentService.findById(studentId);

		const subjectList = await this.prisma.subject.findMany({
			where: {
				studentId: student.id,
				ratingBySemesterList: {
					some: {
						semester: student.semester
					}
				}
			},
			orderBy: [
				{
					controlType: 'asc'
				},
				{
					name: {
						name: 'asc'
					}
				}
			],
			include: {
				name: true,
				ratingBySemesterList: {
					where: {
						semester: student.semester
					},
					include: {
						eventList: {
							orderBy: {
								date: 'asc'
							}
						}
					}
				}
			}
		});

		return subjectList
			.map(subject => ({
				id: subject.id,
				name: subject.name.name,
				controlType: subject.controlType,
				ratingByCurrentSemester: subject.ratingBySemesterList[0]
					? {
							averageMark: subject.ratingBySemesterList[0].averageMark,
							eventList: subject.ratingBySemesterList[0].eventList.map(
								event => ({
									id: event.id,
									status: event.status,
									mark: event.mark,
									isNew: event.isNew
								})
							)
						}
					: {
							averageMark: null,
							eventList: []
						}
			}))
			.sort((one, two) => {
				if (one.ratingByCurrentSemester.eventList.some(item => item.isNew)) {
					return -1;
				}

				if (two.ratingByCurrentSemester.eventList.some(item => item.isNew)) {
					return 1;
				}

				return 0;
			});
	}

	async getByIdWithRating(studentId: number, subjectId: number) {
		const subject = await this.prisma.subject.findFirst({
			where: {
				studentId,
				id: subjectId
			},
			include: {
				name: true,
				ratingBySemesterList: {
					orderBy: {
						semester: 'asc'
					},
					include: {
						eventList: {
							orderBy: {
								date: 'asc'
							}
						}
					}
				}
			}
		});

		if (!subject) {
			throw new NotFoundException();
		}

		return {
			id: subject.id,
			name: subject.name.name,
			controlType: subject.controlType,
			ratingBySemesterList: subject.ratingBySemesterList.map(
				ratingBySemester => ({
					id: ratingBySemester.id,
					semester: ratingBySemester.semester,
					averageMark: ratingBySemester.averageMark,
					eventList: ratingBySemester.eventList.map(event => ({
						id: event.id,
						status: event.status,
						date: event.date,
						mark: event.mark,
						isNew: event.isNew
					}))
				})
			)
		};
	}

	async getCountRatingNews(studentId: number) {
		const student = await this.studentService.findById(studentId);

		const count = await this.prisma.event.count({
			where: {
				ratingBySemester: {
					subject: { studentId },
					semester: student.semester
				},
				isNew: true
			}
		});

		return { count };
	}

	async viewGradeBySubjectId(studentId: number, subjectId: number) {
		try {
			await this.prisma.grade.update({
				where: {
					subject: { studentId },
					subjectId,
					isNew: true
				},
				data: {
					isNew: false
				}
			});
		} catch (error) {
			if (error.code === 'P2025') {
				const subject = await this.prisma.subject.findFirst({
					where: {
						studentId,
						id: subjectId
					}
				});

				if (!subject) {
					throw new NotFoundException();
				}
			} else {
				throw error;
			}
		}
	}

	async viewEventsBySubjectId(studentId: number, subjectId: number) {
		const updatedEvents = await this.prisma.event.updateMany({
			where: {
				ratingBySemester: {
					subject: { studentId },
					subjectId
				},
				isNew: true
			},
			data: {
				isNew: false
			}
		});

		if (updatedEvents.count === 0) {
			const subject = await this.prisma.subject.findFirst({
				where: {
					studentId,
					id: subjectId
				}
			});

			if (!subject) {
				throw new NotFoundException();
			}
		}
	}
}
