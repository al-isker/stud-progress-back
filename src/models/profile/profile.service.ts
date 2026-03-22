import { StudentService } from 'src/models/student/student.service';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSemesterDto } from './dto/update-semester.dto';

@Injectable()
export class ProfileService {
	constructor(
		private prisma: PrismaService,
		private studentService: StudentService
	) {}

	async getByStudentId(studentId: number) {
		const student = await this.prisma.student.findFirst({
			where: { id: studentId }
		});

		return {
			fullName: student.fullName,
			course: student.course,
			semester: student.semester
		};
	}

	async updateSemester(studentId: number, dto: UpdateSemesterDto) {
		const { student } = await this.studentService.updateWithProgress(studentId, dto);

		return {
			fullName: student.fullName,
			course: student.course,
			semester: student.semester
		};
	}
}
