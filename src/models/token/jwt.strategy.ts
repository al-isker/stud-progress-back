import { ExtractJwt, Strategy } from 'passport-jwt';
import { JWT_SECRET_KEY } from 'src/common/lib/env/env-keys';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
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
