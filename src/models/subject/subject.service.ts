import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { StudentService } from '../student/student.service';

@Injectable()
export class SubjectService {
	constructor(
		private prisma: PrismaService,
		private studentService: StudentService
	) {}

	async getAll(studentId: number) {
		const student = await this.studentService.findById(studentId)

		const subjectList = await this.prisma.subject.findMany({
			where: {
				studentId: student.id,
				grade: {
					semester: student.semester
				}
			},
			include: {
				name: true,
				ratingBySemesterList: {
					include: {
						eventList: true
					}
				},
				grade: true
			}
		})

		return subjectList.map(subject => ({
			id: subject.id,
			name: subject.name.name,
			controlType: subject.controlType,
			ratingBySemesterList: subject.ratingBySemesterList.map(ratingBySemester => ({
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
			})),
			grade: {
				id: subject.grade.id,
				semester: subject.grade.semester,
				status: subject.grade.status,
				date: subject.grade.date,
				mark: subject.grade.mark,
				isNew: subject.grade.isNew
			}
		}))
	}

	async getGradeAll(studentId: number) {
		const student = await this.studentService.findById(studentId)

		const subjectList = await this.prisma.subject.findMany({
			where: {
				studentId: student.id,
				grade: {
					semester: student.semester
				}
			},
			include:{
				name: true,
				ratingBySemesterList: true,
				grade: true
			}
		})

		return subjectList.map(subject => ({
			id: subject.id,
			name: subject.name.name,
			controlType: subject.controlType,
			ratingBySemesterList: subject.ratingBySemesterList.map(ratingBySemester => ({
				id: ratingBySemester.id,
				semester: ratingBySemester.semester,
				averageMark: ratingBySemester.averageMark
			})),
			grade: {
				id: subject.grade.id,
				semester: subject.grade.semester,
				status: subject.grade.status,
				date: subject.grade.date,
				mark: subject.grade.mark,
				isNew: subject.grade.isNew
			}
		}))
	}

	async getRatingAll(studentId: number) {
		const student = await this.studentService.findById(studentId)

		const subjectList = await this.prisma.subject.findMany({
			where: {
				studentId: student.id,
				grade: {
					semester: student.semester
				}
			},
			include: {
				name: true,
				ratingBySemesterList: {
					where: {
						semester: student.semester
					},
					include: {
						eventList: true
					}
				}
			}
		})

		return subjectList.map(subject => ({
			id: subject.id,
			name: subject.name.name,
			controlType: subject.controlType,
			ratingByCurrentSemester: subject.ratingBySemesterList[0] ? {
				averageMark: subject.ratingBySemesterList[0].averageMark,
				eventList: subject.ratingBySemesterList[0].eventList.map(event => ({
					id: event.id,
					status: event.status,
					date: event.date,
					mark: event.mark,
					isNew: event.isNew
				}))
			} : null
		}))
	}

	async viewGradeById(id: number) {
		await this.prisma.grade.update({
			where: { id },
			data: { isNew: false }
		})
	}

	async viewEventById(id: number) {
		await this.prisma.event.update({
			where: { id },
			data: { isNew: false }
		})
	}
}
