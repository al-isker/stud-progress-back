import { ControlType, GradeStatus } from '@prisma/client';

export class SubjectsWithGradeDtoItem {
	name: string;
	controlType: ControlType;
	date: Date;
	status: GradeStatus;
	mark: number;
}

export type SubjectsWithGradeDto = SubjectsWithGradeDtoItem[];
