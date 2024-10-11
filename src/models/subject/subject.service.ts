import { Injectable } from '@nestjs/common';
import { DgmuService } from 'src/models/dgmu/dgmu.service';
import { PrismaService } from 'src/prisma.service';

@Injectable()
export class SubjectService {
	constructor(
		private dgmuService: DgmuService,
		private prisma: PrismaService
	) {}

	private interval = 10 * 60 * 1000; // 10 minutes

	async test(studentId: number) {
		// await this.prisma.student.update({
		// 	where: {id: studentId},
		// 	data: {subjectsUpdatedAt: new Date()}
		// })

		const student = await this.prisma.student.findFirst({
			where: {
				id: studentId
			}
		})

		// subjectsUpdatedAt может и не быть (ДЕЛАТЬ ПРОВЕРКУ!!!)
		const { subjectsUpdatedAt } = student
		const now = new Date()

		const timePassed = now.getTime() - subjectsUpdatedAt.getTime()

		return timePassed > this.interval

		// await this.prisma.subject.create({
		// 	data: {
		// 		name: 'Информатика',
		// 		semester: 2,
		// 		student: {
		// 			connect: { id: student.id }
		// 		}
		// 	}
		// })

		// return await this.prisma.subject.findMany()
	}
}
