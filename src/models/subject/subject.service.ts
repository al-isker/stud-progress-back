import { Event } from '@prisma/client';
import { PrismaService } from 'src/models/prisma/prisma.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { StudentService } from '../student/student.service';

@Injectable()
export class SubjectService {
	constructor(
		private prisma: PrismaService,
		private studentService: StudentService
	) {}

	private calculateImpactLastMark(
		averageMark: number | null,
		eventList: Event[]
	) {
		if (averageMark === null) {
			return null;
		}

		const eventListWithMarkOnly = eventList.filter(item => item.mark !== null);

		const lastMark = eventListWithMarkOnly.at(-1).mark;

		const averageMarkWithoutLastMark =
			(averageMark * eventListWithMarkOnly.length - lastMark) /
			(eventListWithMarkOnly.length - 1);

		const impactLastMark = averageMark - averageMarkWithoutLastMark;

		return Math.round(impactLastMark * 1000) / 1000;
	}

	private async calculateStudentPercentWithBelowAverageMark(
		subjectNameId: number,
		averageMark: number | null
	) {
		if (averageMark === null) {
			return null;
		}

		const subjectCount = await this.prisma.subject.count({
			where: {
				nameId: subjectNameId
			}
		});

		const subjectWithBelowAverageMarkCount = await this.prisma.subject.count({
			where: {
				nameId: subjectNameId,
				ratingBySemesterList: {
					every: {
						averageMark: {
							lt: averageMark
						}
					}
				}
			}
		});

		const studentWithBelowAverageMarkPercent =
			(subjectWithBelowAverageMarkCount / subjectCount) * 100;

		return Math.round(studentWithBelowAverageMarkPercent);
	}

	private calculateDaysWithoutMark(eventList: Event[]) {
		let lastEventDate: Date;

		for (let i = eventList.length - 1; i !== 0; i--) {
			const event = eventList[i];

			if (event.mark !== null) {
				lastEventDate = event.date;

				break;
			}
		}

		if (!lastEventDate) {
			return null;
		}

		const today = new Date();

		const timeWithoutMark = Math.abs(today.getTime() - lastEventDate.getTime());

		const daysWithoutMark = Math.ceil(timeWithoutMark / (1000 * 60 * 60 * 24));

		return daysWithoutMark;
	}

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
		const student = await this.studentService.findById(studentId);

		const subject = await this.prisma.subject.findFirst({
			where: {
				studentId,
				id: subjectId
			},
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

		if (!subject) {
			throw new NotFoundException();
		}

		return {
			id: subject.id,
			name: subject.name.name,
			controlType: subject.controlType,
			ratingByCurrentSemester: subject.ratingBySemesterList[0]
				? {
						averageMark: subject.ratingBySemesterList[0].averageMark,
						impactLastMark: this.calculateImpactLastMark(
							subject.ratingBySemesterList[0].averageMark,
							subject.ratingBySemesterList[0].eventList
						),
						studentPercentWithBelowAverageMark:
							await this.calculateStudentPercentWithBelowAverageMark(
								subject.nameId,
								subject.ratingBySemesterList[0].averageMark
							),
						daysWithoutMark: this.calculateDaysWithoutMark(
							subject.ratingBySemesterList[0].eventList
						),
						eventList: subject.ratingBySemesterList[0].eventList.map(event => ({
							id: event.id,
							status: event.status,
							date: event.date,
							mark: event.mark,
							isNew: event.isNew
						}))
					}
				: {
						averageMark: null,
						eventList: []
					}
		};
	}
}
