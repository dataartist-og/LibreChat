const path = require('path');
const net = require('net');
const mongoose = require('mongoose');
const { User } = require('@librechat/data-schemas').createModels(mongoose);
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { askQuestion, silentExit } = require('./helpers');

const BAN_KEY_PATTERNS = ['BANS:', 'ban:', 'non_browser:', 'NON_BROWSER:'];

function canConnect(host, port, timeout = 1000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });

    const done = (ok) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(timeout);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function resolveMongoUri() {
  if (process.env.MONGO_URI) {
    try {
      const configured = new URL(process.env.MONGO_URI);
      const configuredHost = configured.hostname || '127.0.0.1';
      const configuredPort = configured.port ? parseInt(configured.port, 10) : 27017;
      if (await canConnect(configuredHost, configuredPort)) {
        return process.env.MONGO_URI;
      }
    } catch (error) {
      // Ignore malformed configured URI and proceed to known local fallbacks.
    }
  }

  const primary = 'mongodb://127.0.0.1:27018/LibreChat';
  const fallback = 'mongodb://127.0.0.1:27017/LibreChat';

  if (await canConnect('127.0.0.1', 27018)) {
    return primary;
  }

  if (await canConnect('127.0.0.1', 27017)) {
    return fallback;
  }

  return primary;
}

async function connectWithResolvedMongoUri() {
  const mongoUri = await resolveMongoUri();
  console.orange('Warming up the engines...');
  console.gray(`Using Mongo URI: ${mongoUri}`);

  const opts = {
    bufferCommands: false,
  };

  await mongoose.connect(mongoUri, opts);
}

function buildBanKeyRegex(targets) {
  const escapedTargets = targets.map((target) => target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const joinedTargets = escapedTargets.join('|');
  return new RegExp(`^(${BAN_KEY_PATTERNS.join('|')})(${joinedTargets})$`);
}

async function resolveTarget() {
  let rawTarget = process.argv[2]?.trim();

  if (!rawTarget) {
    rawTarget = (await askQuestion('Email or User ID:')).trim();
  }

  if (!rawTarget) {
    console.red('Error: Email or User ID is required.');
    silentExit(1);
  }

  if (rawTarget.includes('@')) {
    const user = await User.findOne({ email: rawTarget }, '_id email').lean();
    if (!user) {
      console.red('Error: No user found with that email.');
      silentExit(1);
    }
    return {
      userId: user._id.toString(),
      email: user.email,
      input: rawTarget,
    };
  }

  const user = await User.findById(rawTarget, '_id email').lean();
  if (!user) {
    console.red('Error: No user found with that ID.');
    silentExit(1);
  }

  return {
    userId: user._id.toString(),
    email: user.email,
    input: rawTarget,
  };
}

(async () => {
  await connectWithResolvedMongoUri();

  console.purple('------------------------');
  console.purple('Unban a user account');
  console.purple('------------------------');

  const { userId, email } = await resolveTarget();
  const logs = mongoose.connection.db.collection('logs');

  const targets = [userId, '127.0.0.1'];
  const keyRegex = buildBanKeyRegex(targets);

  const matching = await logs.find({ key: { $regex: keyRegex } }, { projection: { key: 1 } }).toArray();

  if (matching.length === 0) {
    console.orange(`No active ban/non-browser keys found for ${email} (${userId}).`);
    silentExit(0);
  }

  const deleteResult = await logs.deleteMany({ key: { $regex: keyRegex } });

  console.green(
    `Removed ${deleteResult.deletedCount} key(s) for ${email} (${userId}). User should be able to log in now.`,
  );
  matching.forEach((doc) => console.gray(`- ${doc.key}`));

  silentExit(0);
})();

process.on('uncaughtException', (err) => {
  console.error('There was an uncaught error:');
  console.error(err);
  process.exit(1);
});
