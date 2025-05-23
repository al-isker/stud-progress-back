import { DgmuModule } from 'src/models/dgmu/dgmu.module';
import { StudentModule } from 'src/models/student/student.module';
import { Module } from '@nestjs/common';
import { TokenModule } from '../token/token.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
	imports: [StudentModule, TokenModule, DgmuModule],
	controllers: [AuthController],
	providers: [AuthService]
})
export class AuthModule {}
