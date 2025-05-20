import { Transform } from 'class-transformer';

export function Trim() {
	return Transform(({ value }) => {
		return (value as string).trim();
	});
}
