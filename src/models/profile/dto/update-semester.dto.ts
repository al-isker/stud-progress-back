import { IsNumber, Max, Min } from 'class-validator';

export class UpdateSemesterDto {
	@IsNumber()
	@Min(1)
	@Max(12)
	semester: number;
}
