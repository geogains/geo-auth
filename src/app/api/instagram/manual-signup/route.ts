import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const rawUsername = formData.get('username') as string;
    const rawEmail = formData.get('email') as string;
    const imageFile = formData.get('image') as File;

    if (!rawUsername || !rawEmail || !imageFile) {
      return NextResponse.json(
        { error: 'Username, email, and image are required' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const username = rawUsername.trim();
    const email = rawEmail.trim().toLowerCase();

    if (username.length < 2 || username.length > 30) {
      return NextResponse.json(
        { error: 'Username must be between 2 and 30 characters' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Duplicate username check — scoped to Instagram/manual only
    const { data: existingByUsername } = await supabase
      .from('players')
      .select('id')
      .eq('platform', 'instagram')
      .eq('username', username)
      .maybeSingle();

    if (existingByUsername) {
      return NextResponse.json(
        { error: 'That Instagram username is already registered.' },
        { status: 409, headers: CORS_HEADERS }
      );
    }

    // Duplicate email check — scoped to Instagram/manual only
    const { data: existingByEmail } = await supabase
      .from('players')
      .select('id')
      .eq('platform', 'instagram')
      .eq('email', email)
      .maybeSingle();

    if (existingByEmail) {
      return NextResponse.json(
        { error: 'That email address is already registered.' },
        { status: 409, headers: CORS_HEADERS }
      );
    }

    // Convert image to base64
    const arrayBuffer = await imageFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Image = `data:${imageFile.type};base64,${buffer.toString('base64')}`;

    // Stable ID — no Date.now(), prevents duplicate rows on re-submission
    const manualInstagramId = `manual_${username.toLowerCase()}`;

    const { data, error: dbError } = await supabase
      .from('players')
      .insert({
        instagram_id: manualInstagramId,
        platform: 'instagram',
        platform_user_id: manualInstagramId,
        username,
        display_name: username,
        email,
        avatar_url: base64Image,
        is_active: true,
        verified: true,
        joined_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);

      // Unique constraint violation — map to a user-facing message
      if (dbError.code === '23505') {
        const details = dbError.details || '';
        if (details.includes('(email)')) {
          return NextResponse.json(
            { error: 'That email address is already registered.' },
            { status: 409, headers: CORS_HEADERS }
          );
        }
        if (details.includes('(username)') || details.includes('(platform_user_id)')) {
          return NextResponse.json(
            { error: 'That Instagram username is already registered.' },
            { status: 409, headers: CORS_HEADERS }
          );
        }
        return NextResponse.json(
          { error: 'That username or email is already registered.' },
          { status: 409, headers: CORS_HEADERS }
        );
      }

      return NextResponse.json(
        { error: 'Failed to save user data' },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Successfully signed up!',
        user: {
          username: data.username,
          id: data.id,
        },
      },
      { headers: CORS_HEADERS }
    );

  } catch (err) {
    console.error('Manual signup error:', err);
    return NextResponse.json(
      { error: 'An error occurred during signup' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: CORS_HEADERS,
  });
}
