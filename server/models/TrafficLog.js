const mongoose = require('mongoose');
const { Schema } = mongoose;

const trafficLogSchema = new Schema(
  {
    ip: { type: String, required: true },
    userAgent: { type: String, default: '' },
    path: { type: String, required: true },
    type: { type: String, enum: ['pageview', 'click'], default: 'pageview' },
    targetSlug: { type: String, default: '' }, // For clicks on articles/news
    isBot: { type: Boolean, default: false },
    botReason: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('TrafficLog', trafficLogSchema);
