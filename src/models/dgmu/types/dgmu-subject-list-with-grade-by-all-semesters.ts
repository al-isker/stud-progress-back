import { DgmuSubjectListWithGrade } from './dgmu-subject-list-with-grade';

export interface DgmuSubjectListWithGradeBySemester {
	semester: number;
	subjectList: DgmuSubjectListWithGrade;
}

export type DgmuSubjectListWithGradeByAllSemesters =
	DgmuSubjectListWithGradeBySemester[];
