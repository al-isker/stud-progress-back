import { Request } from 'express';
import { JwtStudentPayload } from 'src/models/token/types/jwt-student-payload.type';

export type RequestWithUser = Request & {
	user?: JwtStudentPayload;
};
