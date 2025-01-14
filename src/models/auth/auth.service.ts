import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request, Response } from 'express';
import { REFRESH_TOKEN_KEY } from 'src/common/config/cookie.config';
import { DgmuService } from 'src/models/dgmu/dgmu.service';
import { StudentService } from 'src/models/student/student.service';
import { SubjectHelperService } from '../subject-helper/subject-helper.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
	constructor(
		private jwt: JwtService,
		private studentService: StudentService,
		private subjectHelperService: SubjectHelperService,
		private dgmuService: DgmuService
	) {}

	private cookieOptions = { 
		maxAge: 30 * 24 * 60 * 60 * 1000,
		httpOnly: true, 
		secure: false 
	}

	private async issueTokens(studentId: number) {
		const data = {id: studentId};

		// access почему-то не кончается
		const accessToken = this.jwt.sign(data, { expiresIn: '1h' })
		const refreshToken = this.jwt.sign(data, { expiresIn: '30d' })

		return { accessToken, refreshToken };
	}

	async login(res: Response, dto: LoginDto) {
		dto.fullName = dto.fullName.trim()
		dto.password = dto.password.trim()

		await this.dgmuService.findManyOrThrow(dto)

		const student = await this.studentService.upsertByFullName(dto.fullName, {
			update: {
				password: dto.password,
				semester: dto.semester
			},
			create: dto
		})

		await this.subjectHelperService.someUpdateAll(student)

		const { accessToken, refreshToken } = await this.issueTokens(student.id)

		res.cookie(REFRESH_TOKEN_KEY, refreshToken, this.cookieOptions)

		return { accessToken }
	}

	async refreshToken(req: Request, res: Response) {
		let verifyResult: any;

		try {
			verifyResult = await this.jwt.verifyAsync(req.cookies.refreshToken)
		} catch {
			throw new UnauthorizedException('Invalid refresh token')
		}

		const student = await this.studentService.findById(verifyResult.id)

		if (student) {
			const {accessToken, refreshToken} = await this.issueTokens(student.id)

			res.cookie(REFRESH_TOKEN_KEY, refreshToken, this.cookieOptions)

			return { accessToken }
		}

		throw new UnauthorizedException('Student not found')
	}

	logout(res: Response) {
		res.clearCookie(REFRESH_TOKEN_KEY)
	}
}
