import { Injectable } from '@nestjs/common';
import { Student } from '@prisma/client';
import { DgmuService } from 'src/models/dgmu/dgmu.service';
import { StudentService } from 'src/models/student/student.service';
import { PrismaService } from 'src/prisma.service';

@Injectable()
export class RatingService {
	constructor(
		private dgmuService: DgmuService,
		private studentService: StudentService,
		private prisma: PrismaService
	) {}

	// переписать метод на SQL
	private async updateAverageMark(studentId: number) {
		const marks = await this.prisma.rating.findMany({
			where: {
				subject: { studentId }
			},
			select: {
				mark: true
			}
		})

		let marksCount = 0;

		const marksSum = marks.reduce((sum, {mark}) => {
			const numberMark = Number(mark);

			if(!isNaN(numberMark)) {
				marksCount++

				return sum + numberMark;
			}
			return sum;
		}, 0);

		const averageMark = marksSum / marksCount

		await this.studentService.update(studentId, {
			averageMark: averageMark !== 0 ? Number(averageMark.toFixed(1)) : null
		})
	}

	async updateRating(student: Pick<Student, 'id' | 'fullName' | 'password' | 'semester'>) {
		const dgmuSubjects = await this.dgmuService.findRating(student)

		await this.prisma.$transaction(async () => ([
			await this.studentService.update(student.id, {
				ratingUpdatedAt: new Date()
			}),

			...dgmuSubjects.map(async dgmuSubject => await this.prisma.subject.upsert({
				where: {
					name_studentId: {
						name: dgmuSubject.name,
						studentId: student.id
					}
				},
				update: {
					semester: student.semester,
					student: {
						connect: { id: student.id }
					},
					rating: {
						createMany: {
							data: dgmuSubject.rating,
							skipDuplicates: true
						}
					}
				},
				create: {
					name: dgmuSubject.name,
					semester: student.semester,
					student: {
						connect: { id: student.id }
					},
					rating: {
						createMany: {
							data: dgmuSubject.rating
						}
					}
				}
			})),

			await this.updateAverageMark(student.id)
		]))
	}

	async getAll(studentId: number) {
		return await this.prisma.subject.findMany({
			where: { studentId },
			select: {
				id: true,
				name: true,
				rating: {
					select: {
						id: true,
						date: true,
						mark: true,
						isNew: true
					}
				}
			}
		})
	}

	async view(id: number) {
		await this.prisma.rating.update({
			where: { id },
			data: { isNew: false }
		})
	}
}