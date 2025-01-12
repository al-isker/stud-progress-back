import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { UpsertStudentDto } from './dto/upsert-student.dto';

@Injectable()
export class StudentService {
	constructor(private prisma: PrismaService) {}	

	private course(semester: number) {
		return {course: Math.ceil(semester / 2)}
	}

	async findById(id: number) {
		return await this.prisma.student.findFirst({
			where: { id }
		})
	}

	async findByFullName(fullName: string) {
		return await this.prisma.student.findFirst({
			where: { fullName }
		})
	}

	async create(dto: CreateStudentDto) {
		return await this.prisma.student.create({
			data: Object.assign(
				dto, this.course(dto.semester)
			)
		})
	}

	async update(id: number, dto: UpdateStudentDto) {
		return await this.prisma.student.update({
			where: { id },
			data: Object.assign(
				dto, dto.semester && this.course(dto.semester)
			)
		})
	}

	async upsertByFullName(fullName: string, dto: UpsertStudentDto) {
		const {update, create} = dto

		return await this.prisma.student.upsert({
			where: { fullName },
			update: Object.assign(
				update, update.semester && this.course(update.semester)
			),
			create: Object.assign(
				create, create.semester && this.course(create.semester)
			)
		})
	}
}
