import { IsInt, Max, Min } from 'class-validator';

export class UpdateSemesterDto {
	@IsInt()
	@Min(1)
	@Max(12)
	semester: number;
}
