import { Prisma } from '@prisma/client';
import { isExist } from 'src/common/lib/light-lodash/is-exist';
import { PrismaService } from 'src/models/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { ExternalPortalService } from '../external-portal/external-portal.service';
import { PrismaTransactionService } from '../prisma/prisma-transaction.service';
import { ProgressSyncService } from '../progress-sync/progress-sync.service';
import { PasswordService } from './password.service';
import { StudentCreateWithProgressData } from './types/student-create-with-progress-data.type';
import { StudentUpdateWithProgressData } from './types/student-update-with-progress-data.type';

@Injectable()
export class StudentService {
	constructor(
		private prisma: PrismaService,
		private prismaTransaction: PrismaTransactionService,
		private passwordService: PasswordService,
		private progressSyncService: ProgressSyncService,
		private externalPortalService: ExternalPortalService
	) {}

	private mapWithCalculateCourse<D extends object & { semester?: undefined }>(data: D): D;

	private mapWithCalculateCourse<D extends object & { semester: number }>(
		data: D
	): D & { course: number };

	private mapWithCalculateCourse<D extends object>(data: D & { semester?: number }) {
		if (data.semester === undefined) {
			return data;
		}

		return Object.assign(data, {
			course: Math.ceil(data.semester / 2)
		});
	}

	mapWithEncryptedPassword<D extends object>(data: D & { password?: undefined }): D;

	mapWithEncryptedPassword<D extends object>(
		data: D & { password: string }
	): D & { encryptedPassword: string };

	mapWithEncryptedPassword<D extends object>(data: D & { password?: string }) {
		if (data.password === undefined) {
			return data;
		}

		const { password, ...restData } = data;

		return Object.assign(restData, {
			encryptedPassword: this.passwordService.encrypt(password)
		});
	}

	mapWithDecryptedPassword<D extends object>(data: D & { encryptedPassword?: undefined }): D;

	mapWithDecryptedPassword<D extends object>(
		data: D & { encryptedPassword: string }
	): D & { password: string };

	mapWithDecryptedPassword<D extends object>(data: D & { encryptedPassword: string }) {
		if (data.encryptedPassword === undefined) {
			return data;
		}

		const { encryptedPassword, ...restData } = data;

		return Object.assign(restData, {
			password: this.passwordService.decrypt(encryptedPassword)
		});
	}

	async createWithProgress(data: StudentCreateWithProgressData, tx?: Prisma.TransactionClient) {
		const externalPortalProgress = await this.externalPortalService.getProgress(data, {
			subjectListWithGradeByAllSemesters: true,
			subjectListWithEventList: true
		});

		const dataToCreate = this.mapWithEncryptedPassword(
			this.mapWithCalculateCourse({
				...data,
				externalPortalCookie: externalPortalProgress.cookie
			})
		);

		const student = await this.prismaTransaction.anyway(async tx => {
			const student = await tx.student.create({
				data: dataToCreate
			});

			await this.progressSyncService.init(student, student.semester, externalPortalProgress, tx);

			return student;
		}, tx);

		return { student };
	}

	async updateWithProgress(
		id: number,
		data: StudentUpdateWithProgressData,
		tx?: Prisma.TransactionClient
	) {
		const existingStudent = this.mapWithDecryptedPassword(
			await this.prisma.student.findFirst({
				where: { id }
			})
		);

		const dataToGetProgress = {
			fullName: existingStudent.fullName,
			password: data.password ?? existingStudent.password,
			semester: data.semester ?? existingStudent.semester,
			cookie: !isExist(data.password) ? existingStudent.externalPortalCookie : undefined
		};

		const externalPortalProgress = await this.externalPortalService.getProgress(dataToGetProgress, {
			subjectListWithGrade: true,
			subjectListWithEventList: true
		});

		const dataToUpdate = this.mapWithEncryptedPassword(
			this.mapWithCalculateCourse({
				password: isExist(data.password) ? data.password : undefined,
				semester: isExist(data.semester) ? data.semester : undefined,
				externalPortalCookie: externalPortalProgress.cookie
			})
		);

		return await this.prismaTransaction.anyway(async tx => {
			const student = await tx.student.update({
				where: { id },
				data: dataToUpdate
			});

			const { notificationCallbacks } = await this.progressSyncService.update(
				student,
				student.semester,
				externalPortalProgress,
				tx
			);

			return { student, notificationCallbacks };
		}, tx);
	}
}
