import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './models/auth/auth.module';
import { DgmuModule } from './models/dgmu/dgmu.module';
import { GradeModule } from './models/grade/grade.module';
import { ProfileModule } from './models/profile/profile.module';
import { RatingBySemesterModule } from './models/rating-by-semester/rating-by-semester.module';
import { SchedulerModule } from './models/scheduler/scheduler.module';
import { StudentModule } from './models/student/student.module';
import { SubjectUpdaterModule } from './models/subject-helper/subject-helper.module';
import { SubjectModule } from './models/subject/subject.module';
import { PrismaService } from './prisma.service';

@Module({
  imports: [
    ConfigModule.forRoot(), 
    ScheduleModule.forRoot(),
    StudentModule, 
    AuthModule, 
    ProfileModule, 
    SubjectModule, 
    SubjectUpdaterModule, 
    GradeModule, 
    RatingBySemesterModule, 
    DgmuModule,
    SchedulerModule, 
  ],
  providers: [PrismaService],
})
export class AppModule {}
