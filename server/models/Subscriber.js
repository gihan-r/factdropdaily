const mongoose = require('mongoose');
const { Schema } = mongoose;

const subscriberSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    confirmed: { type: Boolean, default: true },
    subscribedAt: { type: Date, default: Date.now },
    lastNewsletterSentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Subscriber', subscriberSchema);
