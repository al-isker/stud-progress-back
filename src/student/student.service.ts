import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';

@Injectable()
export class StudentService {
	constructor(private prisma: PrismaService) {}

	find() {
		return 'student'
	}
}
