import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { getJwtConfig } from 'src/common/config/jwt.config';
import { DgmuModule } from 'src/models/dgmu/dgmu.module';
import { StudentModule } from 'src/models/student/student.module';
import { PrismaService } from 'src/prisma.service';
import { SubjectUpdaterModule } from '../subject-helper/subject-helper.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, PrismaService],
  imports: [
    DgmuModule,
    StudentModule,
    SubjectUpdaterModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule], 
      inject: [ConfigService],
      useFactory: getJwtConfig
    })
  ]
})
export class AuthModule {}
