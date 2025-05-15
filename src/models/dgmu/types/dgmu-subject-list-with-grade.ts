import { ControlType, GradeStatus } from '@prisma/client';

export interface DgmuSubjectWithGrade {
	name: string;
	controlType: ControlType;
	date: Date;
	status: GradeStatus;
	mark: number;
}

export type DgmuSubjectListWithGrade = DgmuSubjectWithGrade[];
