import { Transform } from 'class-transformer';

export function FullNameCase() {
	return Transform(({ value }) => {
		const fullName = value as string;
		const fullNameFirstChar = fullName[0];

		if (!fullNameFirstChar) {
			return fullName;
		}

		let resultFullName = fullNameFirstChar.toUpperCase();

		for (let i = 0; i < fullName.length; i++) {
			const currentChar = fullName[i];
			const nextChar = fullName[i + 1];

			if (!nextChar) break;

			if (currentChar === ' ' || currentChar === '-') {
				resultFullName += nextChar.toUpperCase();
			} else {
				resultFullName += nextChar.toLowerCase();
			}
		}

		return resultFullName;
	});
}
