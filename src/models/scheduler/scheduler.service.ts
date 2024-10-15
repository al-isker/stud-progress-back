import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma.service';
import { RatingService } from '../rating/rating.service';

@Injectable()
export class SchedulerService {
	constructor(
		private ratingService: RatingService,	
		private prisma: PrismaService
	) {}

	@Cron(CronExpression.EVERY_HOUR)
	async updateData() {
		const students = await this.prisma.student.findMany();

		for (const student of students) {
			console.log(`"${student.fullName}" rating has been upadted`)

			this.ratingService.updateRating(student)
		}
	}
}
