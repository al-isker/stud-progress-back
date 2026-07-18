import { ExtractJwt, Strategy } from 'passport-jwt';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { JWT_SECRET_KEY } from '@/common/lib/env/env-keys';
import { JwtStudentPayload } from './types/jwt-student-payload.type';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
	constructor(private configService: ConfigService) {
		super({
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			secretOrKey: configService.get<string>(JWT_SECRET_KEY),
			ignoreExpiration: false
		});
	}

	validate(payload: JwtStudentPayload) {
		return payload;
	}
}
