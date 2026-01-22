import { GradeStatus, Student } from '@prisma/client';
import { PrismaService } from 'src/models/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { DgmuSubjectListWithGradeByAllSemesters } from '../dgmu/types/dgmu-subject-list-with-grade-by-all-semesters.type';
import { DgmuSubjectListWithGrade } from '../dgmu/types/dgmu-subject-list-with-grade.type';
import { PushNotificationService } from '../push-notification/push-notification.service';

@Injectable()
export class GradeHelperService {
	constructor(
		private prisma: PrismaService,
		private pushNotificationService: PushNotificationService
	) {}

	async createAll(
		student: Pick<Student, 'id'>,
		dgmuSubjectListByAllSemesters: DgmuSubjectListWithGradeByAllSemesters
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

	async updateBySemester(
		student: Pick<Student, 'id' | 'expoPushToken'>,
		dgmuSubjectList: DgmuSubjectListWithGrade
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

				if (
					existingSubject.grade.status !== dgmuSubject.status ||
					existingSubject.grade?.mark !== dgmuSubject.mark
				) {
					this.pushNotificationService.gradeUpdated(
						student.expoPushToken,
						existingSubject.id,
						dgmuSubject
					);

					await this.prisma.subject.update({
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
									isNew: true
								}
							}
						}
					});
				}
			})
		);
	}
}
