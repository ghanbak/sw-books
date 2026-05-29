'use server';

import type { Database } from '@app/types';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';

type BookRow = Database['public']['Tables']['books']['Row'];
type ActionError = { code: string; message: string };
type Result<T> = { ok: true; data: T } | { ok: false; error: ActionError };

const patchSchema = z
	.object({
		title: z.string().min(1),
		author: z.array(z.string()),
		cover_image: z.string().nullable(),
		publisher: z.string().nullable(),
		date_published: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
			.nullable(),
		language: z.string().nullable(),
		format: z.array(z.string()),
		synopsis: z.string().nullable(),
		isbn: z.array(z.string()),
		primary_isbn: z.string().nullable(),
		canon: z.enum(['Canon', 'Legends']),
		type: z.enum(['Adult Novel', 'YA Novel', 'Middle Grade Novel']),
		era: z.string().nullable(),
		series_name: z.string().nullable(),
		series_order: z.number().int().nullable(),
		timeline_order: z.number().nullable(),
	})
	.partial()
	.refine((p) => !p.isbn || !p.primary_isbn || p.isbn.includes(p.primary_isbn), {
		message: 'primary_isbn must be one of isbn[]',
		path: ['primary_isbn'],
	});

export type BookPatchInput = z.input<typeof patchSchema>;

export async function patchBook(id: string, raw: unknown): Promise<Result<BookRow>> {
	const parsed = patchSchema.safeParse(raw);
	if (!parsed.success) {
		return { ok: false, error: { code: 'INVALID', message: parsed.error.issues[0]?.message ?? 'invalid patch' } };
	}
	if (Object.keys(parsed.data).length === 0) {
		return { ok: false, error: { code: 'EMPTY', message: 'no fields to update' } };
	}

	const { data, error } = await supabaseAdmin
		.from('books')
		.update(parsed.data)
		.eq('id', id)
		.select()
		.single();

	if (error) return { ok: false, error: { code: 'DB', message: error.message } };
	revalidateTag('books');
	return { ok: true, data };
}
