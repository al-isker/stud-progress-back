import { Student } from '@prisma/client';

export type StudentWithDecryptedPassword = Omit<
	Student,
	'encryptedPassword'
> & {
	password: string;
};
