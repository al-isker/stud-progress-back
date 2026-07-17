import { PrismaService } from 'src/models/prisma/prisma.service';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { TokenService } from '../token/token.service';
import { RefreshAccessTokenDto } from './dto/refresh-token.dto';

@Injectable()
export class AuthService {
	constructor(
		private prisma: PrismaService,
		private tokenService: TokenService
	) {}

	async refreshAccessToken(dto: RefreshAccessTokenDto) {
		const foundRefreshToken = await this.tokenService.findRefreshToken(dto.refreshToken);

		if (!foundRefreshToken) {
			throw new UnauthorizedException('Refresh token not found');
		}

		const isRefreshTokenExpired = this.tokenService.isRefreshTokenExpired(
			foundRefreshToken.expiredAt
		);

		if (isRefreshTokenExpired) {
			throw new UnauthorizedException('Refresh token expired');
		}

		const issuedTokens = this.tokenService.issueTokens(foundRefreshToken.studentId);

		await this.tokenService.updateOrCreateRefreshToken(
			foundRefreshToken.studentId,
			issuedTokens.refreshToken
		);

		return issuedTokens;
	}

	async logout(studentId: number) {
		await this.prisma.student.update({
			where: {
				id: studentId
			},
			data: {
				expoPushToken: null
			}
		});

		await this.tokenService.deleteRefreshToken(studentId);
	}
}
