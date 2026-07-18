import { PrismaPg } from '@prisma/adapter-pg';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { DATABASE_URL_KEY } from '@/common/lib/env/env-keys';
import { PrismaClient } from '@/common/prisma/generated/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
	constructor() {
		const adapter = new PrismaPg({
			connectionString: process.env[DATABASE_URL_KEY],
			max: 10,
			connectionTimeoutMillis: 5000
		});

		super({ adapter });
	}

	async onModuleInit() {
		await this.$connect();
	}
}
