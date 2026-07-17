import { Module } from '@nestjs/common';
import { TokenModule } from '../token/token.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
	imports: [TokenModule],
	controllers: [AuthController],
	providers: [AuthService]
})
export class AuthModule {}
