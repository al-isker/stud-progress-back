import { PrismaPg } from '@prisma/adapter-pg';
import { DATABASE_URL_KEY } from 'src/common/lib/env/env-keys';
import { PrismaClient } from 'src/common/prisma/generated/client';
import { Injectable, OnModuleInit } from '@nestjs/common';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
	constructor() {
		const adapter = new PrismaPg({ connectionString: process.env[DATABASE_URL_KEY] });

		super({
			adapter,
			transactionOptions: {
				timeout: 300000
			}
		});
	}

	async onModuleInit() {
		await this.$connect();
	}
}
