import { ExternalPortalModule } from 'src/models/external-portal/external-portal.module';
import { StudentModule } from 'src/models/student/student.module';
import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TokenModule } from '../token/token.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
	imports: [StudentModule, TokenModule, ExternalPortalModule],
	controllers: [AuthController],
	providers: [AuthService, PrismaService]
})
export class AuthModule {}
