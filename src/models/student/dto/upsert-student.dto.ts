import { CreateStudentDto } from './create-student.dto';
import { UpdateStudentDto } from './update-student.dto';

export class UpsertStudentDto {
	update: UpdateStudentDto;
	create: CreateStudentDto;
}
