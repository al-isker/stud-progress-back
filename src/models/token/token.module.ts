import { JWT_SECRET_KEY } from 'src/common/lib/env/env-keys';
import { PrismaService } from 'src/models/prisma/prisma.service';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './jwt.strategy';
import { TokenService } from './token.service';

@Module({
	imports: [
		JwtModule.registerAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => ({
				secret: configService.get(JWT_SECRET_KEY)
			})
		})
	],
	providers: [TokenService, PrismaService, JwtStrategy, ConfigService],
	exports: [TokenService]
})
export class TokenModule {}
