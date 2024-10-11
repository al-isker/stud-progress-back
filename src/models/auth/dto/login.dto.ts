import { IsNumber, IsString } from 'class-validator'

export class LoginDto {
	@IsString()
	fullName: string

	@IsString()
	password: string

	@IsNumber()
	semester: number
}
