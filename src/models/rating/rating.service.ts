import { Injectable } from '@nestjs/common';
import { Student } from '@prisma/client';
import { DgmuService } from 'src/models/dgmu/dgmu.service';
import { PrismaService } from 'src/prisma.service';
import { StudentService } from '../student/student.service';

@Injectable()
export class RatingService {
	constructor(
		private studentService: StudentService,
		private dgmuService: DgmuService,
		private prisma: PrismaService
	) {}

	private interval = 60 * 60 * 1000; // 1 hour

	private isIntervalPassed(ratingUpdatedAt: Date | null) {
		if (!ratingUpdatedAt) return true

		const timePassed = new Date().getTime() - ratingUpdatedAt.getTime()

		return timePassed > this.interval
	}

	private getRatingFromDB(studentId: number) {
		return this.prisma.subject.findMany({
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

	private async updateRating(student: Student) {
		const subjectWithRating = await this.dgmuService.findRating(student)

		await this.prisma.$transaction(
			subjectWithRating.map(subject => this.prisma.subject.upsert({
				where: {
					name_studentId: {
						name: subject.name,
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
							data: subject.rating.map(item => ({
								date: item.date,
								mark: item.mark,
							})),
							skipDuplicates: true
						}
					}
				},
				create: {
					name: subject.name,
					semester: student.semester,
					student: {
						connect: { id: student.id }
					},
					rating: {
						createMany: {
							data: subject.rating.map(item => ({
								date: item.date,
								mark: item.mark
							}))
						}
					}
				}
			}))
		)
	}

	async getAll(studentId: number) {
		const student = await this.studentService.findById(studentId)

		const isIntervalPassed = this.isIntervalPassed(student.ratingUpdatedAt)

		if (isIntervalPassed) {
			await this.updateRating(student)

			await this.prisma.student.update({
				where: { id: studentId },
				data: { ratingUpdatedAt: new Date() }
			})
		}

		return await this.getRatingFromDB(student.id)
	}
}
