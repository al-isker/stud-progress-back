import { Injectable } from '@nestjs/common';
import { Student } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { DgmuService } from '../dgmu/dgmu.service';
import { StudentService } from '../student/student.service';
import { SubjectNameService } from '../subject-name/subject-name.service';
import { SubjectUtilsService } from '../subject-utils/subject-utils.service';
import { SomeUpdateDto } from './dto/some-update.dto';

@Injectable()
export class RatingService {
	constructor(
		private prisma: PrismaService,
		private studentService: StudentService,
		private subjectNameService: SubjectNameService,
		private subjectUtilsService: SubjectUtilsService,
		private dgmuService: DgmuService
	) {}

	async someUpdate(subjects: SomeUpdateDto, student: Pick<Student, 'id' | 'semester'>) {
		await Promise.all(subjects.map(async subject => {
			const targetSubject = await this.subjectUtilsService.findForRatingUpdate({
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
						semesters: {
							createMany: {
								skipDuplicates: true,
								data: { 
									number: student.semester
								}
							}
						},
						averageMark: this.subjectUtilsService.calculateAverageMark(subject.rating)
					}
				})

				await Promise.all(subject.rating.map(ratingItem => {
					const targetRating = targetSubject.rating.find(item => item.date === ratingItem.date)

					return this.prisma.rating.upsert({
						where: {
							date_subjectId: {
								date: ratingItem.date,
								subjectId: targetSubject.id
							}
						},
						update: {
							date: ratingItem.date,
							status: ratingItem.status,
							mark: ratingItem.mark,
							isNew: targetRating?.isNew || (
								targetRating?.status !== ratingItem.status ||
								targetRating?.mark !== ratingItem.mark
							)
						},
						create: {
							subject: {
								connect: { 
									id: targetSubject.id
								}
							},
							...ratingItem,
							isNew: true
						}
					})
				}))
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
						semesters: {
							create: {
								number: student.semester
							}
						},
						rating: {
							createMany: {
								data: subject.rating.map(ratingItem => ({
									...ratingItem,
									isNew: true
								}))
							}
						},
						averageMark: this.subjectUtilsService.calculateAverageMark(subject.rating)
					}
				})
			}
		}))

		await this.subjectUtilsService.updateStudentAverageMark(student)
	}

	async specificUpdate(studentId: number) {
		const student = await this.studentService.findById(studentId)

		const { subjectsWithRating } = await this.dgmuService.findManyOrThrow(student, {
			rating: true
		})

		await this.someUpdate(subjectsWithRating, student)
	} 
}
