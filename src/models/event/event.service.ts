import { Injectable, NotFoundException } from '@nestjs/common';
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

	async viewById(studentId: number, eventId: number) {
		try {
			await this.prisma.event.update({
				where: {
					id: eventId,
					ratingBySemester: {
						subject: { studentId }
					},
					isNew: true
				},
				data: {
					isNew: false
				}
			});
		} catch (error) {
			if (error.code === 'P2025') {
				throw new NotFoundException();
			}

			throw error;
		}
	}
}
