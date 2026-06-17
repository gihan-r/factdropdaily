const crypto = require('crypto');

let cloudinary = null;
try {
  // Only load + configure Cloudinary if a URL is actually provided.
  if (process.env.CLOUDINARY_URL) {
    cloudinary = require('cloudinary').v2;
    // cloudinary automatically reads CLOUDINARY_URL from env on require,
    // but we call config() explicitly for clarity/safety.
    cloudinary.config(true);
  }
} catch (err) {
  console.warn('[ImageProxy] Cloudinary not available:', err.message);
  cloudinary = null;
}

/**
 * Cache a remote image (e.g. from NewsAPI) into Cloudinary so we don't
 * hotlink third-party images and can control sizing/format.
 *
 * Falls back to the original URL if Cloudinary isn't configured or
 * the upload fails - the site keeps working either way.
 */
async function cacheImage(originalUrl) {
  if (!originalUrl) return '';
  if (!cloudinary) return originalUrl;

  try {
    // Deterministic public_id so repeated syncs don't re-upload duplicates
    const publicId = `factdropdaily/news/${crypto
      .createHash('md5')
      .update(originalUrl)
      .digest('hex')}`;

    const result = await cloudinary.uploader.upload(originalUrl, {
      public_id: publicId,
      overwrite: false,
      folder: '', // already included in public_id
      resource_type: 'image',
    });

    return result.secure_url;
  } catch (err) {
    console.warn('[ImageProxy] Cloudinary upload failed, using original URL:', err.message);
    return originalUrl;
  }
}

module.exports = { cacheImage };
