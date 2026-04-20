import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * GET /api/leaderboard
 * 
 * Returns battle royale leaderboard data from leaderboard_stats view
 * Supports optional ?platform=instagram or ?platform=tiktok filter
 * Supports optional ?limit=N for pagination
 */
export async function GET(request: Request) {
  try {
    console.log('📊 Fetching battle royale leaderboard...');

    // Get query params
    const { searchParams } = new URL(request.url);
    const platformFilter = searchParams.get('platform');
    const dateFilter = searchParams.get('date');
    const limit = parseInt(searchParams.get('limit') || '100');

    // If date filter is provided, query battle_results directly for that date
    if (dateFilter) {
      console.log(`📅 Filtering by date: ${dateFilter}`);
      
      let query = supabase
        .from('battle_results')
        .select('*')
        .gte('match_date', `${dateFilter}T00:00:00`)
        .lt('match_date', `${dateFilter}T23:59:59`);

      if (platformFilter && (platformFilter === 'instagram' || platformFilter === 'tiktok')) {
        query = query.eq('platform', platformFilter);
      }

      const { data, error } = await query;

      if (error) {
        console.error('❌ Supabase query error:', error);
        return NextResponse.json(
          { 
            success: false, 
            error: 'Failed to fetch leaderboard data',
            details: error.message 
          },
          { 
            status: 500,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type',
            }
          }
        );
      }

      // Aggregate by player - get best stats for the day
      const playerStats: Record<string, {
        id: string;
        username: string;
        best_survival_time: number;
        total_kills: number;
        total_damage: number;
        best_placement: number;
      }> = {};

      (data || []).forEach(result => {
        const playerId = result.player_id;
        
        if (!playerStats[playerId]) {
          playerStats[playerId] = {
            id: playerId,
            username: result.username,
            best_survival_time: result.survival_time || 0,
            total_kills: result.kills || 0,
            total_damage: result.damage_dealt || 0,
            best_placement: result.placement || 999,
          };
        } else {
          const stats = playerStats[playerId];
          // Keep best (longest) survival time
          if ((result.survival_time || 0) > stats.best_survival_time) {
            stats.best_survival_time = result.survival_time || 0;
          }
          // Sum kills and damage across all matches that day
          stats.total_kills += result.kills || 0;
          stats.total_damage += result.damage_dealt || 0;
          // Keep best (lowest) placement
          if ((result.placement || 999) < stats.best_placement) {
            stats.best_placement = result.placement;
          }
        }
      });

      // Convert to array
      const leaderboard = Object.values(playerStats).map(player => ({
        id: player.id,
        username: player.username,
        display_name: player.username,
        avatar_url: '/assets/default-avatar.png',
        platform: 'unknown',
        avg_survival_time: player.best_survival_time, // Using best survival time for the day
        total_kills: player.total_kills,
        total_damage: player.total_damage,
        best_placement: player.best_placement,
      })).slice(0, limit);

      console.log(`✅ Date-filtered leaderboard: ${leaderboard.length} players`);

      return NextResponse.json({
        success: true,
        leaderboard,
        count: leaderboard.length,
        filters: {
          limit,
          platform: platformFilter || 'all',
          date: dateFilter,
        },
        updated_at: new Date().toISOString(),
      }, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
        }
      });
    }

    // No date filter - use aggregated leaderboard_stats view for all-time
    let query = supabase
      .from('leaderboard_stats')
      .select('*')
      .order('total_points', { ascending: false })
      .limit(limit);

    // Apply platform filter if specified
    if (platformFilter && (platformFilter === 'instagram' || platformFilter === 'tiktok')) {
      query = query.eq('platform', platformFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ Supabase query error:', error);
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to fetch leaderboard data',
          details: error.message 
        },
        { 
          status: 500,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          }
        }
      );
    }

    console.log(`✅ Leaderboard fetched: ${data?.length || 0} players`);

    // Transform data to match expected format
    const leaderboard = (data || []).map(player => ({
      id: player.id,
      username: player.username,
      display_name: player.display_name || player.username,
      avatar_url: (player.avatar_url || '/assets/default-avatar.png').replace('https://api.geo-ranks.com', 'https://ajwxgdaninuzcpfwawug.supabase.co'),
      platform: player.platform || 'unknown',
      total_points: player.total_points || 0,
      total_wins: player.total_wins || 0,
      total_matches: player.total_matches || 0,
      total_kills: player.total_kills || 0,
      avg_placement: player.avg_placement || 0,
      last_played: player.last_played,
    }));

    return NextResponse.json({
      success: true,
      leaderboard,
      count: leaderboard.length,
      filters: {
        limit,
        platform: platformFilter || 'all',
      },
      updated_at: new Date().toISOString(),
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      }
    });

  } catch (err) {
    console.error('❌ Unexpected error:', err);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error',
        details: err instanceof Error ? err.message : 'Unknown error'
      },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      }
    );
  }
}

/**
 * OPTIONS handler for CORS preflight
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}