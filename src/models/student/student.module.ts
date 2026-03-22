import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ExternalPortalModule } from '../external-portal/external-portal.module';
import { ProgressSyncModule } from '../progress-sync/progress-sync.module';
import { PasswordService } from './password.service';
import { StudentService } from './student.service';

@Module({
	imports: [ConfigModule, ProgressSyncModule, ExternalPortalModule],
	providers: [StudentService, PasswordService],
	exports: [StudentService]
})
export class StudentModule {}
