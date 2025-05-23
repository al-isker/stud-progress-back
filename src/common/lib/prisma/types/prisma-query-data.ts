type Query = (data: { data: unknown }) => unknown;

export type PrismaQueryData<Q extends Query> = Parameters<Q>[0]['data'];
