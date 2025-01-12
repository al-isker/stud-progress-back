import { Injectable } from '@nestjs/common';
import { SubjectName } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';

@Injectable()
export class SubjectNameService {
	constructor(private prisma: PrismaService) {}

	async upsertByName(name: SubjectName['name']) {
		return await this.prisma.subjectName.upsert({
			where: { name },
			update: {},
			create: { name }
		})
	}
}
