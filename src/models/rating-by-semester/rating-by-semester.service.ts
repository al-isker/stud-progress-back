import { Injectable } from '@nestjs/common';
import { Event, Student, Subject, SubjectName } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { DgmuService } from '../dgmu/dgmu.service';
import { DgmuSubjectListWithEventList } from '../dgmu/types/dgmu-subject-list-with-event-list';
import { StudentService } from '../student/student.service';

@Injectable()
export class RatingBySemesterService {
	constructor(
		private prisma: PrismaService,
		private studentService: StudentService,
		private dgmuService: DgmuService
	) {}

	private averageMark(eventList: Pick<Event, 'mark'>[]) {
		let marksCount = 0;

		const marksSum = eventList.reduce((sum, { mark }) => {
			if (mark) {
				marksCount++

				return sum + mark
			}
			
			return sum;
		}, 0);

		const averageMark = marksCount > 0 ? (marksSum / marksCount) : null

		return averageMark
	}

	private async findSubjectForUpdate({studentId, name, semester}: Pick<SubjectName, 'name'> & Pick<Subject, 'studentId'> & Pick<Student, 'semester'> ) {
		const existingSubject = await this.prisma.subject.findFirst({
			where: {
				studentId,
				name: { name },
				ratingBySemesterList: {
					some: { semester }
				}
			},
			include: {
				grade: true,
				ratingBySemesterList: {
					include: {
						eventList: true
					}
				}
			},
		})
	
		if (existingSubject) {
			return existingSubject;
		}
			
		const eponymousSubjects = await this.prisma.subject.findMany({
			where: {
				studentId,
				name: { name }
			},
			include: {
				grade: true,
				ratingBySemesterList: {
					include: {
						eventList: true
					}
				}
			}
		})

		if (eponymousSubjects.length) {
			const eponymousSubjectsSorted = eponymousSubjects
				.filter(item => item.grade.semester >= semester)
				.sort((itemOne, itemTwo) => itemOne.grade.semester - itemTwo.grade.semester)

			return eponymousSubjectsSorted[0];
		}
	}

	async someUpdate(dgmuSubjectList: DgmuSubjectListWithEventList, student: Pick<Student, 'id' | 'semester'>) {
		await Promise.all(dgmuSubjectList.map(async dgmuSubject => {
			const existingSubject = await this.findSubjectForUpdate({
				studentId: student.id,
				name: dgmuSubject.name,
				semester: student.semester,
			})

			const existingRatingBySemester = existingSubject.ratingBySemesterList?.find(item => {
				return item.semester === student.semester
			})

			if (!existingRatingBySemester) {
				await this.prisma.ratingBySemester.create({
					data: {
						subjectId: existingSubject.id,
						semester: student.semester,
						averageMark: this.averageMark(dgmuSubject.eventList),
						eventList: {
							createMany: {
								data: dgmuSubject.eventList.map(event => ({ ...event, isNew: true }))
							}
						},
					}
				})
			} else {
				await this.prisma.$transaction(
					dgmuSubject.eventList
						.map(dgmuEvent => {
							const existingEvent = existingRatingBySemester.eventList.find(item => {
								return item.date.getTime() === dgmuEvent.date.getTime()
							})

							if (!existingEvent) {
								return this.prisma.event.create({
									data: {
										...dgmuEvent,
										isNew: true,
										ratingBySemesterId: existingRatingBySemester.id,
									}
								})
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
										isNew: existingEvent?.isNew || (
											existingEvent?.status !== dgmuEvent.status ||
											existingEvent?.mark !== dgmuEvent.mark
										),
									}
								})
							}
						})
						.filter(item => item !== undefined)
				)
			}
		}))
	}

	async specificUpdate(studentId: number) {
		const student = await this.studentService.findById(studentId)

		const { subjectListWithEventList } = await this.dgmuService.findManyOrThrow(student, {
			eventList: true
		})

		await this.someUpdate(subjectListWithEventList, student)
	}
}
