const nodemailer = require('nodemailer');
const Post = require('../models/Post');
const Subscriber = require('../models/Subscriber');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_PASS;

  if (!user || !pass) {
    throw new Error('GMAIL_USER / GMAIL_PASS not configured');
  }

  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });

  return transporter;
}

/**
 * Build a simple HTML digest from the most recent / top posts.
 */
async function buildDigestHtml() {
  const siteUrl = (process.env.SITE_URL || '').replace(/\/$/, '');

  const [topFacts, topNews] = await Promise.all([
    Post.find({ source: 'blogger', status: 'active' }).sort({ publishedAt: -1 }).limit(5),
    Post.find({ source: 'newsapi', status: 'active' }).sort({ trendingScore: -1 }).limit(5),
  ]);

  const renderItem = (post) => {
    const link =
      post.source === 'blogger' ? `${siteUrl}/article/${post.slug}` : `${siteUrl}/news/${post.slug}`;
    return `<li style="margin-bottom:12px;"><a href="${link}" style="color:#FF6B35;font-weight:bold;text-decoration:none;">${post.title}</a><br/><span style="color:#555;font-size:14px;">${post.excerpt || ''}</span></li>`;
  };

  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width:600px; margin:0 auto;">
      <h1 style="color:#1a1a2e;">FactDropDaily Weekly Digest</h1>
      <h2 style="color:#FF6B35;">🧠 Facts of the Week</h2>
      <ul style="list-style:none;padding:0;">${topFacts.map(renderItem).join('')}</ul>
      <h2 style="color:#1a1a2e;">📰 Trending News</h2>
      <ul style="list-style:none;padding:0;">${topNews.map(renderItem).join('')}</ul>
      <p style="color:#999;font-size:12px;margin-top:24px;">
        You're receiving this because you subscribed at FactDropDaily.
      </p>
    </div>
  `;
}

/**
 * Send the weekly digest to every confirmed subscriber.
 * Returns { sent, failed }.
 */
async function sendNewsletterToAll() {
  const html = await buildDigestHtml();
  const subscribers = await Subscriber.find({ confirmed: true });
  const mailer = getTransporter();

  let sent = 0;
  let failed = 0;

  for (const sub of subscribers) {
    try {
      await mailer.sendMail({
        from: `"FactDropDaily" <${process.env.GMAIL_USER}>`,
        to: sub.email,
        subject: '🧠 Your FactDropDaily Weekly Digest',
        html,
      });
      sub.lastNewsletterSentAt = new Date();
      await sub.save();
      sent += 1;
    } catch (err) {
      console.error(`[Newsletter] Failed to send to ${sub.email}:`, err.message);
      failed += 1;
    }
  }

  return { sent, failed, total: subscribers.length };
}

module.exports = { sendNewsletterToAll, buildDigestHtml };
