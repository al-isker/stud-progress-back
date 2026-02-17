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

	private mapWithCalculateCourse<D extends object>(
		data: D & { semester: number }
	) {
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

		const dataForCreate = this.mapWithEncryptedPassword(
			this.mapWithCalculateCourse(data)
		);

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

		const { subjectListWithGrade, subjectListWithEventList } =
			await this.dgmuService.findMany(requiredData, {
				grade: true,
				eventList: true
			});

		const dataForUpdate = this.mapWithEncryptedPassword(
			this.mapWithCalculateCourse(requiredData)
		);

		const student = await this.prisma.student.update({
			where: { id },
			data: dataForUpdate
		});

		await this.gradeHelperService.updateBySemester(
			student,
			subjectListWithGrade
		);
		await this.ratingBySemesterHelperService.updateBySemester(
			student,
			subjectListWithEventList
		);

		const studentWithDecryptedPassword = this.mapWithDecryptedPassword(student);

		return studentWithDecryptedPassword;
	}
}
