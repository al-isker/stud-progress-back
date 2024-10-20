import { Injectable } from '@nestjs/common';
import { Student } from '@prisma/client';
import { DgmuService } from 'src/models/dgmu/dgmu.service';
import { PrismaService } from 'src/prisma.service';

@Injectable()
export class RatingService {
	constructor(
		private dgmuService: DgmuService,
		private prisma: PrismaService
	) {}

	async updateRating(student: Student) {
		const dgmuSubjects = await this.dgmuService.findRating(student)

		await this.prisma.$transaction([
			this.prisma.student.update({
				where: { id: student.id },
				data: { ratingUpdatedAt: new Date() }
			}),

			...dgmuSubjects.map(dgmuSubject => this.prisma.subject.upsert({
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
			}))
		])
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