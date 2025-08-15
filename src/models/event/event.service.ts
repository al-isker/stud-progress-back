import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EventService {
	constructor(private prisma: PrismaService) {}

	async getCountNews(studentId: number) {
		const student = await this.prisma.student.findFirst({
			where: { id: studentId }
		});

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
}
