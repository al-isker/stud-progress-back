import { GradeStatus, Student } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { Injectable } from '@nestjs/common';
import { DgmuService } from '../dgmu/dgmu.service';
import { DgmuSubjectListWithGrade } from '../dgmu/types/dgmu-subject-list-with-grade';
import { DgmuSubjectListWithGradeByAllSemesters } from '../dgmu/types/dgmu-subject-list-with-grade-by-all-semesters';
import { StudentService } from '../student/student.service';

@Injectable()
export class GradeService {
	constructor(
		private prisma: PrismaService,
		private studentService: StudentService,
		private dgmuService: DgmuService
	) {}

	async createAll(
		dgmuSubjectListByAllSemesters: DgmuSubjectListWithGradeByAllSemesters,
		student: Pick<Student, 'id'>
	) {
		await Promise.all(
			dgmuSubjectListByAllSemesters.map(async dgmuSubjectListBySemester => {
				await Promise.all(
					dgmuSubjectListBySemester.subjectList.map(async dgmuSubject => {
						await this.prisma.subject.create({
							data: {
								student: {
									connect: {
										id: student.id
									}
								},
								name: {
									connectOrCreate: {
										where: {
											name: dgmuSubject.name
										},
										create: {
											name: dgmuSubject.name
										}
									}
								},
								controlType: dgmuSubject.controlType,
								grade: {
									create: {
										semester: dgmuSubjectListBySemester.semester,
										date: dgmuSubject.date,
										mark: dgmuSubject.mark,
										status: dgmuSubject.status,
										isNew: dgmuSubject.status !== GradeStatus.EMPTY
									}
								}
							}
						});
					})
				);
			})
		);
	}

	async someUpdate(
		dgmuSubjectList: DgmuSubjectListWithGrade,
		student: Pick<Student, 'id' | 'semester'>
	) {
		await Promise.all(
			dgmuSubjectList.map(async dgmuSubject => {
				const existingSubject = await this.prisma.subject.findFirst({
					where: {
						studentId: student.id,
						name: {
							name: dgmuSubject.name
						}
					},
					include: {
						grade: true
					}
				});

				if (existingSubject.grade.status !== dgmuSubject.status) {
					return await this.prisma.subject.update({
						where: {
							id: existingSubject.id
						},
						data: {
							controlType: dgmuSubject.controlType,
							grade: {
								update: {
									date: dgmuSubject.date,
									mark: dgmuSubject.mark,
									status: dgmuSubject.status,
									isNew:
										existingSubject.grade.isNew ||
										existingSubject.grade?.status !== dgmuSubject.status ||
										existingSubject.grade?.mark !== dgmuSubject.mark
								}
							}
						}
					});
				}
			})
		);
	}

	async specificUpdate(studentId: number) {
		const student = await this.studentService.findById(studentId);

		const { subjectListWithGrade } = await this.dgmuService.findManyOrThrow(
			student,
			{
				grade: true
			}
		);

		await this.someUpdate(subjectListWithGrade, student);
	}
}
