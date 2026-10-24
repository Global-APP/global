const { Schema, model } = require('mongoose');

const staffSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true }
  },
  { timestamps: true }
);

module.exports = model('Staff', staffSchema);
