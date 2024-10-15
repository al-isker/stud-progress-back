import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './models/auth/auth.module';
import { DgmuModule } from './models/dgmu/dgmu.module';
import { ProfileModule } from './models/profile/profile.module';
import { RatingModule } from './models/rating/rating.module';
import { SchedulerModule } from './models/scheduler/scheduler.module';
import { StudentModule } from './models/student/student.module';
import { PrismaService } from './prisma.service';

@Module({
  imports: [
    ConfigModule.forRoot(), 
    ScheduleModule.forRoot(),
    StudentModule, 
    AuthModule, 
    RatingModule, 
    DgmuModule, 
    ProfileModule, 
    SchedulerModule
  ],
  controllers: [],
  providers: [PrismaService],
})
export class AppModule {}
