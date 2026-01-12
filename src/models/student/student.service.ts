import { isExist } from 'src/common/lib/light-lodash/is-exist';
import { omit } from 'src/common/lib/light-lodash/omit';
import { PrismaQueryData } from 'src/common/lib/prisma/types/prisma-query-data';
import { PrismaService } from 'src/models/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { SubjectHelperService } from '../subject-helper/subject-helper.service';
import { PasswordService } from './password.service';
import { CreateStudentData } from './types/create-student-data.type';
import { UpdateStudentData } from './types/update-student-data.type';

@Injectable()
export class StudentService {
	constructor(
		private prisma: PrismaService,
		private passwordService: PasswordService,
		private subjectHelperService: SubjectHelperService
	) {}

	private calculateCourse(semester: number) {
		return Math.ceil(semester / 2);
	}

	mapWithDecryptedPassword<D extends object>(
		data: D & { encryptedPassword: string }
	) {
		const { encryptedPassword, ...restData } = data;

		return Object.assign(restData, {
			password: this.passwordService.decrypt(encryptedPassword)
		});
	}

	async create(data: CreateStudentData) {
		const encryptedPassword = this.passwordService.encrypt(data.password);
		const course = this.calculateCourse(data.semester);

		const dataWithoutPassword = omit(data, 'password');

		const dataForCreate = Object.assign(dataWithoutPassword, {
			encryptedPassword,
			course
		});

		const student = await this.prisma.student.create({
			data: dataForCreate
		});

		const studentWithDecryptedPassword = this.mapWithDecryptedPassword(student);

		await this.subjectHelperService.createAll(studentWithDecryptedPassword);

		return studentWithDecryptedPassword;
	}

	async update(id: number, data: UpdateStudentData) {
		type DataForUpdateType = PrismaQueryData<typeof this.prisma.student.update>;

		const dataForUpdate: DataForUpdateType = omit(data, 'password');

		if (isExist(data.password)) {
			dataForUpdate.encryptedPassword = this.passwordService.encrypt(
				data.password
			);
		}

		if (isExist(data.semester)) {
			dataForUpdate.course = this.calculateCourse(data.semester);
		}

		const student = await this.prisma.student.update({
			where: { id },
			data: dataForUpdate
		});

		const studentWithDecryptedPassword = this.mapWithDecryptedPassword(student);

		// if (isExist(data.semester)) {
		// 	await this.subjectHelperService.updateBySemester(
		// 		studentWithDecryptedPassword
		// 	);
		// }

		return studentWithDecryptedPassword;
	}
}
