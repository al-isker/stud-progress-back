import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/models/prisma/prisma.service';
import * as uuid from 'uuid';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtStudentPayload } from './types/jwt-student-payload.type';

@Injectable()
export class TokenService {
	constructor(
		private prisma: PrismaService,
		private jwtService: JwtService
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
		const accessTokenPayload: JwtStudentPayload = { id: studentId };

		const accessToken = this.jwtService.sign(accessTokenPayload, {
			expiresIn: '1h'
		});

		const refreshToken = uuid.v7();

		return { accessToken, refreshToken };
	}

	async findRefreshToken(refreshToken: string) {
		return await this.prisma.refreshToken.findFirst({
			where: { refreshToken }
		});
	}

	async saveRefreshToken(studentId: number, refreshToken: string, tx?: Prisma.TransactionClient) {
		const expiredAt = this.generateRefreshTokenExpiredAt();

		return await (tx ?? this.prisma).refreshToken.create({
			data: { studentId, expiredAt, refreshToken }
		});
	}

	async updateOrCreateRefreshToken(
		studentId: number,
		refreshToken: string,
		tx?: Prisma.TransactionClient
	) {
		const expiredAt = this.generateRefreshTokenExpiredAt();

		return await (tx ?? this.prisma).refreshToken.upsert({
			where: { studentId },
			update: {
				expiredAt,
				refreshToken
			},
			create: {
				expiredAt,
				refreshToken,
				studentId
			}
		});
	}

	async deleteRefreshToken(studentId: number) {
		return await this.prisma.refreshToken.delete({
			where: { studentId }
		});
	}
}
