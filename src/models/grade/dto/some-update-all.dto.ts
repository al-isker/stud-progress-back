import { SomeUpdateDto } from './some-update.dto';

class SomeUpdateAllDtoItem {
	semester: number;
	subjects: SomeUpdateDto;
}

export type SomeUpdateAllDto = SomeUpdateAllDtoItem[];
