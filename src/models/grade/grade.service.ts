import { PrismaService } from 'src/models/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { StudentService } from '../student/student.service';

@Injectable()
export class GradeService {
	constructor(
		private prisma: PrismaService,
		private studentService: StudentService
	) {}

	async getCountNews(studentId: number) {
		const student = await this.studentService.findById(studentId);

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
