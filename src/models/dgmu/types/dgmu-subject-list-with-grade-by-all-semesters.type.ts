import { DgmuSubjectListWithGrade } from './dgmu-subject-list-with-grade.type';

export interface DgmuSubjectListWithGradeBySemester {
	semester: number;
	subjectList: DgmuSubjectListWithGrade;
}

export type DgmuSubjectListWithGradeByAllSemesters =
	DgmuSubjectListWithGradeBySemester[];
