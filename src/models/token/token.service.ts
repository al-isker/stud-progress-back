import { PrismaService } from 'src/models/prisma/prisma.service';
import * as uuid from 'uuid';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class TokenService {
	constructor(
		private prisma: PrismaService,
		private jwt: JwtService
	) {}

	private generateRefreshTokenExpiredAt() {
		const today = new Date();

		return new Date(today.setDate(today.getDate() + 60));
	}

	isRefreshTokenExpired(refreshTokenExpiredAt: Date) {
		const today = new Date();

		const todayTimestamp = today.getTime();
		const refreshTokenExpiredAtTimestamp = refreshTokenExpiredAt.getTime();

		return refreshTokenExpiredAtTimestamp <= todayTimestamp;
	}

	issueTokens(studentId: number) {
		const accessTokenPayload = { id: studentId };

		const accessToken = this.jwt.sign(accessTokenPayload, { expiresIn: '1h' });
		const refreshToken = uuid.v7();

		return { accessToken, refreshToken };
	}

	async findRefreshToken(refreshToken: string) {
		return await this.prisma.refreshToken.findFirst({
			where: { refreshToken }
		});
	}

	async saveRefreshToken(studentId: number, refreshToken: string) {
		const expiredAt = this.generateRefreshTokenExpiredAt();

		return await this.prisma.refreshToken.create({
			data: { studentId, expiredAt, refreshToken }
		});
	}

	async updateRefreshToken(studentId: number, refreshToken: string) {
		const expiredAt = this.generateRefreshTokenExpiredAt();

		return await this.prisma.refreshToken.update({
			where: { studentId },
			data: { expiredAt, refreshToken }
		});
	}
}
