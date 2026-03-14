import { Student } from '@prisma/client';
import { ExternalPortalService } from 'src/models/external-portal/external-portal.service';
import { StudentService } from 'src/models/student/student.service';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from '../token/token.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Injectable()
export class AuthService {
	constructor(
		private prisma: PrismaService,
		private studentService: StudentService,
		private tokenService: TokenService,
		private externalPortalService: ExternalPortalService
	) {}

	private async signUp(dto: LoginDto) {
		return await this.prisma.$transaction(async tx => {
			const { student } = await this.studentService.create(dto, tx);

			const issuedTokens = this.tokenService.issueTokens(student.id);

			await this.tokenService.saveRefreshToken(student.id, issuedTokens.refreshToken, tx);

			return issuedTokens;
		});
	}

	private async signIn(student: Student, dto: LoginDto) {
		return await this.prisma.$transaction(async tx => {
			await this.studentService.update(student.id, dto, tx);

			const issuedTokens = this.tokenService.issueTokens(student.id);

			await this.tokenService.updateOrCreateRefreshToken(student.id, issuedTokens.refreshToken, tx);

			return issuedTokens;
		});
	}

	async login(dto: LoginDto) {
		await this.externalPortalService.validate(dto);

		const student = await this.prisma.student.findFirst({
			where: { fullName: dto.fullName }
		});

		if (student) {
			return await this.signIn(student, dto);
		} else {
			return await this.signUp(dto);
		}
	}

	async refreshToken(dto: RefreshTokenDto) {
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
