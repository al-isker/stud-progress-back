import { Module } from '@nestjs/common';
import { ExpoModule } from '../expo/expo.module';
import { PushNotificationService } from './push-notification.service';

@Module({
	imports: [ExpoModule],
	providers: [PushNotificationService],
	exports: [PushNotificationService]
})
export class PushNotificationModule {}
