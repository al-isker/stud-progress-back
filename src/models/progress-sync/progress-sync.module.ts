import { Module } from '@nestjs/common';
import { PushNotificationModule } from '../push-notification/push-notification.module';
import { ProgressSyncHelperService } from './progress-sync-helper.service';
import { ProgressSyncRepository } from './progress-sync.repository';
import { ProgressSyncService } from './progress-sync.service';

@Module({
	imports: [PushNotificationModule],
	providers: [
		ProgressSyncService,
		ProgressSyncRepository,
		ProgressSyncHelperService
	],
	exports: [ProgressSyncService]
})
export class ProgressSyncModule {}



