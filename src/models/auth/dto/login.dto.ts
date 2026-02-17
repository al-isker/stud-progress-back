import { IsInt, IsString, Max, Min } from 'class-validator';
import { FullNameCase } from 'src/common/lib/transformers/full-name-case';
import { Trim } from 'src/common/lib/transformers/trim';

export class LoginDto {
	@IsString()
	@Trim()
	@FullNameCase()
	fullName: string;

	@IsString()
	@Trim()
	password: string;

	@IsInt()
	@Min(1)
	@Max(12)
	semester: number;
}
