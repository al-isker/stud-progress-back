import { Injectable } from '@nestjs/common';
import { GradeStatus, Student } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { DgmuService } from '../dgmu/dgmu.service';
import { StudentService } from '../student/student.service';
import { SubjectNameService } from '../subject-name/subject-name.service';
import { SubjectUtilsService } from '../subject-utils/subject-utils.service';
import { SomeUpdateAllDto } from './dto/some-update-all.dto';
import { SomeUpdateDto } from './dto/some-update.dto';

@Injectable()
export class GradeService {
	constructor(
		private prisma: PrismaService,
		private studentService: StudentService,
		private subjectNameService: SubjectNameService,
		private subjectUtilsService: SubjectUtilsService,
		private dgmuService: DgmuService
	) {}

	async someUpdate(subjects: SomeUpdateDto, student: Pick<Student, 'id' | 'semester'>) {
		await Promise.all(subjects.map(async subject => {
			const targetSubject = await this.subjectUtilsService.findForGradeUpdate({
				studentId: student.id,
				semester: student.semester,
				name: subject.name
			})
	
			if (targetSubject) {
				await this.prisma.subject.update({
					where: {
						id: targetSubject.id
					},
					data: {
						controlType: subject.controlType,
						semesters: {
							createMany: {
								skipDuplicates: true,
								data: { 
									number: student.semester
								}
							}
						},
						grade: {
							upsert: {
								create: {
									date: subject.date,
									status: subject.status,
									mark: subject.mark,
									isNew: subject.status !== GradeStatus.EMPTY
								},
								update: {
									date: subject.date,
									mark: subject.mark,
									status: subject.status,
									isNew: targetSubject.grade.isNew || (
										targetSubject.grade?.status !== subject.status || 
										targetSubject.grade?.mark !== subject.mark
									)
								}
							}
						}
					}
				})
			} else {
				const subjectName = await this.subjectNameService.upsertByName(subject.name);

				await this.prisma.subject.create({
					data: {
						student: {
							connect: {
								id: student.id
							}
						},
						name: {
							connect: {
								id: subjectName.id
							}
						},
						controlType: subject.controlType,
						semesters: {
							create: {
								number: student.semester
							}
						},
						grade: {
							create: {
								date: subject.date,
								mark: subject.mark,
								status: subject.status,
								isNew: subject.status !== GradeStatus.EMPTY
							}
						}
					}
				}) 
			}
		}))
	}

	async someUpdateAll(subjectsOfSemesters: SomeUpdateAllDto, student: Pick<Student, 'id'>) {
		for (const subjectsOfSemester of subjectsOfSemesters) {
			const { semester, subjects } = subjectsOfSemester

			await this.someUpdate(subjects, {
				id: student.id,
				semester
			})
		}
	}

	async specificUpdate(studentId: number) {
		const student = await this.studentService.findById(studentId)

		const { subjectsWithGrade } = await this.dgmuService.findManyOrThrow(student, {
			grade: true 
		})

		await this.someUpdate(subjectsWithGrade, student)
	}
}
 