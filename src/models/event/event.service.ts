import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StudentService } from '../student/student.service';

@Injectable()
export class EventService {
	constructor(
		private prisma: PrismaService,
		private studentService: StudentService
	) {}

	async getCountNews(studentId: number) {
		const student = await this.studentService.findById(studentId);

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
