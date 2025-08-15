import { PrismaService } from 'src/models/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class GradeService {
	constructor(private prisma: PrismaService) {}

	async getCountNews(studentId: number) {
		const student = await this.prisma.student.findFirst({
			where: { id: studentId }
		});

		const count = await this.prisma.grade.count({
			where: {
				subject: { studentId },
				semester: student.semester,
				isNew: true
			}
		});

		return { count };
	}
}
