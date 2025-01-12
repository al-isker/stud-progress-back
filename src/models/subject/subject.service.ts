import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { StudentService } from '../student/student.service';

@Injectable()
export class SubjectService {
	constructor(
		private prisma: PrismaService,
		private studentService: StudentService
	) {}

	mapName(subjects: any) {
		return subjects.map(item => {
			const {name, ...subject} = item

			return {
				name: name.name,
				...subject
			}
		})
	}

	async getAll(studentId: number) {
		const student = await this.studentService.findById(studentId)

		const subjects = await this.prisma.subject.findMany({
			where: {
				studentId: student.id,
				semesters: {
					some: {
						number: student.semester
					}
				}
			},
			select: {
				id: true,
				name: {
					select: {
						name: true	
					}
				},
				controlType: true,
				averageMark: true,
				semesters: {
					select: {
						number: true
					}
				},
				rating: {
					select: {
						id: true,
						date: true,
						mark: true,
						status: true,
						isNew: true
					}
				},
				grade: {
					select: {
						id: true,
						date: true,
						mark: true,
						status: true,
						isNew: true
					}
				}
			}
		})

		return this.mapName(subjects);
	}

	async getGradeAll(studentId: number) {
		const student = await this.studentService.findById(studentId)

		const subjects = await this.prisma.subject.findMany({
			where: {
				studentId: student.id,
				semesters: {
					some: {
						number: student.semester
					}
				}
			},
			select: {
				id: true,
				name: true,
				averageMark: true,
				controlType: true,
				semesters: {
					select: {
						number: true
					}
				},
				grade: {
					select: {
						id: true,
						date: true,
						mark: true,
						status: true,
						isNew: true
					}
				}
			}
		})

		return this.mapName(subjects);
	}

	async getRatingAll(studentId: number) {
		const student = await this.studentService.findById(studentId)

		const subjects = await this.prisma.subject.findMany({
			where: {
				studentId: student.id,
				semesters: {
					some: {
						number: student.semester
					}
				}
			},
			select: {
				id: true,
				name: true,
				controlType: true,
				averageMark: true,
				semesters: {
					select: {
						number: true
					}
				},
				rating: {
					select: {
						id: true,
						date: true,
						mark: true,
						status: true,
						isNew: true
					}
				}
			}
		})

		return this.mapName(subjects);
	}
	
	async viewGradeById(id: number) {
		await this.prisma.grade.update({
			where: { id },
			data: { isNew: false }
		})
	}

	async viewRatingById(id: number) {
		await this.prisma.rating.update({
			where: { id },
			data: { isNew: false }
		})
	}
}
