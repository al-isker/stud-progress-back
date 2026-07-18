import { Request } from 'express';
import { JwtStudentPayload } from '@/models/token/types/jwt-student-payload.type';

export interface RequestWithUser extends Request {
	user?: JwtStudentPayload;
}
