import { SubjectsWithGradeDto } from './subjects-with-grade.dto';

export class AllSubjectsWithGradeDtoItem {
	semester: number;
	subjects: SubjectsWithGradeDto;
}

export type AllSubjectsWithGradeDto = AllSubjectsWithGradeDtoItem[];
