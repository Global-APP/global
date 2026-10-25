const { Schema, model } = require('mongoose');

const userSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true },
    staff: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = model('User', userSchema);
