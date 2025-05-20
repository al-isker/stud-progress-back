import { IsNumber, IsString } from 'class-validator';
import { Trim } from 'src/common/lib/transformers/trim';

export class LoginDto {
	@IsString()
	@Trim()
	fullName: string;

	@IsString()
	@Trim()
	password: string;

	@IsNumber()
	semester: number;
}
