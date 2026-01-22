/**
 * USAGE STORE - IP-Based Rate Limiting with Supabase
 * 
 * Tracks API usage per IP address with a daily limit using Supabase.
 * This prevents abuse by storing data in a persistent database.
 * 
 * Default limit: 10 requests per day per IP when using the default API key.
 * Users with their own API key bypass this limit.
 */

import { createClient } from '@supabase/supabase-js';

// Configuration
const DAILY_LIMIT = 10;

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

// Create Supabase client (only if credentials are available)
const supabase = supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null;

// Get today's date in YYYY-MM-DD format
function getToday(): string {
    return new Date().toISOString().split('T')[0];
}

/**
 * Get usage info for an IP address
 */
export async function getUsage(ip: string): Promise<{ used: number; remaining: number; limit: number; resetDate: string }> {
    const today = getToday();

    if (!supabase) {
        console.warn('[Usage Store] Supabase not configured, allowing unlimited access');
        return { used: 0, remaining: DAILY_LIMIT, limit: DAILY_LIMIT, resetDate: today };
    }

    try {
        const { data, error } = await supabase
            .from('usage_tracking')
            .select('request_count')
            .eq('ip_address', ip)
            .eq('date', today)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
            console.error('[Usage Store] Error fetching usage:', error);
            // On error, allow access but log it
            return { used: 0, remaining: DAILY_LIMIT, limit: DAILY_LIMIT, resetDate: today };
        }

        const used = data?.request_count || 0;
        console.log(`[Usage Store] IP ${ip.substring(0, 8)}*** has used ${used}/${DAILY_LIMIT} requests today`);
        return {
            used,
            remaining: Math.max(0, DAILY_LIMIT - used),
            limit: DAILY_LIMIT,
            resetDate: today
        };
    } catch (error) {
        console.error('[Usage Store] Exception fetching usage:', error);
        return { used: 0, remaining: DAILY_LIMIT, limit: DAILY_LIMIT, resetDate: today };
    }
}

/**
 * Check if an IP can make a request (has remaining quota)
 */
export async function canMakeRequest(ip: string): Promise<boolean> {
    const usage = await getUsage(ip);
    return usage.remaining > 0;
}

/**
 * Record a request for an IP address
 * Returns the updated usage info
 */
export async function recordRequest(ip: string): Promise<{ used: number; remaining: number; limit: number }> {
    const today = getToday();

    if (!supabase) {
        console.warn('[Usage Store] Supabase not configured, skipping usage recording');
        return { used: 1, remaining: DAILY_LIMIT - 1, limit: DAILY_LIMIT };
    }

    try {
        // First, try to call the increment_usage RPC function
        const { data: rpcData, error: rpcError } = await supabase
            .rpc('increment_usage', { p_ip: ip, p_date: today });

        if (!rpcError && rpcData !== null) {
            const used = rpcData as number;
            console.log(`[Usage Store] Recorded request for IP ${ip.substring(0, 8)}***: ${used}/${DAILY_LIMIT}`);
            return {
                used,
                remaining: Math.max(0, DAILY_LIMIT - used),
                limit: DAILY_LIMIT
            };
        }

        // If RPC failed, fall back to manual upsert
        console.log('[Usage Store] RPC failed, trying manual approach:', rpcError);

        // Check if record exists
        const { data: existingData } = await supabase
            .from('usage_tracking')
            .select('request_count')
            .eq('ip_address', ip)
            .eq('date', today)
            .single();

        if (existingData) {
            // Update existing record
            const newCount = existingData.request_count + 1;
            const { error: updateError } = await supabase
                .from('usage_tracking')
                .update({
                    request_count: newCount,
                    last_request_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('ip_address', ip)
                .eq('date', today);

            if (updateError) {
                console.error('[Usage Store] Error updating usage:', updateError);
            }

            console.log(`[Usage Store] Updated request count for IP ${ip.substring(0, 8)}***: ${newCount}/${DAILY_LIMIT}`);
            return {
                used: newCount,
                remaining: Math.max(0, DAILY_LIMIT - newCount),
                limit: DAILY_LIMIT
            };
        } else {
            // Insert new record
            const { error: insertError } = await supabase
                .from('usage_tracking')
                .insert({
                    ip_address: ip,
                    date: today,
                    request_count: 1,
                    last_request_at: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });

            if (insertError) {
                console.error('[Usage Store] Error inserting usage:', insertError);
            }

            console.log(`[Usage Store] Created new usage record for IP ${ip.substring(0, 8)}***: 1/${DAILY_LIMIT}`);
            return {
                used: 1,
                remaining: DAILY_LIMIT - 1,
                limit: DAILY_LIMIT
            };
        }
    } catch (error) {
        console.error('[Usage Store] Exception recording usage:', error);
        return { used: 1, remaining: DAILY_LIMIT - 1, limit: DAILY_LIMIT };
    }
}

/**
 * Get the daily limit constant
 */
export function getDailyLimit(): number {
    return DAILY_LIMIT;
}
