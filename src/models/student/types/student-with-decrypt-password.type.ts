import { Student } from '@prisma/client';

export type StudentWithDecryptPassword = Omit<Student, 'encryptedPassword'> & {
	password: string;
};
