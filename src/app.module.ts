import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './models/auth/auth.module';
import { DgmuModule } from './models/dgmu/dgmu.module';
import { ProfileModule } from './models/profile/profile.module';
import { StudentModule } from './models/student/student.module';
import { SubjectModule } from './models/subject/subject.module';
import { PrismaService } from './prisma.service';

@Module({
  imports: [ConfigModule.forRoot(), StudentModule, AuthModule, SubjectModule, DgmuModule, ProfileModule],
  controllers: [],
  providers: [PrismaService],
})
export class AppModule {}
