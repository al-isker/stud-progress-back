import { Module } from '@nestjs/common';
import { FcmModule } from '../fcm/fcm.module';
import { PushNotificationService } from './push-notification.service';

@Module({
	imports: [FcmModule],
	providers: [PushNotificationService],
	exports: [PushNotificationService]
})
export class PushNotificationModule {}
