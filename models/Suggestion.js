const mongoose = require('mongoose');
const { inMemorySuggestions } = require('./dbStore');
const crypto = require('crypto');

const suggestionSchema = new mongoose.Schema({
  text: { type: String, required: true },
  type: { type: String, enum: ['trending', 'manual'], default: 'manual' },
  pinned: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const MongooseSuggestion = mongoose.model('Suggestion', suggestionSchema);

function wrapDoc(doc) {
  if (!doc) return null;
  if (!doc._id) doc._id = crypto.randomBytes(12).toString('hex');
  if (doc.save) return doc;
  doc.save = async function() { return doc; };
  doc.deleteOne = async function() {
    const idx = inMemorySuggestions.findIndex(s => String(s._id) === String(doc._id));
    if (idx !== -1) inMemorySuggestions.splice(idx, 1);
    return { acknowledged: true, deletedCount: 1 };
  };
  return doc;
}

class QueryChain {
  constructor(data) {
    this._data = data.map(wrapDoc);
  }

  sort(sortSpec) {
    if (sortSpec) {
      this._data.sort((a, b) => {
        for (const [key, dir] of Object.entries(sortSpec)) {
          let valA = a[key];
          let valB = b[key];
          if (valA instanceof Date) valA = valA.getTime();
          if (valB instanceof Date) valB = valB.getTime();
          if (valA < valB) return dir === -1 ? 1 : -1;
          if (valA > valB) return dir === -1 ? -1 : 1;
        }
        return 0;
      });
    }
    return this;
  }

  limit(n) {
    if (n && typeof n === 'number') {
      this._data = this._data.slice(0, n);
    }
    return this;
  }

  then(resolve, reject) {
    return Promise.resolve(this._data).then(resolve, reject);
  }

  catch(reject) {
    return Promise.resolve(this._data).catch(reject);
  }
}

const SuggestionProxy = {
  find: function(query = {}) {
    if (mongoose.connection.readyState === 1) {
      return MongooseSuggestion.find(query);
    }
    return new QueryChain(inMemorySuggestions);
  },

  create: async function(doc) {
    if (mongoose.connection.readyState === 1) {
      return MongooseSuggestion.create(doc);
    }
    const item = {
      _id: crypto.randomBytes(12).toString('hex'),
      type: 'manual',
      pinned: false,
      order: 0,
      createdAt: new Date(),
      ...doc
    };
    wrapDoc(item);
    inMemorySuggestions.unshift(item);
    return item;
  },

  findByIdAndUpdate: async function(id, update, options) {
    if (mongoose.connection.readyState === 1) {
      return MongooseSuggestion.findByIdAndUpdate(id, update, options);
    }
    const doc = inMemorySuggestions.find(s => String(s._id) === String(id));
    if (!doc) return null;
    Object.assign(doc, update);
    return wrapDoc(doc);
  },

  findByIdAndDelete: async function(id) {
    if (mongoose.connection.readyState === 1) {
      return MongooseSuggestion.findByIdAndDelete(id);
    }
    const idx = inMemorySuggestions.findIndex(s => String(s._id) === String(id));
    if (idx !== -1) {
      const removed = inMemorySuggestions.splice(idx, 1)[0];
      return wrapDoc(removed);
    }
    return null;
  }
};

module.exports = SuggestionProxy;
