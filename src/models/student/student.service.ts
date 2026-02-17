import { omit } from 'src/common/lib/light-lodash/omit';
import { PrismaQueryData } from 'src/common/lib/prisma/types/prisma-query-data';
import { PrismaService } from 'src/models/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { DgmuService } from '../dgmu/dgmu.service';
import { GradeHelperService } from '../grade-helper/grade-helper.service';
import { RatingBySemesterHelperService } from '../rating-by-semester-helper/rating-by-semester-helper.service';
import { PasswordService } from './password.service';
import { CreateStudentData } from './types/create-student-data.type';
import { UpdateStudentData } from './types/update-student-data.type';

@Injectable()
export class StudentService {
	constructor(
		private prisma: PrismaService,
		private passwordService: PasswordService,
		private gradeHelperService: GradeHelperService,
		private ratingBySemesterHelperService: RatingBySemesterHelperService,
		private dgmuService: DgmuService
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
		const { subjectListWithGradeByAllSemesters, subjectListWithEventList } =
			await this.dgmuService.findMany(data, {
				gradeByAllSemesters: true,
				eventList: true
			});

		const dataWithoutPassword = omit(data, 'password');

		const encryptedPassword = this.passwordService.encrypt(data.password);
		const course = this.calculateCourse(data.semester);

		const dataForCreate = Object.assign(dataWithoutPassword, {
			encryptedPassword,
			course
		});

		const student = await this.prisma.student.create({
			data: dataForCreate
		});

		await this.gradeHelperService.createAll(
			student,
			subjectListWithGradeByAllSemesters
		);
		await this.ratingBySemesterHelperService.createBySemester(
			student,
			subjectListWithEventList
		);

		const studentWithDecryptedPassword = this.mapWithDecryptedPassword(student);

		return studentWithDecryptedPassword;
	}

	async update(id: number, data: UpdateStudentData) {
		const student = await this.prisma.student.findFirst({
			where: { id }
		});

		const studentWithDecryptedPassword = this.mapWithDecryptedPassword(student);

		const { subjectListWithGrade, subjectListWithEventList } =
			await this.dgmuService.findMany(studentWithDecryptedPassword, {
				grade: true,
				eventList: true
			});

		type DataForUpdateType = PrismaQueryData<typeof this.prisma.student.update>;

		const dataWithoutPassword: DataForUpdateType = omit(data, 'password');

		const encryptedPassword = this.passwordService.encrypt(data.password);
		const course = this.calculateCourse(data.semester);

		const dataForUpdate = Object.assign(dataWithoutPassword, {
			encryptedPassword,
			course
		});

		const updatedStudent = await this.prisma.student.update({
			where: { id },
			data: dataForUpdate
		});

		await this.gradeHelperService.updateBySemester(
			updatedStudent,
			subjectListWithGrade
		);
		await this.ratingBySemesterHelperService.updateBySemester(
			updatedStudent,
			subjectListWithEventList
		);

		const updatedStudentWithDecryptedPassword =
			this.mapWithDecryptedPassword(updatedStudent);

		return updatedStudentWithDecryptedPassword;
	}
}
