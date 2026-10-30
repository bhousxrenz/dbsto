const Announcement = require('../../models/Announcement');
const Person = require('../../models/Person');
const DocumentRequest = require('../../models/DocumentRequest');
const ChatMessage = require('../../models/ChatMessage');
const AppNotification = require('../../models/AppNotification');
const User = require('../../models/User');
const { adminIds } = require('../../middlewares/requireAdmin');

const ADMIN_NAME = 'Barangay 201 Admin';
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const REACTIONS = ['👍', '❤️', '😆', '😮', '😢', '😡', 'DISLIKE'];  // DISLIKE = the thumbs-down button
const DOC_TYPES = ['CERTIFICATE', 'CLEARANCE', 'ID'];
const DOC_LABELS = { CERTIFICATE: 'Barangay Certificate', CLEARANCE: 'Barangay Clearance', ID: 'Barangay ID' };

// ───────────────────────── helpers ─────────────────────────

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const isAdmin = (req) => adminIds().includes(req.user.userId);
// Numeric ids (safe integers) so the Android app can keep using Long ids
const newId = () => Date.now() * 1000 + Math.floor(Math.random() * 1000);
const ms = (d) => new Date(d).getTime();

const ok = (res, data, status = 200) =>
  res.status(status).json({ success: true, message: 'OK', error: null, meta: null, data });

// Wraps a handler: HttpError -> proper status, anything else -> 500
const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ success: false, message: err.message, error: null, meta: null, data: null });
    }
    console.error('BARANGAY ERROR:', err);
    res.status(500).json({ success: false, message: 'Internal server error', error: err.message, meta: null, data: null });
  }
};

const text = (value, { max = 1000, required = true, fallback = '' } = {}) => {
  const t = String(value ?? '').trim().slice(0, max);
  if (!t && required) throw new HttpError(400, 'Missing required text');
  return t || fallback;
};

const numId = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new HttpError(400, 'Invalid id');
  return n;
};

// "data:image/jpeg;base64,...." or plain base64 -> { data: Buffer, contentType }
function parseImage(input) {
  if (!input) return null;
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(String(input));
  const buf = Buffer.from(m ? m[2] : String(input), 'base64');
  if (!buf.length) throw new HttpError(400, 'Image is empty');
  if (buf.length > MAX_IMAGE_BYTES) throw new HttpError(400, 'Image is larger than 2 MB');
  return { data: buf, contentType: m ? m[1] : 'image/jpeg' };
}

async function displayName(req) {
  if (isAdmin(req)) return ADMIN_NAME;
  const u = await User.findOne({ userId: req.user.userId }).select('userData');
  return (u && u.userData && u.userData.get('fullName')) || req.user.userId;
}

const preview = (t, max = 80) => {
  const s = String(t || '').replace(/\s+/g, ' ').trim();
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
};

// Creates a notification. coalesce = keep only one unread entry per sender/conversation.
async function notify({ recipient, title, message, type, refId = 0, extra = '', coalesce = false }) {
  if (coalesce) {
    await AppNotification.deleteMany({ recipient, type, extra, 'readBy.0': { $exists: false } });
  }
  await AppNotification.create({ id: newId(), recipient, title, message: preview(message), type, refId, extra });
}

// Which notifications a user may see
const notificationFilter = (req) =>
  isAdmin(req) ? { recipient: 'ADMIN' } : { recipient: { $in: ['ALL', req.user.userId] } };

// ───────────────────────── serializers (JSON the app receives) ─────────────────────────

const pubReplyish = (c) => ({
  id: c.id,
  authorId: c.authorId,
  authorName: c.authorName,
  text: c.text,
  timestamp: c.timestamp,
  // { userId: emoji }  (thumbs-down is sent separately as dislikedBy)
  reactions: Object.fromEntries((c.reactions || []).filter(r => r.e !== 'DISLIKE').map(r => [r.u, r.e])),
  dislikedBy: (c.reactions || []).filter(r => r.e === 'DISLIKE').map(r => r.u),
  replies: (c.replies || []).map(pubReplyish),
});

const pubAnnouncement = (a) => ({
  id: a.id,
  content: a.content,
  authorName: a.authorName,
  timestamp: ms(a.createdAt),
  updatedAt: ms(a.updatedAt),
  hasImage: a.hasImage,
  comments: (a.comments || []).map(pubReplyish),
});

const pubPerson = (p) => ({
  id: p.id, type: p.type, name: p.name, age: p.age, gender: p.gender, address: p.address,
  description: p.description, contactNumber: p.contactNumber, isFound: p.isFound,
  hasImage: p.hasImage, timestamp: ms(p.createdAt), updatedAt: ms(p.updatedAt),
});

const pubDocument = (d) => ({
  id: d.id, type: d.type, requestedByUsername: d.requestedByUsername, fullName: d.fullName,
  address: d.address, contactNumber: d.contactNumber, birthDate: d.birthDate, civilStatus: d.civilStatus,
  purpose: d.purpose, emergencyContactName: d.emergencyContactName,
  emergencyContactNumber: d.emergencyContactNumber, status: d.status, timestamp: ms(d.createdAt),
});

const pubMessage = (m) => ({
  id: m.id, threadKey: m.threadKey, senderUsername: m.senderUsername, text: m.text, timestamp: ms(m.createdAt),
});

const pubNotification = (n, me) => ({
  id: n.id, recipient: n.recipient, title: n.title, message: n.message, type: n.type,
  refId: n.refId, extra: n.extra, timestamp: ms(n.createdAt), isRead: n.readBy.includes(me),
});

// ───────────────────────── SYNC (one call gives the app everything it may see) ─────────────────────────

exports.sync = handle(async (req, res) => {
  const me = req.user.userId;
  const admin = isAdmin(req);

  const [announcements, persons, documents, messagesDesc, notifications] = await Promise.all([
    Announcement.find().sort({ createdAt: -1 }).limit(200),
    Person.find().sort({ createdAt: -1 }).limit(500),
    DocumentRequest.find(admin ? {} : { requestedByUsername: me }).sort({ createdAt: -1 }).limit(300),
    ChatMessage.find(admin ? {} : { threadKey: me }).sort({ createdAt: -1 }).limit(1000),
    AppNotification.find(notificationFilter(req)).sort({ createdAt: -1 }).limit(100),
  ]);

  const data = {
    serverTime: Date.now(),
    isAdmin: admin,
    announcements: announcements.map(pubAnnouncement),
    wantedPersons: persons.filter(p => p.type === 'WANTED').map(pubPerson),
    missingPersons: persons.filter(p => p.type === 'MISSING').map(pubPerson),
    documentRequests: documents.map(pubDocument),
    messages: messagesDesc.reverse().map(pubMessage),   // oldest first
    notifications: notifications.map(n => pubNotification(n, me)),
  };

  if (admin) {
    // Citizens the admin can chat with
    const users = await User.find({ userId: { $nin: adminIds() }, status: 'active' })
      .select('userId userData hasIdPhoto verification verifiedAt hasProfilePhoto profilePhotoUpdatedAt');
    const field = (u, k, d = '') => (u.userData && u.userData.get(k)) ?? d;
    data.citizens = users.map(u => ({
      userId: u.userId,
      fullName: field(u, 'fullName', u.userId),
      contact: field(u, 'contact'),
      address: field(u, 'address'),
      age: Number(field(u, 'age', 0)) || 0,
      email: field(u, 'email'),
      hasIdPhoto: !!u.hasIdPhoto,
      verification: u.verification || 'PENDING',
      verifiedAt: u.verifiedAt ? ms(u.verifiedAt) : 0,
      hasProfilePhoto: !!u.hasProfilePhoto,
      photoUpdatedAt: u.profilePhotoUpdatedAt ? ms(u.profilePhotoUpdatedAt) : 0,
    }));
  }

  // Profile photos: the citizen needs the admin's photo, and everyone needs their own.
  const adminUsers = await User.find({ userId: { $in: adminIds() } }).select('userId hasProfilePhoto profilePhotoUpdatedAt');
  data.admins = adminUsers.map(a => ({
    userId: a.userId,
    fullName: ADMIN_NAME,
    hasProfilePhoto: !!a.hasProfilePhoto,
    photoUpdatedAt: a.profilePhotoUpdatedAt ? ms(a.profilePhotoUpdatedAt) : 0,
  }));
  // Convenience for a single-admin app
  data.admin = data.admins[0] || null;
  const mine = admin ? adminUsers.find(a => a.userId === me)
                     : await User.findOne({ userId: me }).select('hasProfilePhoto profilePhotoUpdatedAt');
  data.myHasProfilePhoto = !!(mine && mine.hasProfilePhoto);
  data.myPhotoUpdatedAt = mine && mine.profilePhotoUpdatedAt ? ms(mine.profilePhotoUpdatedAt) : 0;

  // Every citizen gets their own verification status back, so the app can gate access:
  // PENDING/REJECTED citizens are blocked from the main app until the admin verifies them.
  if (!admin) {
    const meUser = await User.findOne({ userId: me }).select('verification hasIdPhoto verifiedAt');
    data.myVerification = (meUser && meUser.verification) || 'PENDING';
    data.myHasIdPhoto = !!(meUser && meUser.hasIdPhoto);
    data.myVerifiedAt = meUser && meUser.verifiedAt ? ms(meUser.verifiedAt) : 0;
  } else {
    data.myVerification = 'VERIFIED';
    data.myHasIdPhoto = false;
    data.myVerifiedAt = 0;
  }

  // userId -> photo version, for everyone whose photo the app may need to show
  // (comment/reply authors, admins, and -- for the admin -- every citizen).
  const photoIds = new Set(adminIds());
  const collect = (list) => (list || []).forEach(c => { if (c.authorId) photoIds.add(c.authorId); collect(c.replies); });
  announcements.forEach(a => collect(a.comments));
  me && photoIds.add(me);
  if (data.citizens) data.citizens.forEach(c => photoIds.add(c.userId));
  const photoUsers = await User.find({ userId: { $in: [...photoIds] }, hasProfilePhoto: true }).select('userId profilePhotoUpdatedAt');
  data.userPhotos = Object.fromEntries(photoUsers.map(u => [u.userId, u.profilePhotoUpdatedAt ? ms(u.profilePhotoUpdatedAt) : 1]));

  ok(res, data);
});

// Mixed-type image fields can come back from MongoDB as a BSON Binary instead of a Buffer
const asBuffer = (d) => (Buffer.isBuffer(d) ? d : (d && d.buffer ? Buffer.from(d.buffer) : d));

// Public: photos for announcements / persons (kept out of /sync so polling stays small)
exports.image = async (req, res) => {
  try {
    if (req.params.kind === 'users') {
      const u = await User.findOne({ userId: req.params.id }).select('+profilePhoto');
      if (!u || !u.profilePhoto || !u.profilePhoto.data) return res.status(404).end();
      res.set('Content-Type', u.profilePhoto.contentType || 'image/jpeg');
      // Photos can change, so let clients revalidate (the app appends ?v=<photoUpdatedAt> to bust the cache)
      res.set('Cache-Control', 'public, max-age=300');
      return res.send(asBuffer(u.profilePhoto.data));
    }
    const Model = req.params.kind === 'announcements' ? Announcement : req.params.kind === 'persons' ? Person : null;
    if (!Model) return res.status(404).end();
    const doc = await Model.findOne({ id: Number(req.params.id) }).select('+image');
    if (!doc || !doc.image || !doc.image.data) return res.status(404).end();
    res.set('Content-Type', doc.image.contentType || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(asBuffer(doc.image.data));
  } catch (err) {
    res.status(500).end();
  }
};

// ───────────────────────── ANNOUNCEMENTS (admin writes) ─────────────────────────

exports.createAnnouncement = handle(async (req, res) => {
  const image = parseImage(req.body.image);
  const a = await Announcement.create({
    id: newId(),
    content: text(req.body.content, { max: 5000 }),
    authorId: req.user.userId,
    authorName: ADMIN_NAME,
    hasImage: !!image,
    ...(image ? { image } : {}),
  });
  await notify({ recipient: 'ALL', title: 'New announcement', message: a.content, type: 'ANNOUNCEMENT', refId: a.id });
  ok(res, pubAnnouncement(a), 201);
});

exports.updateAnnouncement = handle(async (req, res) => {
  const a = await Announcement.findOne({ id: numId(req.params.id) });
  if (!a) throw new HttpError(404, 'Announcement not found');
  if (req.body.content !== undefined) a.content = text(req.body.content, { max: 5000 });
  const image = parseImage(req.body.image);
  if (image) { a.image = image; a.hasImage = true; }
  else if (req.body.removeImage) { a.image = undefined; a.hasImage = false; }
  await a.save();
  ok(res, pubAnnouncement(a));
});

exports.deleteAnnouncement = handle(async (req, res) => {
  const r = await Announcement.deleteOne({ id: numId(req.params.id) });
  if (!r.deletedCount) throw new HttpError(404, 'Announcement not found');
  ok(res, null);
});

// ───────────────────────── COMMENTS (any logged-in user) ─────────────────────────

exports.addComment = handle(async (req, res) => {
  const id = numId(req.params.id);
  const author = await displayName(req);
  const c = {
    id: newId(), authorId: req.user.userId, authorName: author,
    text: text(req.body.text, { max: 1000 }), timestamp: Date.now(), reactions: [], replies: [],
  };
  const r = await Announcement.updateOne({ id }, { $push: { comments: c } });   // atomic
  if (!r.matchedCount) throw new HttpError(404, 'Announcement not found');

  if (!isAdmin(req)) {
    await notify({ recipient: 'ADMIN', title: `${author} commented on your announcement`, message: c.text, type: 'COMMENT', refId: id });
  }
  ok(res, pubReplyish(c), 201);
});

exports.addReply = handle(async (req, res) => {
  const id = numId(req.params.id);
  const commentId = numId(req.params.commentId);
  const a = await Announcement.findOne({ id });
  if (!a) throw new HttpError(404, 'Announcement not found');
  const parent = a.comments.find(c => c.id === commentId);
  if (!parent) throw new HttpError(404, 'Comment not found');

  const author = await displayName(req);
  const reply = {
    id: newId(), authorId: req.user.userId, authorName: author,
    text: text(req.body.text, { max: 1000 }), timestamp: Date.now(), reactions: [],
  };
  parent.replies = parent.replies || [];
  parent.replies.push(reply);
  a.markModified('comments');
  await a.save();

  if (!isAdmin(req)) {
    await notify({ recipient: 'ADMIN', title: `${author} replied to a comment`, message: reply.text, type: 'COMMENT', refId: id });
  }
  ok(res, pubReplyish(reply), 201);
});

// body: { emoji: "👍" | null, replyId?: number }  -> set / clear my reaction
exports.setReaction = handle(async (req, res) => {
  const id = numId(req.params.id);
  const commentId = numId(req.params.commentId);
  const emoji = req.body.emoji ?? null;
  if (emoji !== null && !REACTIONS.includes(emoji)) throw new HttpError(400, 'Unsupported reaction');

  const a = await Announcement.findOne({ id });
  if (!a) throw new HttpError(404, 'Announcement not found');
  let target = a.comments.find(c => c.id === commentId);
  if (target && req.body.replyId) target = (target.replies || []).find(r => r.id === numId(req.body.replyId));
  if (!target) throw new HttpError(404, 'Comment not found');

  const me = req.user.userId;
  target.reactions = (target.reactions || []).filter(r => r.u !== me);
  if (emoji) target.reactions.push({ u: me, e: emoji });
  a.markModified('comments');
  await a.save();
  ok(res, pubReplyish(target));
});

// ───────────────────────── WANTED / MISSING PERSONS (admin writes) ─────────────────────────

exports.createPerson = handle(async (req, res) => {
  const type = String(req.body.type || '').toUpperCase();
  if (!['WANTED', 'MISSING'].includes(type)) throw new HttpError(400, 'type must be WANTED or MISSING');
  const image = parseImage(req.body.photo);
  const p = await Person.create({
    id: newId(), type,
    name: text(req.body.name, { max: 200 }),
    age: text(req.body.age, { max: 20, required: false, fallback: 'Unknown' }),
    gender: text(req.body.gender, { max: 30, required: false, fallback: 'Unknown' }),
    address: text(req.body.address, { max: 300, required: false, fallback: 'Unknown' }),
    description: text(req.body.description, { max: 3000, required: false, fallback: 'No description' }),
    contactNumber: text(req.body.contactNumber, { max: 40, required: false }),
    hasImage: !!image,
    ...(image ? { image } : {}),
  });
  await notify(type === 'WANTED'
    ? { recipient: 'ALL', title: 'New wanted person', message: `${p.name} was added to the wanted list.`, type: 'WANTED', refId: p.id }
    : { recipient: 'ALL', title: 'New missing person', message: `${p.name} was reported missing.`, type: 'MISSING', refId: p.id });
  ok(res, pubPerson(p), 201);
});

exports.updatePerson = handle(async (req, res) => {
  const p = await Person.findOne({ id: numId(req.params.id) });
  if (!p) throw new HttpError(404, 'Person not found');
  const b = req.body;
  if (b.name !== undefined) p.name = text(b.name, { max: 200 });
  if (b.age !== undefined) p.age = text(b.age, { max: 20, required: false, fallback: 'Unknown' });
  if (b.gender !== undefined) p.gender = text(b.gender, { max: 30, required: false, fallback: 'Unknown' });
  if (b.address !== undefined) p.address = text(b.address, { max: 300, required: false, fallback: 'Unknown' });
  if (b.description !== undefined) p.description = text(b.description, { max: 3000, required: false, fallback: 'No description' });
  if (b.contactNumber !== undefined) p.contactNumber = text(b.contactNumber, { max: 40, required: false });
  if (b.isFound !== undefined) p.isFound = !!b.isFound;
  const image = parseImage(b.photo);
  if (image) { p.image = image; p.hasImage = true; }
  else if (b.removePhoto) { p.image = undefined; p.hasImage = false; }
  await p.save();
  ok(res, pubPerson(p));
});

exports.deletePerson = handle(async (req, res) => {
  const r = await Person.deleteOne({ id: numId(req.params.id) });
  if (!r.deletedCount) throw new HttpError(404, 'Person not found');
  ok(res, null);
});

// ───────────────────────── DOCUMENT REQUESTS ─────────────────────────

exports.createDocumentRequest = handle(async (req, res) => {
  if (isAdmin(req)) throw new HttpError(403, 'Only citizens can request documents');
  const b = req.body;
  const type = String(b.type || '').toUpperCase();
  if (!DOC_TYPES.includes(type)) throw new HttpError(400, 'Invalid document type');

  const d = {
    id: newId(), type, requestedByUsername: req.user.userId,
    fullName: text(b.fullName, { max: 200 }),
    address: text(b.address, { max: 300 }),
    contactNumber: text(b.contactNumber, { max: 40, required: false }),
    birthDate: text(b.birthDate, { max: 40, required: false }),
    civilStatus: text(b.civilStatus, { max: 40, required: false }),
    purpose: text(b.purpose, { max: 500, required: type !== 'ID' }),
    emergencyContactName: text(b.emergencyContactName, { max: 200, required: type === 'ID' }),
    emergencyContactNumber: text(b.emergencyContactNumber, { max: 40, required: type === 'ID' }),
  };
  const doc = await DocumentRequest.create(d);
  await notify({
    recipient: 'ADMIN', title: `New ${DOC_LABELS[type]} request`,
    message: `${doc.fullName} submitted a ${DOC_LABELS[type]} request.`, type: 'DOCUMENT', refId: doc.id,
  });
  ok(res, pubDocument(doc), 201);
});

exports.updateDocumentStatus = handle(async (req, res) => {
  const status = String(req.body.status || '').toUpperCase();
  if (!['PENDING', 'READY', 'CLAIMED'].includes(status)) throw new HttpError(400, 'Invalid status');
  const d = await DocumentRequest.findOne({ id: numId(req.params.id) });
  if (!d) throw new HttpError(404, 'Request not found');
  d.status = status;
  await d.save();

  const label = DOC_LABELS[d.type];
  if (status === 'READY') {
    await notify({ recipient: d.requestedByUsername, title: `${label} is ready`, message: `Your ${label} is ready for pickup at the barangay office.`, type: 'DOCUMENT', refId: d.id });
  } else if (status === 'CLAIMED') {
    await notify({ recipient: d.requestedByUsername, title: `${label} claimed`, message: `Your ${label} has been marked as claimed.`, type: 'DOCUMENT', refId: d.id });
  }
  ok(res, pubDocument(d));
});

exports.deleteDocumentRequest = handle(async (req, res) => {
  const r = await DocumentRequest.deleteOne({ id: numId(req.params.id) });
  if (!r.deletedCount) throw new HttpError(404, 'Request not found');
  ok(res, null);
});

// ───────────────────────── MESSAGES ─────────────────────────

// Citizen: body { text }  -> goes to their own thread
// Admin:   body { text, threadKey }  -> threadKey is the citizen's userId
exports.sendMessage = handle(async (req, res) => {
  const me = req.user.userId;
  const admin = isAdmin(req);
  const body = text(req.body.text, { max: 2000 });

  let threadKey = me;
  if (admin) {
    threadKey = text(req.body.threadKey, { max: 100 });
    const exists = await User.exists({ userId: threadKey });
    if (!exists) throw new HttpError(404, 'User not found');
  }

  const m = await ChatMessage.create({ id: newId(), threadKey, senderUsername: me, text: body });

  if (admin) {
    await notify({ recipient: threadKey, title: `New message from ${ADMIN_NAME}`, message: body, type: 'MESSAGE', extra: 'admin', coalesce: true });
  } else {
    const name = await displayName(req);
    await notify({ recipient: 'ADMIN', title: `New message from ${name}`, message: body, type: 'MESSAGE', extra: me, coalesce: true });
  }
  ok(res, pubMessage(m), 201);
});

// ───────────────────────── NOTIFICATIONS ─────────────────────────

exports.markNotificationsRead = handle(async (req, res) => {
  await AppNotification.updateMany(
    { ...notificationFilter(req), readBy: { $ne: req.user.userId } },
    { $addToSet: { readBy: req.user.userId } }
  );
  ok(res, null);
});

// ───────────────────────── RESIDENT VERIFICATION (admin only) ─────────────────────────

// Returns the citizen's uploaded ID as base64 JSON (not a raw image route — this is private,
// unlike announcement/person photos which are public).
exports.getIdPhoto = handle(async (req, res) => {
  const userId = req.params.userId;
  const u = await User.findOne({ userId }).select('+idPhoto hasIdPhoto');
  if (!u || !u.hasIdPhoto || !u.idPhoto || !u.idPhoto.data) throw new HttpError(404, 'No ID photo on file');
  ok(res, {
    userId,
    contentType: u.idPhoto.contentType || 'image/jpeg',
    base64: u.idPhoto.data.toString('base64'),
  });
});

// body: { status: "VERIFIED" | "REJECTED" | "PENDING" }
exports.setVerification = handle(async (req, res) => {
  const status = String(req.body.status || '').toUpperCase();
  if (!['PENDING', 'VERIFIED', 'REJECTED'].includes(status)) throw new HttpError(400, 'Invalid status');

  const userId = req.params.userId;
  if (adminIds().includes(userId)) throw new HttpError(400, 'Admin accounts are not verified');

  const u = await User.findOne({ userId });
  if (!u) throw new HttpError(404, 'User not found');

  u.verification = status;
  u.verifiedAt = status === 'PENDING' ? undefined : new Date();
  await u.save();

  if (status === 'VERIFIED') {
    await notify({ recipient: userId, title: 'Residency confirmed', message: 'The barangay has verified your account. You now have full access.', type: 'VERIFICATION' });
  } else if (status === 'REJECTED') {
    await notify({ recipient: userId, title: 'ID verification needed', message: 'Your ID could not be verified. Please visit the barangay office or contact the admin.', type: 'VERIFICATION' });
  }

  ok(res, { userId, verification: u.verification, verifiedAt: u.verifiedAt ? ms(u.verifiedAt) : 0 });
});


// ───────────────────────── PROFILE PHOTO (admin + citizens) ─────────────────────────

// body: { photo: base64 JPEG/PNG (or data: URI) }
exports.setProfilePhoto = handle(async (req, res) => {
  const photo = parseImage(req.body.photo || req.body.image);
  if (!photo) throw new HttpError(400, 'photo is required');
  const u = await User.findOne({ userId: req.user.userId });
  if (!u) throw new HttpError(404, 'User not found');
  u.profilePhoto = photo;
  u.hasProfilePhoto = true;
  u.profilePhotoUpdatedAt = new Date();
  await u.save();
  ok(res, { userId: u.userId, hasProfilePhoto: true, photoUpdatedAt: ms(u.profilePhotoUpdatedAt) });
});

exports.removeProfilePhoto = handle(async (req, res) => {
  const u = await User.findOne({ userId: req.user.userId });
  if (!u) throw new HttpError(404, 'User not found');
  u.profilePhoto = undefined;
  u.hasProfilePhoto = false;
  u.profilePhotoUpdatedAt = new Date();
  await u.save();
  ok(res, { userId: u.userId, hasProfilePhoto: false, photoUpdatedAt: ms(u.profilePhotoUpdatedAt) });
});
