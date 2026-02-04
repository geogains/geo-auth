import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const username = formData.get('username') as string;
    const imageFile = formData.get('image') as File;

    if (!username || !imageFile) {
      return NextResponse.json(
        { error: 'Username and image are required' },
        { 
          status: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          }
        }
      );
    }

    // Validate username
    if (username.length < 2 || username.length > 30) {
      return NextResponse.json(
        { error: 'Username must be between 2 and 30 characters' },
        { 
          status: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          }
        }
      );
    }

    // Convert image to base64
    const arrayBuffer = await imageFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Image = `data:${imageFile.type};base64,${buffer.toString('base64')}`;

    // Generate unique ID for Instagram
    const manualInstagramId = `manual_${username.toLowerCase()}_${Date.now()}`;

    // Save to Supabase with ALL required fields
    const { data, error: dbError } = await supabase
      .from('players')
      .insert({
        instagram_id: manualInstagramId,
        platform: 'instagram',           // Required
        platform_user_id: manualInstagramId, // Required
        username: username,               // Required
        display_name: username,           // Required
        avatar_url: base64Image,
        is_active: true,
        verified: true,
        joined_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      return NextResponse.json(
        { error: 'Failed to save user data' },
        { 
          status: 500,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          }
        }
      );
    }

    return NextResponse.json(
      { 
        success: true,
        message: 'Successfully signed up!',
        user: {
          username: data.username,
          id: data.id
        }
      },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      }
    );

  } catch (err) {
    console.error('Manual signup error:', err);
    return NextResponse.json(
      { error: 'An error occurred during signup' },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      }
    );
  }
}

// Handle CORS preflight
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}