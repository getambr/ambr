import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export async function GET() {
  try {
    const db = getSupabase();
    const { data, error } = await db
      .from('templates')
      .select('slug, name, description, category, parameter_schema, price_cents, version')
      .eq('is_active', true)
      .order('category');

    if (error) {
      console.error('Templates fetch error:', error);
      return NextResponse.json(
        { error: 'db_error', message: 'Failed to fetch templates' },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { templates: data },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: 'internal_error' },
      { status: 500 },
    );
  }
}
