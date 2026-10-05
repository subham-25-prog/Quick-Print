import { NextRequest, NextResponse } from 'next/server';
import { database } from '@/lib/db';
import { getCurrentShopId } from '@/lib/shop';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderId, orderNumber, shopName, rating, tags, comment } = body || {};

    if (!rating || typeof rating !== 'number' || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: 'A valid rating between 1 and 5 is required.' },
        { status: 400 }
      );
    }

    const feedbackEntry = {
      id: crypto.randomUUID(),
      order_id: orderId || null,
      order_number: orderNumber || 'ANONYMOUS',
      shop_name: shopName || 'QuickPrint',
      shop_id: getCurrentShopId(),
      rating: Math.round(rating),
      tags: Array.isArray(tags) ? tags.slice(0, 10) : [],
      comment: typeof comment === 'string' ? comment.slice(0, 1000).trim() : '',
      created_at: new Date().toISOString(),
    };

    console.log('[Feedback Received]', JSON.stringify(feedbackEntry));

    // 1. Try to record in Supabase database if available
    try {
      const db = database();
      if (db) {
        // Try recording in dedicated feedbacks table or order_events audit
        const { error: insertError } = await db.from('feedbacks').insert([feedbackEntry]);
        if (insertError) {
          // If feedbacks table does not exist, log to order_events if order_id is present
          if (feedbackEntry.order_id) {
            try {
              await db.from('order_events').insert([
                {
                  order_id: feedbackEntry.order_id,
                  previous_status: 'FEEDBACK',
                  new_status: 'FEEDBACK_SUBMITTED',
                  actor: 'customer',
                  message: JSON.stringify({
                    rating: feedbackEntry.rating,
                    tags: feedbackEntry.tags,
                    comment: feedbackEntry.comment,
                  }),
                },
              ]);
            } catch {}
          }
        }
      }
    } catch {
      // Continue to local file fallback
    }

    // 2. Persistent fallback to uploads/feedbacks.json
    try {
      const dirPath = path.join(process.cwd(), 'uploads');
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      const filePath = path.join(dirPath, 'feedbacks.json');
      let existing: any[] = [];
      if (fs.existsSync(filePath)) {
        try {
          existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          if (!Array.isArray(existing)) existing = [];
        } catch {
          existing = [];
        }
      }
      existing.unshift(feedbackEntry);
      // Keep up to 500 recent entries
      if (existing.length > 500) existing = existing.slice(0, 500);
      fs.writeFileSync(filePath, JSON.stringify(existing, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to write feedback to local file:', e);
    }

    return NextResponse.json({
      success: true,
      message: 'Feedback received! Spider-Man salutes you! 🕷️✨',
      feedback: feedbackEntry,
    });
  } catch (err: any) {
    console.error('Feedback submission error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to submit feedback' },
      { status: 500 }
    );
  }
}
