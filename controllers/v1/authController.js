const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../../models/User');
const Role = require('../../models/Role');

const nodemailer = require('nodemailer');
const otpStorage = new Map();
const expiresAt = Date.now() + 5 * 60 * 1000;

// 1. Configure the transporter
// Set GMAIL_USER and GMAIL_APP_PASSWORD (a Google "App Password") in the environment
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

// Password-recovery codes: userId -> { otp, expiresAt, attempts }
const recoverCodes = new Map();
const adminIds = () => (process.env.ADMIN_USER_IDS || 'admin').split(',').map(s => s.trim()).filter(Boolean);

async function sendOTP(recipientEmail) {
  const otp = Math.floor(100000 + Math.random() * 900000).toString(); // Generate 6-digit OTP
  otpStorage.set(recipientEmail, { otp, expiresAt });
  const mailOptions = {
    from: process.env.GMAIL_USER,
    to: recipientEmail,
    subject: 'Your Verification Code',
    html: `<h3>Your OTP is: <b>${otp}</b></h3><p>It will expire in 5 minutes.</p>`
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`OTP sent successfully to ${recipientEmail}`);
    return otp; // Return this to store in your DB/session for later verification
  } catch (error) {
    console.error("Error sending email:", error);
  }
}


// helpers
const generateAccessToken = async (user) => {
  // Get roles where user is a member
  const roles = await Role.find({ members: user.userId }).select('roleId');

  const roleIds = roles.map(r => r.roleId);

  return jwt.sign(
    { id: user._id, userId: user.userId, roles: roleIds },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '60m' }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user._id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
};

// ======================
// SIGNUP
// ======================
const MAX_ID_PHOTO_BYTES = 2 * 1024 * 1024;

// "data:image/jpeg;base64,...." or plain base64 -> { data: Buffer, contentType }
function parseIdPhoto(input) {
  if (!input) return null;
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(String(input));
  const buf = Buffer.from(m ? m[2] : String(input), 'base64');
  if (!buf.length) return null;
  if (buf.length > MAX_ID_PHOTO_BYTES) {
    const err = new Error('ID photo is larger than 2 MB');
    err.statusCode = 400;
    throw err;
  }
  return { data: buf, contentType: m ? m[1] : 'image/jpeg' };
}

exports.signup = async (req, res) => {
  try {
    const { id, password, adminKey } = req.body;
    // The Android app sends "userdata" / "userlink"; also accept "data" / "link"
    const link = req.body.link ?? req.body.userlink ?? {};
    const data = req.body.data ?? req.body.userdata ?? {};
    const isAdminAccount = adminIds().includes(String(id));

    if (!id || !password || typeof link !== 'object' || typeof data !== 'object') {
      return res.status(400).json({
        success: false,
        message: "id and password are required",
        error: null,
        meta: null,
        data: null,
      });
    }

    // Admin ids can only be created with the secret setup key, so nobody else can claim "admin"
    if (isAdminAccount) {
      if (!process.env.ADMIN_SETUP_KEY || adminKey !== process.env.ADMIN_SETUP_KEY) {
        return res.status(403).json({
          success: false,
          message: "This account id is reserved",
          error: null,
          meta: null,
          data: null,
        });
      }
    }


    // Citizens must upload a valid ID so the admin can confirm they're a barangay resident.
    // The admin account itself has no ID to verify. Checked before the DB lookup below since
    // it's a cheap, purely local validation.
    let idPhoto = null;
    if (!isAdminAccount) {
      idPhoto = parseIdPhoto(req.body.idPhoto);
      if (!idPhoto) {
        return res.status(400).json({
          success: false,
          message: "A valid ID photo is required to sign up",
          error: null,
          meta: null,
          data: null,
        });
      }
    }

    const existingUser = await User.findOne({ userId: id });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Accout already exist",
        error: null,
        meta: null,
        data: null,
      });
    }

    const user = new User({
      userId: id,
      userPasswordHash: password, // will be hashed by pre-save hook
      userLink: link instanceof Map ? link : new Map(Object.entries(link)),
      userData: data instanceof Map ? data : new Map(Object.entries(data)),
      mfa: false,
      status: 'active',
      ...(idPhoto ? { idPhoto, hasIdPhoto: true } : {}),
      // Admin accounts don't go through residency verification
      verification: isAdminAccount ? 'VERIFIED' : 'PENDING',
    });

    await user.save();

    res.status(201).json({
      success: true,
      message: "Signup Successful",
      error: null,
      meta: null,
      data: null,
    });

  } catch (err) {
    console.log(err);
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.statusCode ? err.message : err,
      error: null,
      meta: null,
      data: null,
    });
  }
};

// ======================
// LOGIN
// ======================
exports.login = async (req, res) => {
  try {
    const { id, password, linkkey = null, otp = null } = req.body;

    const user = await User.findOne({ userId: id });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        error: null,
        meta: null,
        data: null,
      });
    }

    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: "User not active",
        error: null,
        meta: null,
        data: null,
      });;
    }

    const isMatch = await bcrypt.compare(password, user.userPasswordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
        error: null,
        meta: null,
        data: null,
      });
    }

    // A rejected ID means the account is permanently blocked -- not just "pending access" in the
    // app, but refused at login entirely. Admin accounts never go through this check.
    if (!adminIds().includes(String(id)) && user.verification === 'REJECTED') {
      return res.status(403).json({
        success: false,
        message: "Your account was rejected by the barangay and can no longer be used. Please contact the barangay office.",
        error: null,
        meta: null,
        data: null,
      });
    }

    // Blocked for a while after repeated violations (4th strike: 7 days, 5th and more: 30 days).
    if (!adminIds().includes(String(id)) && user.blockedUntil && user.blockedUntil.getTime() > Date.now()) {
      const until = new Date(user.blockedUntil).toLocaleString('en-PH', {
        timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      });
      return res.status(403).json({
        success: false,
        message: `Your account is blocked until ${until} because of repeated violations of the community rules. Please contact the barangay office if you have questions.`,
        error: null,
        meta: null,
        data: null,
      });
    }

    let userLink;
    if (linkkey) {
      userLink = user.userLink.get(linkkey);
    }
    // MFA check (basic placeholder)
    if (user.mfa && !userLink) {
      return res.status(401).json({
        success: false,
        message: "MFA required",
        error: null,
        meta: null,
        data: null,
      });
    }
    if (user.mfa && userLink) {
      if (!otp) {
        const otpCode = sendOTP(userLink);
        if (mfa !== otpCode) {
          return res.status(401).json({
            success: false,
            message: "Invalid MFA code",
            error: null,
            meta: null,
            data: null,
          });
        }
      } else {
        const storedData = otpStorage.get(userLink);
        // 3. Check if the OTP has expired
        if (Date.now() > storedData.expiresAt) {
          otpStorage.delete(userLink); // Clean up the expired OTP
          return res.status(401).json({ error: 'OTP has expired. Please request a new one.' });
        }

        // 4. Verify if the provided OTP matches the stored OTP
        if (storedData.otp !== otp) {
          return res.status(401).json({ error: 'Invalid OTP. Please try again.' });
        }

        // 5. Success! Delete the OTP to prevent reuse
        otpStorage.delete(userLink);
      }
    }

    const accessToken = await generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    await User.updateOne({ _id: user._id }, { $set: { lastLogin: new Date() } });

    res.status(201).json({
      success: true,
      message: "Login Successful",
      error: null,
      meta: null,
      data: {
        accessToken,
        refreshToken,
      },
    });
  } catch (err) {
    console.error('LOGIN ERROR:', err);
    res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
      error: err.toString(),
      meta: null,
      data: null,
    });
  }
};

// ======================
// REFRESH TOKEN
// ======================
exports.refreshToken = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    console.log(user);

    const newAccessToken = await generateAccessToken(user);

    res.status(201).json({
      success: true,
      message: "Token refresh successful",
      error: null,
      meta: null,
      data: {
        accessToken: newAccessToken
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err,
      meta: null,
      data: null,
    });
  }
};

// ======================
// MFA (enable/verify)
// ======================
exports.mfa = async (req, res) => {
  try {
    const { enable } = req.body;

    const user = await User.findById(req.user.id);

    user.mfa = enable;
    await user.save();

    res.json({
      success: true,
      message: `MFA ${enable ? 'enabled' : 'disabled'}`,
      error: null,
      meta: null,
      data: null,
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err,
      meta: null,
      data: null,
    });
  }
};

// ======================
// SESSIONS (basic)
// ======================
exports.sessions = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    res.json({
      success: true,
      message: "Session View",
      error: null,
      meta: null,
      data: {
        userId: user.userId,
        lastLogin: user.lastLogin,
        status: user.status
      },
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err,
      meta: null,
      data: null,
    });
  }
};

// ======================
// RECOVER (email code)
// Step 1: POST /auths/recover/request  { email }  -> emails a 6-digit code to that Gmail
// Step 2: POST /auths/recover          { email, otp, newPassword }
// The password can only be changed after the code emailed in step 1 is entered correctly.
// ======================
const genericRecoverReply = {
  success: true,
  message: "If that Gmail is registered, a code was sent to it.",
  error: null,
  meta: null,
  data: null,
};

exports.recoverRequest = async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      return res.status(503).json({ success: false, message: "Email is not configured on the server", error: null, meta: null, data: null });
    }
    // Same answer whether or not the account exists (no user enumeration)
    if (!email) return res.json(genericRecoverReply);

    // userData is a Map, so search the saved Gmail inside it
    const user = await User.findOne({ 'userData.email': email });
    if (!user || adminIds().includes(String(user.userId))) return res.json(genericRecoverReply);

    const userId = user.userId;
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    recoverCodes.set(userId, { otp, expiresAt: Date.now() + 10 * 60 * 1000, attempts: 0 });
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'Barangay 201 password reset code',
      html: `<h3>Your reset code is: <b>${otp}</b></h3><p>It expires in 10 minutes. If you did not ask for this, ignore this email.</p>`
    });
    res.json(genericRecoverReply);
  } catch (err) {
    console.error('RECOVER REQUEST ERROR:', err);
    res.status(500).json({ success: false, message: "Could not send the code", error: null, meta: null, data: null });
  }
};

exports.recover = async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const { otp, newPassword } = req.body;
    const fail = (status, message) =>
      res.status(status).json({ success: false, message, error: null, meta: null, data: null });

    if (!email || !otp || !newPassword) return fail(400, "email, otp and newPassword are required");

    // Find the account by the Gmail saved at sign-up
    const account = await User.findOne({ 'userData.email': email });
    if (!account) return fail(400, "Code is invalid or expired");
    const userId = account.userId;

    if (adminIds().includes(String(userId))) return fail(403, "This account cannot be recovered here");

    const entry = recoverCodes.get(userId);
    if (!entry || Date.now() > entry.expiresAt) {
      recoverCodes.delete(userId);
      return fail(400, "Code is invalid or expired");
    }
    entry.attempts += 1;
    if (entry.attempts > 5) {
      recoverCodes.delete(userId);
      return fail(429, "Too many wrong codes. Request a new one.");
    }
    if (entry.otp !== String(otp)) return fail(400, "Code is invalid or expired");

    const user = await User.findOne({ userId });
    if (!user) return fail(404, "User not found");

    recoverCodes.delete(userId);
    user.userPasswordHash = newPassword; // will be hashed by pre-save hook
    await user.save();

    res.json({
      success: true,
      message: "Password recovery successful",
      error: null,
      meta: null,
      data: null,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err,
      meta: null,
      data: null,
    });
  }
};
