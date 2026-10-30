const Storage = require('../../models/Storage');
const { v4: uuidv4 } = require('uuid');

// Parse comma-separated param
const parseParamArray = (param) => (param ? param.split(',') : []);

// Parse multi-index route params into array of objects
const parseMultiParams = (params) => {
  const arrays = {
    storageIds: parseParamArray(params.storageId),
    platforms: parseParamArray(params.platform),
    organizations: parseParamArray(params.organization),
    companies: parseParamArray(params.company),
    apps: parseParamArray(params.app),
    collections: parseParamArray(params.collection),
    keys: parseParamArray(params.key),
  };

  const maxLength = Math.max(...Object.values(arrays).map(a => a.length));

  const objects = [];
  for (let i = 0; i < maxLength; i++) {
    const getVal = (arr) => {
      // If the array has values but only 1 item, repeat it for all indexes
      if (arr.length === 1) return arr[0];
      // Otherwise, provide the specific index or null
      if (arr[i] == "#null") {
        return null;
      }
      return arr[i] || null;
    };
    objects.push({
      storageId: getVal(arrays.storageIds),
      platform: getVal(arrays.platforms),
      organization: getVal(arrays.organizations),
      company: getVal(arrays.companies),
      app: getVal(arrays.apps),
      collection: getVal(arrays.collections),
      key: getVal(arrays.keys),
      index: i
    });
  }
  return objects;
};

// Build query object for the storage document (without key)
const buildStorageQueryFromObj = (obj) => {
  const query = {};
  if (obj.storageId !== null) query.storageId = obj.storageId;
  if (obj.platform !== null) query.platform = obj.platform;
  if (obj.organization !== null) query.organization = obj.organization;
  if (obj.company !== null) query.company = obj.company;
  if (obj.app !== null) query.app = obj.app;
  if (obj.collection !== null) query.collection = obj.collection;
  return query;
};

// Permission check
const permissionAccess = ({ userId, accessList, userRoles = [] }) => {
  if (accessList.includes('#all')) return true;
  if (accessList.includes(`@${userId}`)) return true;
  return userRoles.some(roleId => accessList.includes(`#${roleId}`));
};

// -------------------- Controllers --------------------

// GET multiple - when key=null, get all key-value pairs in the document
exports.getItems = async (req, res) => {
  try {
    const paramObjects = parseMultiParams(req.params);
    const userId = req.user?.id;
    const roleIds = req.user?.roles || [];
    const result = {};

    for (const obj of paramObjects) {
      const storageQuery = buildStorageQueryFromObj(obj);
      const storages = await Storage.find(storageQuery);

      const filteredStorages = storages.filter(storage =>
        permissionAccess({ userId, accessList: storage.getAccess, userRoles: roleIds })
      );

      for (const storage of filteredStorages) {
        const { platform, organization, company, app, collection } = storage;
        const document = Object.fromEntries(storage.document);

        // Build nested path: result[platform][org][company][app][collection]
        result[platform] ??= {};
        result[platform][organization] ??= {};
        result[platform][organization][company] ??= {};
        result[platform][organization][company][app] ??= {};
        result[platform][organization][company][app][collection] ??= {};

        const target = result[platform][organization][company][app][collection];

        if (obj.key !== "null") {
          if (Object.prototype.hasOwnProperty.call(document, obj.key)) {
            target[obj.key] = document[obj.key];
          }
        } else {
          Object.assign(target, document);
        }
      }
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST (create document if not exists, add key-value)
exports.postItems = async (req, res) => {
  try {
    const paramObjects = parseMultiParams(req.params);
    const userId = req.user?.id;
    const results = [];

    for (const obj of paramObjects) {
      if (!obj.key) {
        results.push({ key: null, status: 'failed', reason: 'Key required' });
        continue;
      }

      try {
        const storageQuery = buildStorageQueryFromObj(obj);
        let storage = await Storage.findOne(storageQuery);

        if (storage) {
          // Document exists, check if key already exists
          const document = Object.fromEntries(storage.document);
          if (document.hasOwnProperty(obj.key)) {
            results.push({ key: obj.key, status: 'failed', reason: 'Key already exists' });
            continue;
          }

          // Add new key-value
          storage.document.set(obj.key, req.body.value[obj.index] || null);
          await storage.save();
          results.push({ key: obj.key, status: 'created', storageId: storage.storageId });
        } else {
          // Create new document
          const document = new Map();
          document.set(obj.key, req.body.value[obj.index] || null);

          storage = new Storage({
            storageId: req.user.userId,
            platform: obj.platform,
            organization: obj.organization,
            company: obj.company,
            app: obj.app,
            collection: obj.collection,
            storageId: obj.storageId, // Generate UUID
            document,
            getAccess: ['#all'],
            setAccess: [`@${userId}`],
            removeAccess: [`@${userId}`],
          });

          await storage.save();
          results.push({ key: obj.key, status: 'created', storageId: storage.storageId });
        }
      } catch (err) {
        results.push({ key: obj.key, status: 'failed', reason: err.message });
      }
    }
    res.status(207).json(results);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH (update key-value if document and key exist)
exports.patchItems = async (req, res) => {
  try {
    const paramObjects = parseMultiParams(req.params);
    const userId = req.user?.id;
    const roleIds = req.user?.roles || [];
    const results = [];

    for (const obj of paramObjects) {
      if (!obj.key) {
        results.push({ key: null, status: 'failed', reason: 'Key required' });
        continue;
      }

      try {
        const storageQuery = buildStorageQueryFromObj(obj);
        const storage = await Storage.findOne(storageQuery);

        if (!storage) {
          results.push({ key: obj.key, status: 'failed', reason: 'Storage document not found' });
          continue;
        }

        if (!permissionAccess({ userId, accessList: storage.setAccess, userRoles: roleIds })) {
          results.push({ key: obj.key, status: 'failed', reason: 'No set access' });
          continue;
        }

        const document = Object.fromEntries(storage.document);
        if (!document.hasOwnProperty(obj.key)) {
          results.push({ key: obj.key, status: 'failed', reason: 'Key not found' });
          continue;
        }

        // Update key-value
        storage.document.set(obj.key, req.body.value[obj.index] || null);
        await storage.save();
        results.push({ key: obj.key, status: 'updated', storageId: storage.storageId });
      } catch (err) {
        results.push({ key: obj.key, status: 'failed', reason: err.message });
      }
    }
    res.status(207).json(results);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT (upsert - create document/key if not exists)
exports.putItems = async (req, res) => {
  try {
    const paramObjects = parseMultiParams(req.params);
    const userId = req.user?.id;
    const roleIds = req.user?.roles || [];
    const results = [];

    for (const obj of paramObjects) {
      if (!obj.key) {
        results.push({ key: null, status: 'failed', reason: 'Key required' });
        continue;
      }

      try {
        const storageQuery = buildStorageQueryFromObj(obj);
        let storage = await Storage.findOne(storageQuery);

        if (storage) {
          if (!permissionAccess({ userId, accessList: storage.setAccess, userRoles: roleIds })) {
            results.push({ key: obj.key, status: 'failed', reason: 'No set access' });
            continue;
          }
          // Update or add key-value
          console.log(req.body.value[obj.index]);
          storage.document.set(obj.key, req.body.value[obj.index] || null);
          await storage.save();
          results.push({ key: obj.key, status: 'updated', storageId: storage.storageId });
        } else {
          // Create new document
          const document = new Map();
          console.log(req.body.value[obj.index]);
          document.set(obj.key, req.body.value[obj.index] || null);

          storage = new Storage({
            storageId: obj.storageId,
            platform: obj.platform,
            organization: obj.organization,
            company: obj.company,
            app: obj.app,
            collection: obj.collection,
            storageId: obj.storageId, // Generate UUID
            document,
            getAccess: ['#all'],
            setAccess: [`@${userId}`],
            removeAccess: [`@${userId}`],
          });

          await storage.save();
          results.push({ key: obj.key, status: 'created', storageId: storage.storageId });
        }
      } catch (err) {
        results.push({ key: obj.key, status: 'failed', reason: err.message });
      }
    }
    res.status(207).json(results);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE - remove specific key or entire document
exports.deleteItems = async (req, res) => {
  try {
    const paramObjects = parseMultiParams(req.params);
    const userId = req.user?.id;
    const roleIds = req.user?.roles || [];
    const results = [];

    for (const obj of paramObjects) {
      const storageQuery = buildStorageQueryFromObj(obj);
      const storages = await Storage.find(storageQuery);

      if (storages.length === 0) {
        results.push({ key: obj.key || null, status: 'failed', reason: 'Not found' });
        continue;
      }

      for (const storage of storages) {
        if (!permissionAccess({ userId, accessList: storage.removeAccess, userRoles: roleIds })) {
          results.push({
            key: obj.key || 'document',
            status: 'failed',
            reason: 'No permission',
            storageId: storage.storageId
          });
          continue;
        }

        if (obj.key) {
          // Remove specific key
          const document = Object.fromEntries(storage.document);
          if (document.hasOwnProperty(obj.key)) {
            storage.document.delete(obj.key);
            // Remove document if empty
            if (storage.document.size === 0) {
              await storage.deleteOne();
              results.push({ key: obj.key, status: 'deleted', storageId: storage.storageId });
            } else {
              await storage.save();
              results.push({ key: obj.key, status: 'deleted', storageId: storage.storageId });
            }
          } else {
            results.push({ key: obj.key, status: 'failed', reason: 'Key not found', storageId: storage.storageId });
          }
        } else {
          // Remove entire document (when key=null)
          await storage.deleteOne();
          results.push({ key: 'document', status: 'deleted', storageId: storage.storageId });
        }
      }
    }
    res.status(207).json(results);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
