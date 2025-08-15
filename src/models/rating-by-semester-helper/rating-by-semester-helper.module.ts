import { PrismaService } from 'src/models/prisma/prisma.service';
import { Module } from '@nestjs/common';
import { PushNotificationModule } from '../push-notification/push-notification.module';
import { RatingBySemesterHelperService } from './rating-by-semester-helper.service';

@Module({
	imports: [PushNotificationModule],
	providers: [RatingBySemesterHelperService, PrismaService],
	exports: [RatingBySemesterHelperService]
})
export class RatingBySemesterHelperModule {}
