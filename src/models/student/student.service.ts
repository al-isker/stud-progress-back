import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { StudentDto } from './dto/student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';

@Injectable()
export class StudentService {
	constructor(private prisma: PrismaService) {}

	async findById(id: number) {
		return await this.prisma.student.findFirst({
			where: { id }
		})
	}

	async findByFullName(fullName: StudentDto['fullName']) {
		return await this.prisma.student.findFirst({
			where: { fullName }
		})
	}

	async create(dto: StudentDto) {
		return await this.prisma.student.create({
			data: dto
		})
	}

	async update(id: number, dto: UpdateStudentDto) {
		return await this.prisma.student.update({
			where: { id },
			data: dto
		})
	}
}
