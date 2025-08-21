import { DgmuService } from 'src/models/dgmu/dgmu.service';
import { StudentService } from 'src/models/student/student.service';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StudentWithDecryptedPassword } from '../student/types/student-with-decrypted-password.type';
import { TokenService } from '../token/token.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Injectable()
export class AuthService {
	constructor(
		private prisma: PrismaService,
		private studentService: StudentService,
		private tokenService: TokenService,
		private dgmuService: DgmuService
	) {}

	private async signUp(dto: LoginDto) {
		const student = await this.studentService.create(dto);

		const issuedTokens = this.tokenService.issueTokens(student.id);

		await this.tokenService.saveRefreshToken(
			student.id,
			issuedTokens.refreshToken
		);

		return issuedTokens;
	}

	private async signIn(student: StudentWithDecryptedPassword, dto: LoginDto) {
		if (
			dto.password !== student.password ||
			dto.semester !== student.semester
		) {
			student = await this.studentService.update(student.id, {
				password: dto.password,
				semester: dto.semester
			});
		}

		const issuedTokens = this.tokenService.issueTokens(student.id);

		await this.tokenService.updateRefreshToken(
			student.id,
			issuedTokens.refreshToken
		);

		return issuedTokens;
	}

	async login(dto: LoginDto) {
		await this.dgmuService.findMany(dto);

		const student = await this.prisma.student.findFirst({
			where: { fullName: dto.fullName }
		});

		if (student) {
			return await this.signIn(
				this.studentService.mapWithDecryptedPassword(student),
				dto
			);
		} else {
			return await this.signUp(dto);
		}
	}

	async refreshToken(dto: RefreshTokenDto) {
		const foundRefreshToken = await this.tokenService.findRefreshToken(
			dto.refreshToken
		);

		if (!foundRefreshToken) {
			throw new UnauthorizedException('Refresh token not found');
		}

		const isRefreshTokenExpired = this.tokenService.isRefreshTokenExpired(
			foundRefreshToken.expiredAt
		);

		if (isRefreshTokenExpired) {
			throw new UnauthorizedException('Refresh token expired');
		}

		const issuedTokens = this.tokenService.issueTokens(
			foundRefreshToken.studentId
		);

		await this.tokenService.updateRefreshToken(
			foundRefreshToken.studentId,
			issuedTokens.refreshToken
		);

		return issuedTokens;
	}
}
