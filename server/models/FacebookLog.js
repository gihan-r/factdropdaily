const mongoose = require('mongoose');
const { Schema } = mongoose;

const facebookLogSchema = new Schema(
  {
    post: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
    fbPostId: { type: String, default: '' },
    type: { type: String, enum: ['fact', 'news', 'breaking', 'manual'], required: true },
    status: { type: String, enum: ['success', 'failed'], required: true },
    error: { type: String, default: '' },
    postedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('FacebookLog', facebookLogSchema);
