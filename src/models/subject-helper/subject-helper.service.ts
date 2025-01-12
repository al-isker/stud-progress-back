import { Injectable } from '@nestjs/common';
import { Rating, Student, Subject, SubjectName } from '@prisma/client';
import { StudentService } from 'src/models/student/student.service';
import { PrismaService } from 'src/prisma.service';

@Injectable()
export class SubjectHelperService {
	constructor(
		private prisma: PrismaService,
		private studentService: StudentService
	) {}

	calculateAverageMark(rating: Pick<Rating, 'mark'>[]) {
		let marksCount = 0;

		const marksSum = rating.reduce((sum, { mark }) => {
			if (mark) {
				marksCount++

				return sum + mark
			}
			
			return sum;
		}, 0);

		const averageMark = marksCount > 0 ? (marksSum / marksCount) : null

		return averageMark
	}

	async updateStudentAverageMark(
		student: Pick<Student, 'id' | 'semester'>
	) {
		const studentRating = await this.prisma.rating.findMany({
			where: {
				subject: {
					studentId: student.id,
					semesters: {
						some: {
							number: student.semester
						}
					}
				}
			},
			select: {
				mark: true
			}
		})

		const averageMark = this.calculateAverageMark(studentRating)

		await this.studentService.update(student.id, { averageMark })
	}

	async findForGradeUpdate({studentId, name, semester}: Pick<SubjectName, 'name'> & Pick<Subject, 'studentId'> & {semester: Student['semester']}) {
		return await this.prisma.subject.findFirst({
			where: {
				studentId,
				name: { name },
				semesters: {
					some: {
						number: semester
					}
				}
			},
			include: {
				semesters: true,
				grade: true,
				rating: true
			}
		})
	}

	async findForRatingUpdate({studentId, name, semester}: Pick<SubjectName, 'name'> & Pick<Subject, 'studentId'> & {semester: Student['semester']} ) {
		const targetSubject = await this.prisma.subject.findFirst({
			where: {
				studentId,
				name: { name },
				semesters: {
					some: {
						number: semester
					}
				}
			},
			include: {
				semesters: true,
				grade: true,
				rating: true
			}
		})

		if (targetSubject) {
			return targetSubject;
		}
		
		const eponymousSubjects = await this.prisma.subject.findMany({
			where: {
				studentId,
				name: { name }
			},
			include: {
				semesters: true,
				grade: true,
				rating: true
			}
		})

		if (eponymousSubjects.length) {
			const eponymousSubjectsSorted = eponymousSubjects
				.filter(item => item.semesters.some(s => s.number >= semester))
				.sort((itemOne, itemTwo) => itemOne.semesters[0].number - itemTwo.semesters[0].number)

			return eponymousSubjectsSorted[0];
		}
	}
}
