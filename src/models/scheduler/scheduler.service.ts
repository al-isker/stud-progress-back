import { Student } from '@prisma/client';
import { IS_ENABLED_SCHEDULER_UPDATE_SUBJECTS_KEY } from 'src/common/lib/env/env-keys';
import { delay } from 'src/common/lib/light-lodash/delay';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { ExternalPortalService } from '../external-portal/external-portal.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressSyncService } from '../progress-sync/progress-sync.service';
import { StudentService } from '../student/student.service';

@Injectable()
export class SchedulerService {
	private readonly logger = new Logger(SchedulerService.name);

	constructor(
		private prisma: PrismaService,
		private configService: ConfigService,
		private studentService: StudentService,
		private progressSyncService: ProgressSyncService,
		private externalPortalService: ExternalPortalService
	) {}

	@Cron('15 * * * *')
	async updateSubjects() {
		const isEnabled = this.configService.get(IS_ENABLED_SCHEDULER_UPDATE_SUBJECTS_KEY) === 'true';

		if (!isEnabled) return;

		const students = await this.prisma.student.findMany();

		const updateStudent = async (student: Student) => {
			const dataToGetProgress = this.studentService.mapWithDecryptedPassword(student);

			const externalPortalProgress = await this.externalPortalService.getProgress(
				dataToGetProgress,
				{
					subjectListWithGrade: true,
					subjectListWithEventList: true
				}
			);

			await this.prisma.student.update({
				where: {
					id: dataToGetProgress.id
				},
				data: {
					externalPortalCookie: externalPortalProgress.cookie
				}
			});

			const { notificationCallbacks } = await this.progressSyncService.update(
				student,
				student.semester,
				externalPortalProgress
			);

			for (const notificationCallback of notificationCallbacks) {
				notificationCallback();
			}
		};

		const DELAY_MS = 2000;

		const startAt = Date.now();

		const result = await Promise.allSettled(
			students.map(async (student, index) => {
				const targetStartAt = startAt + index * DELAY_MS;
				const targetDelayMs = targetStartAt - Date.now();

				await delay(targetDelayMs);

				return updateStudent(student);
			})
		);

		this.logger.log({ result });
	}
}
