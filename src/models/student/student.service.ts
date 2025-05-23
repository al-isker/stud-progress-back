import { Student } from '@prisma/client';
import { omit } from 'src/common/lib/light-lodash/omit';
import { PrismaQueryData } from 'src/common/lib/prisma/types/prisma-query-data';
import { PrismaService } from 'src/prisma.service';
import { Injectable } from '@nestjs/common';
import { PasswordService } from './password.service';
import { CreateStudentData } from './types/create-student-data.type';
import { UpdateStudentData } from './types/update-student-data.type';

@Injectable()
export class StudentService {
	constructor(
		private prisma: PrismaService,
		private passwordService: PasswordService
	) {}

	private calculateCourse(semester: number) {
		return Math.ceil(semester / 2);
	}

	private mapWithDecryptPassword(data?: Student) {
		if (!data) return;

		const { encryptedPassword, ...restData } = data;

		return Object.assign(restData, {
			password: this.passwordService.decrypt(encryptedPassword)
		});
	}

	async findAll() {
		const students = await this.prisma.student.findMany();

		return students.map(item => this.mapWithDecryptPassword(item));
	}

	async findById(id: number) {
		const student = await this.prisma.student.findFirst({
			where: { id }
		});

		return this.mapWithDecryptPassword(student);
	}

	async findByFullName(fullName: string) {
		const student = await this.prisma.student.findFirst({
			where: { fullName }
		});

		return this.mapWithDecryptPassword(student);
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

		return this.mapWithDecryptPassword(student);
	}

	async update(id: number, data: UpdateStudentData) {
		type DataForUpdateType = PrismaQueryData<typeof this.prisma.student.update>;

		const dataForUpdate: DataForUpdateType = omit(data, 'password');

		if (data.password) {
			dataForUpdate.encryptedPassword = this.passwordService.encrypt(
				data.password
			);
		}

		if (data.semester) {
			dataForUpdate.course = this.calculateCourse(data.semester);
		}

		const student = await this.prisma.student.update({
			where: { id },
			data: dataForUpdate
		});

		return this.mapWithDecryptPassword(student);
	}
}
