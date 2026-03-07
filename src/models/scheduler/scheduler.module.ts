import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ExternalPortalModule } from '../external-portal/external-portal.module';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressSyncModule } from '../progress-sync/progress-sync.module';
import { StudentModule } from '../student/student.module';
import { SchedulerService } from './scheduler.service';

@Module({
	imports: [
		ConfigModule,
		StudentModule,
		ProgressSyncModule,
		ExternalPortalModule
	],
	providers: [SchedulerService, PrismaService]
})
export class SchedulerModule {}
