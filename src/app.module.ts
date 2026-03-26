import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from './common/logger/logger.module';
import { AuthModule } from './models/auth/auth.module';
import { DeviceInfoModule } from './models/device-info/device-info.module';
import { EventModule } from './models/event/event.module';
import { ExpoModule } from './models/expo/expo.module';
import { ExternalPortalModule } from './models/external-portal/external-portal.module';
import { GradeModule } from './models/grade/grade.module';
import { MobileAppInfoModule } from './models/mobile-app-info/mobile-app-info.module';
import { PrismaModule } from './models/prisma/prisma.module';
import { ProfileModule } from './models/profile/profile.module';
import { PushNotificationModule } from './models/push-notification/push-notification.module';
import { SchedulerModule } from './models/scheduler/scheduler.module';
import { StudentModule } from './models/student/student.module';
import { SubjectModule } from './models/subject/subject.module';
import { TokenModule } from './models/token/token.module';

@Module({
	imports: [
		ConfigModule.forRoot({ isGlobal: true }),
		LoggerModule,
		ScheduleModule.forRoot(),
		PrismaModule,
		StudentModule,
		TokenModule,
		AuthModule,
		DeviceInfoModule,
		MobileAppInfoModule,
		ProfileModule,
		SubjectModule,
		GradeModule,
		EventModule,
		ExternalPortalModule,
		ExpoModule,
		PushNotificationModule,
		SchedulerModule
	]
})
export class AppModule {}
