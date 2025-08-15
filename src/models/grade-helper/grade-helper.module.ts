import { PrismaService } from 'src/models/prisma/prisma.service';
import { Module } from '@nestjs/common';
import { PushNotificationModule } from '../push-notification/push-notification.module';
import { GradeHelperService } from './grade-helper.service';

@Module({
	imports: [PushNotificationModule],
	providers: [GradeHelperService, PrismaService],
	exports: [GradeHelperService]
})
export class GradeHelperModule {}
