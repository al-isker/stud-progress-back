import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request, Response } from 'express';
import { DgmuService } from 'src/models/dgmu/dgmu.service';
import { StudentService } from 'src/models/student/student.service';
import { RatingService } from '../rating/rating.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
	constructor(
		private dgmuService: DgmuService,
		private studentService: StudentService,
		private ratingService: RatingService,
		private jwt: JwtService
	) {}

	private cookieOptions = { 
		maxAge: 30 * 24 * 60 * 60 * 1000,
		httpOnly: true, 
		secure: false 
	}

	private async issueTokens(studentId: number) {
		const data = {id: studentId};

		const accessToken = this.jwt.sign(data, { expiresIn: '1h' })
		const refreshToken = this.jwt.sign(data, { expiresIn: '30d' })

		return { accessToken, refreshToken };
	}

	async login(res: Response, dto: LoginDto) {
		dto.fullName = dto.fullName.trim()
		dto.password = dto.password.trim()

		await this.dgmuService.verificationUser(dto)

		let student = await this.studentService.findByFullName(dto.fullName)

		// возможно логичней переписать на upsert
		if (student) {
			student = await this.studentService.update(student.id, {
				password: dto.password,
				semester: dto.semester
			})
		}
		else {
			student = await this.studentService.create(dto)
		}

		await this.ratingService.updateRating(student)

		const { accessToken, refreshToken } = await this.issueTokens(student.id)

		res.cookie('refreshToken', refreshToken, this.cookieOptions)

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

		const {accessToken, refreshToken} = await this.issueTokens(student.id)

		res.cookie('refreshToken', refreshToken, this.cookieOptions)

		return { accessToken }
	}

	logout(res: Response) {
		res.clearCookie('refreshToken')
	}
}
