import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JWT_SECRET_KEY } from '@/common/lib/env/env-keys';
import { JwtStrategy } from './jwt.strategy';
import { TokenService } from './token.service';

@Module({
	imports: [
		JwtModule.registerAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => ({
				secret: configService.get<string>(JWT_SECRET_KEY)
			})
		})
	],
	providers: [TokenService, JwtStrategy, ConfigService],
	exports: [TokenService]
})
export class TokenModule {}
