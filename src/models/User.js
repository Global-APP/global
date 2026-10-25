const { Schema, model } = require('mongoose');

const userSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true },
    staff: { type: Boolean, default: false },
    badges: { type: [String], default: [] },
    selectedBadge: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = model('User', userSchema);
