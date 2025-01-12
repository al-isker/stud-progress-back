import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './models/auth/auth.module';
import { DgmuModule } from './models/dgmu/dgmu.module';
import { GradeModule } from './models/grade/grade.module';
import { ProfileModule } from './models/profile/profile.module';
import { RatingModule } from './models/rating/rating.module';
import { SchedulerModule } from './models/scheduler/scheduler.module';
import { StudentModule } from './models/student/student.module';
import { SubjectHelperModule } from './models/subject-helper/subject-helper.module';
import { SubjectNameModule } from './models/subject-name/subject-name.module';
import { SubjectUpdaterModule } from './models/subject-updater/subject-updater.module';
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
    SubjectNameModule,
    SubjectUpdaterModule, 
    SubjectHelperModule, 
    GradeModule, 
    RatingModule, 
    DgmuModule,
    SchedulerModule, 
  ],
  providers: [PrismaService],
})
export class AppModule {}
