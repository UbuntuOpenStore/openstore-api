const mongoose = require('mongoose');

const lockSchema = mongoose.Schema({
    name: { type: String },
    expire: { type: Date },
    inserted: { type: Date, default: Date.now },
}, { autoIndex: true });

lockSchema.index({name: 1}, {unique: true});

const Lock = mongoose.model('Lock', lockSchema);

module.exports = Lock;
