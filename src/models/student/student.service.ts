import { PrismaService } from 'src/models/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { ExternalPortalService } from '../external-portal/external-portal.service';
import { ProgressSyncService } from '../progress-sync/progress-sync.service';
import { PasswordService } from './password.service';
import { CreateStudentData } from './types/create-student-data.type';
import { UpdateStudentData } from './types/update-student-data.type';

@Injectable()
export class StudentService {
	constructor(
		private prisma: PrismaService,
		private passwordService: PasswordService,
		private progressSyncService: ProgressSyncService,
		private externalPortalService: ExternalPortalService
	) {}

	private mapWithCalculateCourse<D extends object>(data: D & { semester: number }) {
		return Object.assign(data, {
			course: Math.ceil(data.semester / 2)
		});
	}

	mapWithEncryptedPassword<D extends object>(data: D & { password: string }) {
		const { password, ...restData } = data;

		return Object.assign(restData, {
			encryptedPassword: this.passwordService.encrypt(password)
		});
	}

	mapWithDecryptedPassword<D extends object>(data: D & { encryptedPassword: string }) {
		const { encryptedPassword, ...restData } = data;

		return Object.assign(restData, {
			password: this.passwordService.decrypt(encryptedPassword)
		});
	}

	async create(data: CreateStudentData) {
		const externalPortalProgress = await this.externalPortalService.getProgress(data, {
			subjectListWithGradeByAllSemesters: true,
			subjectListWithEventList: true
		});

		const dataForCreate = this.mapWithEncryptedPassword(this.mapWithCalculateCourse(data));

		const student = await this.prisma.$transaction(
			async tx => {
				const student = await tx.student.create({
					data: dataForCreate
				});

				await this.progressSyncService.init(student, student.semester, externalPortalProgress, tx);

				return student;
			},
			{ timeout: 30000 }
		);

		return this.mapWithDecryptedPassword(student);
	}

	async update(id: number, data: UpdateStudentData) {
		const existingStudent = this.mapWithDecryptedPassword(
			await this.prisma.student.findFirst({
				where: { id }
			})
		);

		const requiredData = {
			fullName: existingStudent.fullName,
			password: data.password ?? existingStudent.password,
			semester: data.semester ?? existingStudent.semester
		};

		const externalPortalProgress = await this.externalPortalService.getProgress(requiredData, {
			subjectListWithGrade: true,
			subjectListWithEventList: true
		});

		const dataForUpdate = this.mapWithEncryptedPassword(this.mapWithCalculateCourse(requiredData));

		const result = await this.prisma.$transaction(
			async tx => {
				const student = await tx.student.update({
					where: { id },
					data: dataForUpdate
				});

				const progressResult = await this.progressSyncService.update(
					student,
					student.semester,
					externalPortalProgress,
					tx
				);

				return { student, ...progressResult };
			},
			{ timeout: 30000 }
		);

		for (const notificationCallback of result.notificationCallbacks) {
			notificationCallback();
		}

		return this.mapWithDecryptedPassword(result.student);
	}
}
